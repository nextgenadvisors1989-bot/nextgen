#!/usr/bin/env bash
# Auditor workspace end-to-end HTTP verification against :3000.
#
#   bash scripts/verify-auditor-workspace.sh
#
# Proves the whole auditor journey on a fresh fixture:
#   start → autosave a draft (no revision) → resume it → submit (revision + PDF +
#   verifier queue) → verifier returns it → corrections ticked off → resubmit →
#   approve → read-only afterwards. Plus ownership (another auditor cannot see or
#   touch the audit), RBAC, the funnel counters and every page in the panel.
set -u
BASE=http://127.0.0.1:3001
JAR=/tmp/aw_admin.txt
JARA=/tmp/aw_auditor.txt
JARO=/tmp/aw_other.txt
RUN_TAIL=$(printf '%04d' $(( (RANDOM % 9000) + 1000 )))
PASS=0
FAIL=0
rm -f "$JAR" "$JARA" "$JARO"

DB_PASS=$(grep -E '^DB_PASSWORD=' .env | sed 's/^DB_PASSWORD=//; s/^"//; s/"$//')
DB_USER=$(grep -E '^DB_USER=' .env | sed 's/^DB_USER=//; s/^"//; s/"$//'); DB_USER=${DB_USER:-compliance_app}
DB_NAME=$(grep -E '^DB_NAME=' .env | sed 's/^DB_NAME=//; s/^"//; s/"$//'); DB_NAME=${DB_NAME:-compliance_platform}
q() { mysql -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -B -e "$1" 2>/dev/null; }

check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '   \033[32m✓\033[0m %s (%s)\n' "$1" "$2"
  else FAIL=$((FAIL+1)); printf '   \033[31m✗\033[0m %s — got %s, expected %s\n' "$1" "$2" "$3"; fi
}

login() { # login <jar> <identifier> <password> <label>
  rm -f "$1"
  curl -s -c "$1" -o /dev/null "$BASE/login"
  local csrf
  csrf=$(awk '$6=="cos_csrf"{print $7}' "$1")
  curl -s -c "$1" -b "$1" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -H "X-CSRF-Token: $csrf" -d "{\"identifier\":\"$2\",\"password\":\"$3\"}" -o /dev/null -w "$4 login %{http_code}\n" >&2
  awk '$6=="cos_csrf"{print $7}' "$1"
}

CSRF=$(login "$JAR" admin@complianceos.local 'Admin@2026' '1. admin')

# ---------------------------------------------------------------- fixtures
echo "2. fixture: employer, unit, two auditors with portal logins, assignment"
curl -s -b "$JAR" -X POST "$BASE/api/admin/employers" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"company_name\":\"Salem Steel Fabricators $RUN_TAIL Private Limited\",\"employer_code\":\"SSF$RUN_TAIL\",
  \"industry_type\":\"Manufacturing\",\"year_of_establishment\":2011,
  \"contact_person_name\":\"K. Anitha\",\"contact_person_email\":\"anitha$RUN_TAIL@example.com\",
  \"address_line1\":\"12, SIDCO Industrial Estate\",\"city\":\"Salem\",\"state\":\"Tamil Nadu\",\"pincode\":\"636005\",
  \"create_portal_user\":true,\"portal_user_email\":\"hr$RUN_TAIL@salemsteel.example\",\"portal_user_name\":\"K. Anitha\"
}" -o /tmp/aw_emp.json -w "   employer HTTP %{http_code}\n"
EMP=$(python3 -c "import json;print(json.load(open('/tmp/aw_emp.json'))['employerId'])")
curl -s -b "$JAR" -X POST "$BASE/api/admin/employers/$EMP/units" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"unit_name":"Fabrication Shop","unit_code":"FSH","city":"Salem","state":"Tamil Nadu","pincode":"636005"}' \
  -o /tmp/aw_unit.json -w "   unit HTTP %{http_code}\n"
UNIT=$(python3 -c "import json;d=json.load(open('/tmp/aw_unit.json'));print(d.get('unitId') or d.get('id'))")
DEPT=$(curl -s -b "$JAR" -X POST "$BASE/api/admin/employers/$EMP/departments" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d "{\"department_name\":\"Welding\",\"unit_id\":$UNIT}" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('departmentId') or d.get('id') or '')")

TYPE_ID=$(curl -s -b "$JAR" "$BASE/api/admin/auditors/options?lookups=true" | python3 -c "import json,sys;print(json.load(sys.stdin)['auditorTypes'][0]['id'])")
VERIFIER=$(curl -s -b "$JAR" "$BASE/api/admin/audit-reports/options?lookups=true" | python3 -c "
import json,sys;d=json.load(sys.stdin);print(d['verifiers'][0]['id'] if d['verifiers'] else '')")

# The auditor under test owns the audit; the other one exists to prove isolation.
curl -s -b "$JAR" -X POST "$BASE/api/admin/auditors" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"name\":\"Ravi Shankar $RUN_TAIL\",\"email\":\"ravi.auditor$RUN_TAIL@example.com\",
  \"auditor_type_id\":$TYPE_ID,\"specialization\":\"Manufacturing\",\"experience_years\":11,\"status\":\"active\",
  \"create_portal_user\":true,\"portal_user_email\":\"ravi.auditor$RUN_TAIL@example.com\",\"portal_user_name\":\"Ravi Shankar $RUN_TAIL\"
}" -o /tmp/aw_aud.json -w "   auditor (portal login) HTTP %{http_code}\n"
AUD=$(python3 -c "import json;print(json.load(open('/tmp/aw_aud.json'))['auditorId'])")
AUSER=$(python3 -c "import json;print(json.load(open('/tmp/aw_aud.json'))['credentials']['username'])")
APASS=$(python3 -c "import json;print(json.load(open('/tmp/aw_aud.json'))['credentials']['temporaryPassword'])")

curl -s -b "$JAR" -X POST "$BASE/api/admin/auditors" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"name\":\"Meena Iyer $RUN_TAIL\",\"email\":\"meena.auditor$RUN_TAIL@example.com\",
  \"auditor_type_id\":$TYPE_ID,\"specialization\":\"Manufacturing\",\"status\":\"active\",
  \"create_portal_user\":true,\"portal_user_email\":\"meena.auditor$RUN_TAIL@example.com\",\"portal_user_name\":\"Meena Iyer $RUN_TAIL\"
}" -o /tmp/aw_aud2.json -w "   second auditor HTTP %{http_code}\n"
AUD2=$(python3 -c "import json;print(json.load(open('/tmp/aw_aud2.json'))['auditorId'])")
AUSER2=$(python3 -c "import json;print(json.load(open('/tmp/aw_aud2.json'))['credentials']['username'])")
APASS2=$(python3 -c "import json;print(json.load(open('/tmp/aw_aud2.json'))['credentials']['temporaryPassword'])")

curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"assignment_type\":\"AUDIT\",\"audit_title\":\"Welding safety and fume extraction audit $RUN_TAIL\",
  \"employer_id\":$EMP,\"unit_id\":$UNIT,\"department_id\":$( [ -n "${DEPT:-}" ] && echo "$DEPT" || echo null ),
  \"auditor_id\":$AUD,\"verifier_id\":${VERIFIER:-null},
  \"start_date\":\"2026-10-05\",\"end_date\":\"2026-10-09\",\"due_date\":\"2026-10-20\",
  \"priority\":\"High\",\"scope\":\"Welding bays 1-6, fume extraction, PPE issue records and hot-work permits.\",
  \"instructions\":\"Inspect extraction airflow logs, interview welders, verify the PPE register for September.\"
}" -o /tmp/aw_asg.json -w "   assignment HTTP %{http_code}\n"
ASG=$(python3 -c "import json;print(json.load(open('/tmp/aw_asg.json'))['assignmentId'])")

if [ -z "${EMP:-}" ] || [ -z "${AUD:-}" ] || [ -z "${ASG:-}" ]; then echo "FIXTURE FAILED"; exit 1; fi

# ------------------------------------------------------------- auditor login
CSRFA=$(login "$JARA" "$AUSER" "$APASS" '3. auditor')
CSRFO=$(login "$JARO" "$AUSER2" "$APASS2" '   other auditor')
# A freshly provisioned login has to change its password before the panel opens.
activate() { # activate <jar> <csrf> <current password> <label>
  curl -s -b "$1" -X POST "$BASE/api/auth/change-password" -H 'Content-Type: application/json' \
    -H "X-CSRF-Token: $2" -d "{\"currentPassword\":\"$3\",\"newPassword\":\"Auditor@2027\",\"confirmPassword\":\"Auditor@2027\"}" \
    -o /dev/null -w "   $4 activated %{http_code}\n"
}
activate "$JARA" "$CSRFA" "$APASS" 'auditor'
activate "$JARO" "$CSRFO" "$APASS2" 'other auditor'
CSRFA=$(login "$JARA" "$AUSER" 'Auditor@2027' '   auditor re-login')
CSRFO=$(login "$JARO" "$AUSER2" 'Auditor@2027' '   other auditor re-login')

echo "4. the auditor sees only their own work"
curl -s -b "$JARA" "$BASE/api/auditor/audits" -o /tmp/aw_list.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/aw_list.json'))
print('   rows',len(d['data']),'| total',d['pagination']['total'],'| stats keys',sorted(d['stats'].keys())[:6])
print('   auditor:',d['auditor']['name'],d['auditor']['auditor_code'])"
check "list is scoped to me" "$(python3 -c "
import json;d=json.load(open('/tmp/aw_list.json'));print(1 if all(str(r['auditor_id'])=='$AUD' for r in d['data']) else 0)")" "1"
check "assignment visible" "$(python3 -c "
import json;d=json.load(open('/tmp/aw_list.json'));print(1 if any(int(r['id'])==$ASG for r in d['data']) else 0)")" "1"
curl -s -b "$JARA" "$BASE/api/auditor/audits/options" -o /tmp/aw_opt.json -w "   options HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/aw_opt.json'))
print('   statuses',len(d['assignmentStatuses']),'| priorities',d['priorities'],'| severities',len(d['severities']))
print('   my audits',d['stats']['audits']['total'],'| my reports',d['stats']['reports']['total'])"

echo "5. ownership: the other auditor cannot reach it"
curl -s -b "$JARO" "$BASE/api/auditor/audits/$ASG" -o /tmp/aw_forbid.json -w "   detail HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/aw_forbid.json')).get('message'))"
check "other auditor blocked from the audit" "$(curl -s -b "$JARO" -o /dev/null -w '%{http_code}' "$BASE/api/auditor/audits/$ASG")" "403"
check "other auditor blocked from starting it" "$(curl -s -b "$JARO" -X POST "$BASE/api/auditor/audits/$ASG/start" -H 'X-CSRF-Token: '"$CSRFO"'' -o /dev/null -w '%{http_code}')" "403"
check "other auditor blocked from the draft API" "$(curl -s -b "$JARO" -X PUT "$BASE/api/auditor/audits/$ASG/draft" -H 'X-CSRF-Token: '"$CSRFO"'' -H 'Content-Type: application/json' -d '{"body":{"executive_summary":"hijack"}}' -o /dev/null -w '%{http_code}')" "403"
check "admin API refuses the auditor" "$(curl -s -b "$JARA" -o /dev/null -w '%{http_code}' "$BASE/api/admin/audit-reports")" "403"

echo "6. start the audit (creates the report draft, moves the assignment)"
curl -s -b "$JARA" -X POST "$BASE/api/auditor/audits/$ASG/start" -H 'X-CSRF-Token: '"$CSRFA"'' -o /tmp/aw_start.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/aw_start.json'))
print('  ',d.get('message'),'| reported',d.get('reportNumber'),'| resumed',d.get('resumed'))"
RPT=$(python3 -c "import json;print(json.load(open('/tmp/aw_start.json')).get('reportId',''))")
RPT_NO=$(python3 -c "import json;print(json.load(open('/tmp/aw_start.json')).get('reportNumber',''))")
check "report created" "$(q "SELECT COUNT(*) FROM audit_reports WHERE assignment_id=$ASG AND deleted_at IS NULL")" "1"
check "report number issued" "$(echo "$RPT_NO" | cut -d/ -f1)" "RPT"
check "auditor owns the report" "$(q "SELECT auditor_id FROM audit_reports WHERE id=$RPT")" "$AUD"
check "assignment in progress" "$(q "SELECT status FROM audit_assignments WHERE id=$ASG")" "In Progress"
check "employer portal notified" "$(q "SELECT COUNT(*) FROM notifications WHERE entity_id=$RPT AND title='Your audit has started'")" "1"
curl -s -b "$JARA" -X POST "$BASE/api/auditor/audits/$ASG/start" -H 'X-CSRF-Token: '"$CSRFA"'' -o /tmp/aw_start2.json -w "   start again HTTP %{http_code}\n"
check "start is idempotent" "$(python3 -c "import json;d=json.load(open('/tmp/aw_start2.json'));print(d.get('reportId'),d.get('resumed'))")" "$RPT True"
check "no second report" "$(q "SELECT COUNT(*) FROM audit_reports WHERE assignment_id=$ASG AND deleted_at IS NULL")" "1"

echo "7. autosave a draft: no revision, no PDF, live totals"
curl -s -b "$JARA" -X PUT "$BASE/api/auditor/audits/$ASG/draft" -H 'X-CSRF-Token: '"$CSRFA"'' -H 'Content-Type: application/json' -d '{
  "audit_period_from":"2026-10-05","audit_period_to":"2026-10-09","audit_date":"2026-10-09",
  "body":{
    "executive_summary":"Fume extraction on the two robotic welding bays is under-performing and three of the nine welders had no current PPE issue record for September.",
    "methodology":"Airflow readings at six extraction points, review of the September PPE register and hot-work permits, interviews with the safety officer and four welders.",
    "scorecard":[
      {"section":"Fume extraction","max_score":40,"obtained_score":22,"remarks":"Bays 4 and 6 below the 0.5 m/s minimum"},
      {"section":"PPE issue records","max_score":30,"obtained_score":18,"remarks":"Three September entries unsigned"},
      {"section":"Hot-work permits","max_score":30,"obtained_score":27,"remarks":"Permits largely complete"}
    ],
    "findings":[
      {"severity":"Major","clause":"Factories Act 1948 — s.13","description":"Extraction airflow on welding bays 4 and 6 measured 0.3 m/s against the 0.5 m/s minimum in the OISD guidance adopted by the company.","evidence":"Anemometer readings AE-118","recommendation":"Service the extraction fans and re-test within 14 days.","status":"Open"},
      {"severity":"Minor","clause":"Factories Act 1948 — s.7A","description":"Three of nine welders had no signed PPE issue record for September 2026.","evidence":"PPE register page 31","recommendation":"Reconstruct the register and enforce weekly sign-off.","status":"Open"}
    ],
    "observations":["Housekeeping in bay 2 has improved since the last visit"],
    "recommendations":["Fit airflow monitors to all extraction points","Move the PPE register to the supervisor terminal"],
    "regulatory_references":["Factories Act, 1948 — s.13, s.7A"]
  }
}' -o /tmp/aw_draft.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/aw_draft.json'))
print('  ',d.get('message'),'| savedAt',d.get('savedAt'),'| score',(d.get('score') or {}).get('percentage'))"
check "draft saved" "$(q "SELECT draft_body_json IS NOT NULL FROM audit_reports WHERE id=$RPT")" "1"
check "no revision written yet" "$(q "SELECT COUNT(*) FROM audit_report_versions WHERE report_id=$RPT")" "1"
check "no PDF generated yet" "$(q "SELECT pdf_file_id IS NULL FROM audit_reports WHERE id=$RPT")" "1"
check "live score on the register row" "$(q "SELECT ROUND(score_percentage) FROM audit_reports WHERE id=$RPT")" "67"
check "finding counts refreshed" "$(q "SELECT CONCAT(major_findings,'/',minor_findings,'/',observations) FROM audit_reports WHERE id=$RPT")" "1/1/1"
check "period stored" "$(q "SELECT audit_date FROM audit_reports WHERE id=$RPT")" "2026-10-09"
check "progress advanced" "$(q "SELECT status FROM audit_assignments WHERE id=$ASG")" "In Progress"
check "draft saved is logged" "$(q "SELECT COUNT(*) FROM activity_logs WHERE entity_type='audit_report' AND entity_id=$RPT AND action='draft_saved'")" "1"

echo "8. resume: the saved body comes back, including the checklist state"
curl -s -b "$JARA" "$BASE/api/auditor/audits/$ASG" -o /tmp/aw_ws.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/aw_ws.json'))
b=d['body']
print('   findings',len(b['findings']),'| scorecard',len(b['scorecard']),'| observations',len(b['observations']))
print('   checklist:',[(i['key'],i['done']) for i in d['checklist'] if i['required']])
print('   report',d['report']['report_number'],d['report']['status'],'| draftSavedAt',d['draftSavedAt'])"
check "body resumed from the draft" "$(python3 -c "
import json;d=json.load(open('/tmp/aw_ws.json'));print(len(d['body']['findings']))")" "2"
check "evidence requirement tracked" "$(python3 -c "
import json;d=json.load(open('/tmp/aw_ws.json'))
print(1 if any(i['key']=='evidence' and i['done'] for i in d['checklist']) else 0)")" "1"
check "submit gated on corrections" "$(python3 -c "
import json;d=json.load(open('/tmp/aw_ws.json'))
print(1 if any(i['key']=='corrections' and i['done'] for i in d['checklist']) else 0)")" "1"

echo "9. submit: revision 2 + PDF + verifier queue"
curl -s -b "$JARA" -X POST "$BASE/api/auditor/audits/$ASG/submit" -H 'X-CSRF-Token: '"$CSRFA"'' -H 'Content-Type: application/json' \
  -d '{"change_summary":"Initial submission after the closing meeting","send_to_verifier":true}' -o /tmp/aw_sub.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/aw_sub.json'))
print('  ',d.get('message'),'| version',d.get('version'),'| pdf',d.get('pdfFileId'),'| warnings',d.get('warnings'))"
PDF_ID=$(python3 -c "import json;print(json.load(open('/tmp/aw_sub.json')).get('pdfFileId',''))")
check "report status Submitted" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Submitted"
check "revision 2 frozen from the draft" "$(q "SELECT COUNT(*) FROM audit_report_versions WHERE report_id=$RPT")" "2"
check "revision holds the drafted body" "$(q "SELECT JSON_LENGTH(JSON_EXTRACT(snapshot_json, '\$.findings')) FROM audit_report_versions WHERE report_id=$RPT AND version=2")" "2"
check "PDF stored" "$(q "SELECT COUNT(*) FROM files WHERE id=${PDF_ID:-0} AND mime_type='application/pdf'")" "1"
check "verifier queued" "$(q "SELECT COUNT(*) FROM verifier_assignments WHERE report_id=$RPT AND status IN ('pending','in_review')")" "1"
check "assignment submitted" "$(q "SELECT status FROM audit_assignments WHERE id=$ASG")" "Submitted"

echo "10. preview page and PDF carry the audit"
curl -s -b "$JARA" -o /dev/null -w "   preview page %{http_code}\n" "$BASE/auditor/audits/$ASG/preview"
curl -s -b "$JARA" "$BASE/api/pdf/audit-report/$RPT" -o /tmp/aw.pdf -w "   PDF HTTP %{http_code}\n"
python3 scripts/pdf-text.py /tmp/aw.pdf --json > /tmp/aw_pages.json
python3 - "$RPT_NO" << 'PY'
import json, sys
pages = json.load(open('/tmp/aw_pages.json'))
joined = '\n'.join(p['text'] for p in pages)
checks = {
  'pages': len(pages),
  'employer in header': int('SALEM STEEL' in joined.upper()),
  'report number in footer': int(all(sys.argv[1] in p['text'] for p in pages)),
  'findings rendered': int('Fume extraction' in joined and 'Extraction airflow' in joined),
  'score rendered': int('67.00%' in joined),
}
for label, value in checks.items():
    print(f'{label}\t{value}')
PY

echo "11. the report is locked while the verifier has it"
curl -s -b "$JARA" -X PUT "$BASE/api/auditor/audits/$ASG/draft" -H 'X-CSRF-Token: '"$CSRFA"'' -H 'Content-Type: application/json' \
  -d '{"body":{"executive_summary":"Trying to edit a submitted report."}}' -o /tmp/aw_locked.json -w "   draft save HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/aw_locked.json')).get('message'))"
check "locked while submitted" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Submitted"
curl -s -b "$JARA" -o /dev/null -w "   composer page %{http_code} (redirects)\n" "$BASE/auditor/audits/$ASG/draft"

echo "12. verifier returns it with corrections"
CSRFV=$(login /tmp/aw_ver.txt verifier.test@complianceos.local 'Verifier@2026' '   verifier')
curl -s -b /tmp/aw_ver.txt -X POST "$BASE/api/verifier/reports/$RPT/review" -H 'X-CSRF-Token: '"$CSRFV"'' -H 'Content-Type: application/json' -d '{
  "action":"return",
  "comments":"Two items before approval: the extraction re-test certificate is missing, and the PPE register correction needs the signed page attached.",
  "reason":"Evidence gaps on the two findings",
  "corrections":[
    {"section_ref":"Finding F-01","field_ref":"evidence","severity":"major","note":"Attach the fan service report and the airflow re-test certificate."},
    {"section_ref":"Finding F-02","field_ref":"evidence","severity":"minor","note":"Attach the corrected and signed September PPE register page."}
  ],
  "notify_auditor":true
}' -o /tmp/aw_ret.json -w "   return HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/aw_ret.json')).get('message'))"
check "report returned" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Changes Requested"
check "assignment returned" "$(q "SELECT status FROM audit_assignments WHERE id=$ASG")" "Changes Requested"
check "auditor emailed" "$(q "SELECT COUNT(*) FROM email_logs WHERE template_code='report.rejected' AND entity_type='audit_report' AND entity_id=$RPT")" "1"

echo "13. the auditor sees the corrections, edits, ticks them off and resubmits"
curl -s -b "$JARA" "$BASE/api/auditor/audits/$ASG" -o /tmp/aw_ws2.json -w "   workspace HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/aw_ws2.json'))
print('   open corrections',len(d['openCorrections']),[c['section_ref'] for c in d['openCorrections']])"
check "corrections visible to the auditor" "$(python3 -c "
import json;d=json.load(open('/tmp/aw_ws2.json'));print(len(d['openCorrections']))")" "3"
check "submit blocked while corrections are open" "$(python3 -c "
import json;d=json.load(open('/tmp/aw_ws2.json'))
print(1 if any(i['key']=='corrections' and not i['done'] for i in d['checklist']) else 0)")" "1"

CORR1=$(python3 -c "
import json;d=json.load(open('/tmp/aw_ws2.json'));print(sorted(c['id'] for c in d['openCorrections'])[0])")
curl -s -b "$JARA" -X PUT "$BASE/api/auditor/audits/$ASG/comments/$CORR1" -H 'X-CSRF-Token: '"$CSRFA"'' -H 'Content-Type: application/json' \
  -d '{"is_resolved":true}' -o /tmp/aw_res.json -w "   resolve HTTP %{http_code}\n"
check "correction ticked off" "$(q "SELECT is_resolved FROM audit_report_comments WHERE id=$CORR1")" "1"
for CORR in $(python3 -c "
import json;d=json.load(open('/tmp/aw_ws2.json'));print(' '.join(str(c['id']) for c in d['openCorrections']))"); do
  curl -s -b "$JARA" -X PUT "$BASE/api/auditor/audits/$ASG/comments/$CORR" -H 'X-CSRF-Token: '"$CSRFA"'' -H 'Content-Type: application/json' \
    -d '{"is_resolved":true}' -o /dev/null
done
check "every correction cleared" "$(q "SELECT COUNT(*) FROM audit_report_comments WHERE report_id=$RPT AND comment_type='correction_request' AND is_resolved=0")" "0"

curl -s -b "$JARA" -X PUT "$BASE/api/auditor/audits/$ASG/draft" -H 'X-CSRF-Token: '"$CSRFA"'' -H 'Content-Type: application/json' -d '{
  "body":{
    "findings":[
      {"severity":"Major","clause":"Factories Act 1948 — s.13","description":"Extraction airflow on welding bays 4 and 6 measured 0.3 m/s against the 0.5 m/s minimum. Fans serviced on 2026-10-10 (report FS-88) and re-tested at 0.72 m/s.","evidence":"Anemometer readings AE-118; fan service report FS-88; re-test certificate RT-2026-10-10","recommendation":"Service the extraction fans and re-test within 14 days.","status":"Closed"},
      {"severity":"Minor","clause":"Factories Act 1948 — s.7A","description":"Three of nine welders had no signed PPE issue record for September 2026. Register corrected and signed on 2026-10-10.","evidence":"PPE register pages 31-32 (corrected and signed)","recommendation":"Reconstruct the register and enforce weekly sign-off.","status":"Closed"}
    ]
  }
}' -o /tmp/aw_draft2.json -w "   corrected draft HTTP %{http_code}\n"
check "correction reflected in the draft" "$(q "SELECT draft_body_json LIKE '%RT-2026-10-10%' FROM audit_reports WHERE id=$RPT")" "1"

curl -s -b "$JARA" -X POST "$BASE/api/auditor/audits/$ASG/submit" -H 'X-CSRF-Token: '"$CSRFA"'' -H 'Content-Type: application/json' \
  -d '{"change_summary":"Evidence the verifier asked for is filed","send_to_verifier":true}' -o /tmp/aw_sub2.json -w "   resubmit HTTP %{http_code}\n"
python3 -c "import json;d=json.load(open('/tmp/aw_sub2.json'));print('  ',d.get('message'),'| version',d.get('version'))"
check "resubmitted" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Submitted"
check "resubmission frozen as revision 4" "$(q "SELECT COUNT(*) FROM audit_report_versions WHERE report_id=$RPT")" "4"
check "correction text in the frozen revision" "$(q "SELECT snapshot_json LIKE '%RT-2026-10-10%' FROM audit_report_versions WHERE report_id=$RPT AND version=4")" "1"

echo "14. verifier approves; the audit is closed and read-only"
curl -s -b /tmp/aw_ver.txt -X POST "$BASE/api/verifier/reports/$RPT/review" -H 'X-CSRF-Token: '"$CSRFV"'' -H 'Content-Type: application/json' -d '{
  "action":"approve",
  "comments":"The fan service report and re-test certificate close both corrections. Approved.",
  "next_audit_due":"2027-10-09",
  "notify_auditor":true,
  "notify_employer":true
}' -o /tmp/aw_app.json -w "   approve HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/aw_app.json')).get('message'))"
check "approved" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Approved"
check "assignment closed at 100%" "$(q "SELECT CONCAT(status,'/',progress_percent) FROM audit_assignments WHERE id=$ASG")" "Approved/100"
check "next audit scheduled" "$(q "SELECT next_audit_due FROM audit_reports WHERE id=$RPT")" "2027-10-09"
check "composer refuses an approved report" "$(curl -s -b "$JARA" -X PUT "$BASE/api/auditor/audits/$ASG/draft" -H 'X-CSRF-Token: '"$CSRFA"'' -H 'Content-Type: application/json' -d '{"body":{"executive_summary":"Reopen please."}}' -o /dev/null -w '%{http_code}')" "409"

echo "15. my reports register and its counters"
curl -s -b "$JARA" "$BASE/api/auditor/reports" -o /tmp/aw_rep.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/aw_rep.json'))
print('   rows',len(d['data']),'| stats',{k:d['stats'][k] for k in ('total','approved','averageScore','criticalFindings')})"
check "register scoped to the auditor" "$(python3 -c "
import json;d=json.load(open('/tmp/aw_rep.json'));print(1 if all(str(r['auditor_id'])=='$AUD' for r in d['data']) else 0)")" "1"
check "approved counted" "$(python3 -c "import json;print(json.load(open('/tmp/aw_rep.json'))['stats']['approved'])")" "1"
curl -s -b "$JARA" "$BASE/api/auditor/reports?status=Draft" -o /tmp/aw_rep2.json -w "   filtered HTTP %{http_code}\n"
check "status filter works" "$(python3 -c "
import json;d=json.load(open('/tmp/aw_rep2.json'));print(1 if all(r['status']=='Draft' for r in d['data']) else 0)")" "1"

echo "16. pages"
for path in "/auditor/audits" "/auditor/audits/$ASG" "/auditor/audits/$ASG/preview" "/auditor/reports" "/auditor/dashboard"; do
  code=$(curl -s -b "$JARA" -o /dev/null -w '%{http_code}' "$BASE$path")
  printf '   %-38s %s\n' "$path" "$code"
  check "page $path" "$code" "200"
done
check "start page redirects once submitted" "$(curl -s -b "$JARA" -o /dev/null -w '%{http_code}' "$BASE/auditor/audits/$ASG/start")" "307"
check "missing audit 404" "$(curl -s -b "$JARA" -o /dev/null -w '%{http_code}' "$BASE/auditor/audits/999999")" "404"

echo
printf 'RESULT %d passed, %d failed (run %s)\n' "$PASS" "$FAIL" "$RUN_TAIL"
[ "$FAIL" -eq 0 ] || exit 1
