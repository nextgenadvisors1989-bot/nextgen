#!/usr/bin/env bash
# Audit-report module end-to-end HTTP verification against :3000.
#
#   bash scripts/verify-reports.sh
#
# Walks the whole lifecycle on a fresh fixture employer/auditor/assignment:
#   create draft → version 1 → submit (PDF + version + assignment moves) →
#   verifier queue → return for correction (structured corrections) →
#   resubmit → under review → approve (assignment closes, next audit due) →
#   PDF download → version compare → archive → reopen. Plus filters, RBAC and
#   the admin + verifier pages.
set -u
BASE=http://127.0.0.1:3001
JAR=/tmp/rverify.txt
JARV=/tmp/rverify_verifier.txt
JARA=/tmp/rverify_auditor.txt
RUN_TAIL=$(printf '%04d' $(( (RANDOM % 9000) + 1000 )))
PASS=0
FAIL=0
rm -f "$JAR" "$JARV" "$JARA"

DB_PASS=$(grep -E '^DB_PASSWORD=' .env | sed 's/^DB_PASSWORD=//; s/^"//; s/"$//')
DB_USER=$(grep -E '^DB_USER=' .env | sed 's/^DB_USER=//; s/^"//; s/"$//'); DB_USER=${DB_USER:-compliance_app}
DB_NAME=$(grep -E '^DB_NAME=' .env | sed 's/^DB_NAME=//; s/^"//; s/"$//'); DB_NAME=${DB_NAME:-compliance_platform}
q() { mysql -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -B -e "$1" 2>/dev/null; }

check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '   \033[32m✓\033[0m %s (%s)\n' "$1" "$2"
  else FAIL=$((FAIL+1)); printf '   \033[31m✗\033[0m %s — got %s, expected %s\n' "$1" "$2" "$3"; fi
}

# Prints the fresh CSRF token on stdout; the human-readable status goes to stderr
# so `CSRF=$(login ...)` captures only the token.
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
CSRFV=$(login "$JARV" verifier.test@complianceos.local 'Verifier@2026' '   verifier')

# ---------------------------------------------------------------- fixtures
echo "2. fixture: employer, unit, auditor, assignment"
curl -s -b "$JAR" -X POST "$BASE/api/admin/employers" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"company_name\":\"Kovai Precision Components $RUN_TAIL Private Limited\",\"employer_code\":\"KPC$RUN_TAIL\",
  \"industry_type\":\"Manufacturing\",\"year_of_establishment\":2008,
  \"contact_person_name\":\"S. Ramesh\",\"contact_person_email\":\"ramesh$RUN_TAIL@example.com\",
  \"address_line1\":\"45-B, Kurichi Industrial Estate\",\"city\":\"Coimbatore\",\"state\":\"Tamil Nadu\",\"pincode\":\"641021\"
}" -o /tmp/r_emp.json -w "   employer HTTP %{http_code}\n"
EMP=$(python3 -c "import json;print(json.load(open('/tmp/r_emp.json'))['employerId'])")
curl -s -b "$JAR" -X POST "$BASE/api/admin/employers/$EMP/units" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"unit_name":"Machine Shop","unit_code":"MSH","city":"Coimbatore","state":"Tamil Nadu","pincode":"641021"}' \
  -o /tmp/r_unit.json -w "   unit HTTP %{http_code}\n"
UNIT=$(python3 -c "import json;d=json.load(open('/tmp/r_unit.json'));print(d.get('unitId') or d.get('id'))")

TYPE_ID=$(curl -s -b "$JAR" "$BASE/api/admin/auditors/options?lookups=true" | python3 -c "import json,sys;print(json.load(sys.stdin)['auditorTypes'][0]['id'])")
curl -s -b "$JAR" -X POST "$BASE/api/admin/auditors" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"name\":\"Deepa Narayanan $RUN_TAIL\",\"email\":\"deepa.reports$RUN_TAIL@example.com\",
  \"auditor_type_id\":$TYPE_ID,\"specialization\":\"Manufacturing\",\"experience_years\":8,\"status\":\"active\"
}" -o /tmp/r_aud.json -w "   auditor HTTP %{http_code}\n"
AUD=$(python3 -c "import json;print(json.load(open('/tmp/r_aud.json')).get('auditorId'))")

VERIFIER_ID=$(curl -s -b "$JAR" "$BASE/api/admin/audit-reports/options?lookups=true" | python3 -c "
import json,sys;d=json.load(sys.stdin);print(d['verifiers'][0]['id'] if d['verifiers'] else '')")

curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"audit_title\":\"Machine guarding and safety audit $RUN_TAIL\",\"employer_id\":$EMP,\"unit_id\":$UNIT,
  \"auditor_id\":$AUD,\"verifier_id\":${VERIFIER_ID:-null},
  \"start_date\":\"2026-09-01\",\"end_date\":\"2026-09-05\",\"due_date\":\"2026-09-20\",
  \"priority\":\"High\",\"scope\":\"Machine guarding, interlocks, PPE compliance and safety training records.\"
}" -o /tmp/r_asg.json -w "   assignment HTTP %{http_code}\n"
ASG=$(python3 -c "import json;print(json.load(open('/tmp/r_asg.json'))['assignmentId'])")

if [ -z "${EMP:-}" ] || [ -z "${AUD:-}" ] || [ -z "${ASG:-}" ]; then echo "FIXTURE FAILED"; exit 1; fi

echo "3. options and enumerations"
curl -s -b "$JAR" "$BASE/api/admin/audit-reports/options" -o /tmp/r_opt.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_opt.json'))
print('   statuses:',len(d['statuses']),'| types:',len(d['types']),'| severities:',d['severities'])"
curl -s -b "$JAR" "$BASE/api/admin/audit-reports/options?lookups=true" -o /tmp/r_look.json -w "   lookups HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_look.json'))
print('   employers:',len(d['employers']),'| auditors:',len(d['auditors']),'| verifiers:',len(d['verifiers']),'| assignments:',len(d['assignments']))"

echo "4. create a draft report (version 1, findings counted, score derived from the scorecard)"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-reports" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"assignment_id\":$ASG,\"employer_id\":$EMP,\"auditor_id\":$AUD,\"audit_title\":\"Machine guarding and safety audit $RUN_TAIL — report\",
  \"report_type\":\"AUDIT\",\"audit_period_from\":\"2026-09-01\",\"audit_period_to\":\"2026-09-05\",\"audit_date\":\"2026-09-05\",
  \"body\":{
    \"executive_summary\":\"Machine guarding on the press shop line is broadly in place; two interlocks were found bypassed and the PPE register was not signed for August.\",
    \"methodology\":\"Walk-through of all 14 machines, inspection of interlock circuits, verification of the PPE issue register, interviews with the safety officer and four operators.\",
    \"scorecard\":[
      {\"section\":\"Machine guarding\",\"max_score\":40,\"obtained_score\":32,\"remarks\":\"Two interlocks bypassed\"},
      {\"section\":\"PPE compliance\",\"max_score\":30,\"obtained_score\":18,\"remarks\":\"Register incomplete\"},
      {\"section\":\"Training records\",\"max_score\":30,\"obtained_score\":24,\"remarks\":\"Refresher overdue for 6 operators\"}
    ],
    \"findings\":[
      {\"severity\":\"Critical\",\"clause\":\"Factories Act 1948 — s.21\",\"description\":\"Interlock on press machine P-07 was bypassed with a jumper wire, exposing the operator's hands to the punch cycle.\",\"evidence\":\"Photograph P-07-1; operator interview\",\"recommendation\":\"Restore the interlock and lock out the machine until done.\",\"status\":\"Open\"},
      {\"severity\":\"Major\",\"clause\":\"Tamil Nadu Factories Rules 1950 — Rule 61\",\"description\":\"PPE issue register for August 2026 is unsigned for 6 of 22 operators despite gloves being issued.\",\"evidence\":\"Register page 42\",\"recommendation\":\"Reconstruct the register and enforce daily sign-off.\",\"status\":\"Open\"},
      {\"severity\":\"Minor\",\"clause\":\"Factories Act 1948 — s.41C\",\"description\":\"Safety committee minutes for Q2 2026 were not circulated to the shop floor.\",\"evidence\":\"Notice board inspection\",\"recommendation\":\"Circulate minutes within 7 days of each meeting.\",\"status\":\"Open\"}
    ],
    \"observations\":[\"Housekeeping in the press shop has improved since the last audit\",\"Emergency exits are unobstructed\"],
    \"recommendations\":[\"Fit tamper-proof interlock housings\",\"Digitise the PPE register\"],
    \"regulatory_references\":[\"Factories Act, 1948 — s.21, s.41C\",\"Tamil Nadu Factories Rules, 1950 — Rule 61\"]
  },
  \"next_audit_due\":\"2027-09-05\"
}" -o /tmp/r_new.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_new.json'))
print('  ',d.get('message'))
print('   number',d.get('reportNumber'),'| version',d.get('version'),'| submitted',d.get('submitted'))"
RPT=$(python3 -c "import json;print(json.load(open('/tmp/r_new.json')).get('reportId',''))")
RPT_NO=$(python3 -c "import json;print(json.load(open('/tmp/r_new.json')).get('reportNumber',''))")
if [ -z "$RPT" ]; then cat /tmp/r_new.json; exit 1; fi
check "report number prefix" "$(echo "$RPT_NO" | cut -d/ -f1)" "RPT"
check "version 1 written" "$(q "SELECT COUNT(*) FROM audit_report_versions WHERE report_id=$RPT")" "1"
check "score from scorecard" "$(q "SELECT ROUND(score_percentage) FROM audit_reports WHERE id=$RPT")" "74"
check "critical counted" "$(q "SELECT critical_findings FROM audit_reports WHERE id=$RPT")" "1"
check "major counted" "$(q "SELECT major_findings FROM audit_reports WHERE id=$RPT")" "1"
check "minor counted" "$(q "SELECT minor_findings FROM audit_reports WHERE id=$RPT")" "1"
check "observations counted" "$(q "SELECT observations FROM audit_reports WHERE id=$RPT")" "2"
check "status is Draft" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Draft"

echo "5. duplicate guard: one report per assignment"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-reports" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"assignment_id\":$ASG,\"employer_id\":$EMP,\"audit_title\":\"Second report on the same assignment\"}" \
  -o /tmp/r_dup.json -w "   HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/r_dup.json')).get('message'))"

echo "6. validation: period backwards, description too short"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-reports" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"employer_id\":$EMP,\"audit_title\":\"Bad period report\",\"audit_period_from\":\"2026-09-10\",\"audit_period_to\":\"2026-09-01\",
  \"body\":{\"findings\":[{\"severity\":\"Minor\",\"description\":\"short\"}]}}" -o /tmp/r_bad.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_bad.json'))
print('  ',[(e['field'],e['message']) for e in d.get('errors',[])][:3])"

echo "7. submit (PDF generated + filed as version 2, assignment moves to Submitted)"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-reports/$RPT/submit" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d "{\"change_summary\":\"Initial submission\",\"verifier_id\":${VERIFIER_ID:-null},\"send_to_verifier\":true}" \
  -o /tmp/r_sub.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_sub.json'))
print('  ',d.get('message'))
print('   version',d.get('version'),'| pdf file',d.get('pdfFileId'),'| verifier',d.get('verifierId'),'| warnings',d.get('warnings'))"
PDF_ID=$(python3 -c "import json;print(json.load(open('/tmp/r_sub.json')).get('pdfFileId',''))")
check "status Submitted" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Submitted"
check "submitted_at stamped" "$(q "SELECT submitted_at IS NOT NULL FROM audit_reports WHERE id=$RPT")" "1"
check "PDF stored" "$(q "SELECT COUNT(*) FROM files WHERE id=${PDF_ID:-0} AND mime_type='application/pdf'")" "1"
check "PDF attached to report" "$(q "SELECT pdf_file_id = ${PDF_ID:-0} FROM audit_reports WHERE id=$RPT")" "1"
check "submission version filed" "$(q "SELECT COUNT(*) FROM audit_report_versions WHERE report_id=$RPT")" "2"
check "assignment moved to Submitted" "$(q "SELECT status FROM audit_assignments WHERE id=$ASG")" "Submitted"
check "verifier queued" "$(q "SELECT COUNT(*) FROM verifier_assignments WHERE report_id=$RPT AND status IN ('pending','in_review')")" "1"
check "submission logged" "$(q "SELECT COUNT(*) FROM activity_logs WHERE entity_type='audit_report' AND entity_id=$RPT AND action='submitted'")" "1"
check "verifier emailed" "$(q "SELECT COUNT(*) FROM email_logs WHERE template_code='report.submitted' AND entity_type='audit_report' AND entity_id=$RPT")" "1"

echo "8. PDF content sanity (text decoded through the embedded font subsets)"
curl -s -b "$JAR" "$BASE/api/pdf/audit-report/$RPT" -o /tmp/r.pdf -w "   HTTP %{http_code}\n"
python3 -c "
import re
d = open('/tmp/r.pdf','rb').read()
m = re.search(rb'/Count (\\d+)', d)
print('   bytes', len(d), '| pages', int(m.group(1)) if m else 0, '| header', d[:5] == b'%PDF-')"
python3 scripts/pdf-text.py /tmp/r.pdf --json > /tmp/r_pages.json
python3 - "$RPT_NO" "$RUN_TAIL" > /tmp/r_pdfchecks.tsv << 'PY'
import json, sys
report_no, tail = sys.argv[1], sys.argv[2]
pages = json.load(open('/tmp/r_pages.json'))
texts = [p['text'] for p in pages]
joined = '\n'.join(texts)
page_count = len(pages)
footer_pages = sum(1 for text in texts if report_no in text)

def row(label, actual, expected='1'):
    print(f'{label}\t{actual}\t{expected}')

row('pdf page count', page_count, '3')
row('header carries the employer', 1 if 'KOVAI PRECISION' in (texts[0] if texts else '').upper() else 0)
row('report number in every footer', footer_pages, page_count)
row('footer page numbering', 1 if f'Page 1 of {page_count}' in (texts[0] if texts else '') else 0)
row('no footer placeholder left', 0 if 'Page x of y' in joined else 1)
row('severity cards rendered', 1 if all(word in joined for word in ('CRITICAL', 'MAJOR', 'MINOR')) else 0)
row('compliance score rendered', 1 if '74.00%' in joined else 0)
row('version and signatures rendered', 1 if ('v2' in joined and 'Authorised Signatory (Employer)' in joined) else 0)
PY
while IFS=$'\t' read -r label actual expected; do
  [ -n "$label" ] && check "$label" "$actual" "$expected"
done < /tmp/r_pdfchecks.tsv

echo "9. verifier queue"
curl -s -b "$JARV" "$BASE/api/verifier/reports" -o /tmp/r_queue.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_queue.json'))
print('   queue rows',len(d['data']),'| workload',d['workload'])
print('   first:',d['data'][0]['report_number'] if d['data'] else '—')"
VERIFIER_CSRF=$(awk '$6=="cos_csrf"{print $7}' "$JARV")
curl -s -b "$JARV" -X POST "$BASE/api/verifier/reports/$RPT/start-review" -H 'X-CSRF-Token: '"$VERIFIER_CSRF"'' -H 'Content-Type: application/json' \
  -o /tmp/r_start.json -w "   start review HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/r_start.json')).get('message'))"
check "status Under Review" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Under Review"

echo "10. return for correction with structured corrections"
curl -s -b "$JARV" -X POST "$BASE/api/verifier/reports/$RPT/review" -H 'Content-Type: application/json' -H "X-CSRF-Token: $VERIFIER_CSRF" -d '{
  "action":"return",
  "comments":"Two items need strengthening before approval: the P-07 interlock repair evidence is missing, and the PPE register still shows August gaps.",
  "reason":"Evidence gaps on two findings",
  "corrections":[
    {"section_ref":"Finding F-01","field_ref":"evidence","severity":"critical","note":"Attach the interlock repair work order and the post-repair test record."},
    {"section_ref":"Finding F-02","field_ref":"evidence","severity":"major","note":"Reconcile the August PPE register and attach the corrected pages."}
  ],
  "notify_auditor":true
}' -o /tmp/r_ret.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_ret.json'))
print('  ',d.get('message'),'| corrections',d.get('corrections'))"
check "status Changes Requested" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Changes Requested"
check "corrections stored" "$(q "SELECT COUNT(*) FROM audit_report_comments WHERE report_id=$RPT AND comment_type='correction_request'")" "3"
check "open corrections" "$(q "SELECT COUNT(*) FROM audit_report_comments WHERE report_id=$RPT AND is_resolved=0 AND comment_type='correction_request'")" "3"
check "verifier decision logged" "$(q "SELECT COUNT(*) FROM verifier_comments WHERE report_id=$RPT AND action='returned'")" "1"
check "assignment returned" "$(q "SELECT status FROM audit_assignments WHERE id=$ASG")" "Changes Requested"
check "decision revision filed" "$(q "SELECT COUNT(*) FROM audit_report_versions WHERE report_id=$RPT")" "3"
check "auditor emailed" "$(q "SELECT COUNT(*) FROM email_logs WHERE template_code='report.rejected' AND entity_type='audit_report' AND entity_id=$RPT")" "1"

echo "11. corrections resolved, body corrected, resubmitted"
CORRECTION_ID=$(q "SELECT id FROM audit_report_comments WHERE report_id=$RPT AND comment_type='correction_request' ORDER BY id LIMIT 1")
curl -s -b "$JAR" -X PUT "$BASE/api/admin/audit-reports/$RPT/comments/$CORRECTION_ID" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"is_resolved":true}' -o /tmp/r_res.json -w "   resolve correction HTTP %{http_code}\n"
check "correction resolved" "$(q "SELECT is_resolved FROM audit_report_comments WHERE id=$CORRECTION_ID")" "1"

curl -s -b "$JAR" -X PUT "$BASE/api/admin/audit-reports/$RPT" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d '{
  "create_version":true,"change_summary":"Interlock repair evidence attached; PPE register reconciled",
  "body":{"findings":[
    {"severity":"Critical","clause":"Factories Act 1948 — s.21","description":"Interlock on press machine P-07 was bypassed with a jumper wire, exposing the operator to the punch cycle. Repaired on 2026-09-06 (work order WO-2291) and re-tested.","evidence":"Photograph P-07-1; work order WO-2291; test record TR-118","recommendation":"Restore the interlock and lock out the machine until done.","status":"Closed"},
    {"severity":"Major","clause":"Tamil Nadu Factories Rules 1950 — Rule 61","description":"PPE issue register for August 2026 was unsigned for 6 of 22 operators. Register reconciled and signed on 2026-09-06.","evidence":"Register pages 42-43 (corrected)","recommendation":"Reconstruct the register and enforce daily sign-off.","status":"Closed"},
    {"severity":"Minor","clause":"Factories Act 1948 — s.41C","description":"Safety committee minutes for Q2 2026 were not circulated to the shop floor.","evidence":"Notice board inspection","recommendation":"Circulate minutes within 7 days of each meeting.","status":"In Progress"}
  ]}
}' -o /tmp/r_upd.json -w "   update body HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_upd.json'))
print('  ',d.get('message'),'| version',(d.get('version') or {}).get('version'))"
check "revision created on edit" "$(q "SELECT COUNT(*) FROM audit_report_versions WHERE report_id=$RPT")" "4"

RESUB_CODE=$(curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-reports/$RPT/submit" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"change_summary":"Resubmission with the evidence the verifier asked for","send_to_verifier":true}' \
  -o /tmp/r_resub.json -w '%{http_code}')
echo "   resubmit HTTP $RESUB_CODE"
python3 -c "
import json;d=json.load(open('/tmp/r_resub.json'))
print('  ',d.get('message'),'| version',d.get('version'))"
check "resubmit accepted" "$RESUB_CODE" "200"
check "back to Submitted" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Submitted"
check "resubmission version" "$(q "SELECT COUNT(*) FROM audit_report_versions WHERE report_id=$RPT")" "5"
check "verifier re-queued" "$(q "SELECT COUNT(*) FROM verifier_assignments WHERE report_id=$RPT AND status='pending'")" "1"
check "verifier emailed again" "$(q "SELECT COUNT(*) FROM email_logs WHERE template_code='report.submitted' AND entity_type='audit_report' AND entity_id=$RPT")" "2"

echo "12. approve"
curl -s -b "$JARV" -X POST "$BASE/api/verifier/reports/$RPT/review" -H 'Content-Type: application/json' -H "X-CSRF-Token: $VERIFIER_CSRF" -d '{
  "action":"approve",
  "comments":"Evidence gaps closed; the repaired interlock and reconciled register are accepted. Report approved.",
  "next_audit_due":"2027-09-05",
  "notify_auditor":true,
  "notify_employer":true
}' -o /tmp/r_app.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_app.json'))
print('  ',d.get('message'),'| status',d.get('status'))"
check "status Approved" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Approved"
check "approved_by stamped" "$(q "SELECT approved_by IS NOT NULL FROM audit_reports WHERE id=$RPT")" "1"
check "next audit due set" "$(q "SELECT next_audit_due FROM audit_reports WHERE id=$RPT")" "2027-09-05"
check "assignment approved" "$(q "SELECT status FROM audit_assignments WHERE id=$ASG")" "Approved"
check "assignment at 100%" "$(q "SELECT progress_percent FROM audit_assignments WHERE id=$ASG")" "100"
check "assignment completed_at" "$(q "SELECT completed_at IS NOT NULL FROM audit_assignments WHERE id=$ASG")" "1"
check "verifier queue closed" "$(q "SELECT COUNT(*) FROM verifier_assignments WHERE report_id=$RPT AND status='completed'")" "1"
check "approval logged" "$(q "SELECT COUNT(*) FROM activity_logs WHERE entity_type='audit_report' AND entity_id=$RPT AND action='approved'")" "1"
check "auditor emailed approval" "$(q "SELECT COUNT(*) FROM email_logs WHERE template_code='report.approved' AND entity_type='audit_report' AND entity_id=$RPT")" "1"

echo "13. list: filters, sorting, pagination, stats"
curl -s -b "$JAR" "$BASE/api/admin/audit-reports?page=1&limit=5&sortBy=score_percentage&sortDir=desc" -o /tmp/r_list.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_list.json'))
print('   rows',len(d['data']),'| total',d['pagination']['total'])
print('   stats avg',d['stats']['averageScore'],'| approved',d['stats']['approved'],'| critical',d['stats']['criticalFindings'])"
curl -s -b "$JAR" "$BASE/api/admin/audit-reports?search=$RUN_TAIL&status=Approved&employerId=$EMP&auditorId=$AUD&scoreBand=75&criticalOnly=true" -o /tmp/r_list2.json -w "   filtered HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_list2.json'))
print('   matched',d['pagination']['total'],'->',[r['report_number'] for r in d['data']])"
curl -s -b "$JAR" "$BASE/api/admin/audit-reports?pendingVerification=true" -o /tmp/r_list3.json -w "   pending-only HTTP %{http_code}\n"
python3 -c "import json;print('   pending rows',len(json.load(open('/tmp/r_list3.json'))['data']))"

echo "14. detail bundle, versions and diff"
curl -s -b "$JAR" "$BASE/api/admin/audit-reports/$RPT" -o /tmp/r_det.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_det.json'));r=d['report']
print('  ',r['report_number'],'|',r['status'],'| v',r['current_version'])
print('   findings in body:',len(d['body']['findings']),'| scorecard:',len(d['body']['scorecard']))
print('   versions:',len(d['versions']),'| comments:',len(d['comments']),'| verification:',len(d['verification']),'| decisions:',len(d['decisions']))
print('   open corrections:',d['commentCounts']['openCorrections'])"
curl -s -b "$JAR" "$BASE/api/admin/audit-reports/$RPT/versions/compare?against=2&with=5" -o /tmp/r_diff.json -w "   compare HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_diff.json'))
print('   diff fields:',[(c['field'],c['from'],c['to']) for c in d['diff']][:4])"

echo "15. PDF regeneration keeps file versions"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-reports/$RPT/pdf" -H 'X-CSRF-Token: '"$CSRF"'' -o /tmp/r_pdf.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/r_pdf.json'))
print('  ',d.get('message'),'| file',d.get('fileId'),'| download',d.get('downloadUrl'))"
check "PDF file versioned" "$(q "SELECT COUNT(*) FROM file_versions WHERE file_id=(SELECT id FROM files WHERE entity_type='AUDIT_REPORT' AND entity_id=$RPT AND parent_file_id IS NULL ORDER BY id LIMIT 1)")" "3"

echo "16. archive → delete guard → reopen"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-reports/$RPT/archive" -H 'X-CSRF-Token: '"$CSRF"'' -o /tmp/r_arc.json -w "   archive HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/r_arc.json')).get('message'))"
check "archived" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Archived"
curl -s -b "$JAR" -X DELETE "$BASE/api/admin/audit-reports/$RPT" -H 'X-CSRF-Token: '"$CSRF"'' -o /tmp/r_del.json -w "   delete attempt HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/r_del.json')).get('message'))"
check "soft deleted" "$(q "SELECT deleted_at IS NOT NULL FROM audit_reports WHERE id=$RPT")" "1"
check "hidden from listings" "$(q "SELECT COUNT(*) FROM audit_reports WHERE id=$RPT AND deleted_at IS NULL")" "0"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-reports/$RPT/restore" -H 'X-CSRF-Token: '"$CSRF"'' -o /tmp/r_res2.json -w "   reopen HTTP %{http_code}\n"
check "reopened as draft" "$(q "SELECT status FROM audit_reports WHERE id=$RPT")" "Draft"
check "undeleted" "$(q "SELECT deleted_at IS NULL FROM audit_reports WHERE id=$RPT")" "1"

echo "17. RBAC"
curl -s "$BASE/api/admin/audit-reports" -o /dev/null -w "   unauthenticated admin API %{http_code}\n"
CSRFA=$(login "$JARA" auditor.test@complianceos.local 'Auditor@2026' '   auditor')
curl -s -b "$JARA" "$BASE/api/admin/audit-reports" -o /dev/null -w "   auditor on admin API %{http_code}\n"
curl -s -b "$JARA" -o /dev/null -w "   auditor on /admin/audit-reports %{http_code}\n" "$BASE/admin/audit-reports"
curl -s -b "$JAR" -o /dev/null -w "   admin on /admin/audit-reports %{http_code}\n" "$BASE/admin/audit-reports"

echo "18. pages"
# The analytics screen: both charts are server-rendered into the page shell, so a
# missing chart is visible in the HTML rather than only after hydration.
ANALYTICS=$(curl -s -b "$JAR" "$BASE/admin/reports")
printf '%s' "$ANALYTICS" | grep -qi "Compliance score trend" && { PASS=$((PASS+1)); printf '   \033[32m✓\033[0m admin reports carries the score-trend chart\n'; } || { FAIL=$((FAIL+1)); printf '   \033[31m✗\033[0m admin reports is missing the score-trend chart\n'; }
printf '%s' "$ANALYTICS" | grep -qi "Findings by severity" && { PASS=$((PASS+1)); printf '   \033[32m✓\033[0m admin reports carries the findings breakdown chart\n'; } || { FAIL=$((FAIL+1)); printf '   \033[31m✗\033[0m admin reports is missing the findings breakdown chart\n'; }
for path in "/admin/audit-reports" "/admin/audit-reports/create" "/admin/audit-reports/$RPT" "/admin/audit-reports/$RPT/review" "/admin/audit-reports/$RPT/edit" "/admin/dashboard"; do
  code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  printf '   %-42s %s\n' "$path" "$code"
  check "page $path" "$code" "200"
done
for path in "/verifier/reports" "/verifier/reports/$RPT" "/verifier/reports/$RPT/review" "/verifier/dashboard"; do
  code=$(curl -s -b "$JARV" -o /dev/null -w "%{http_code}" "$BASE$path")
  printf '   %-42s %s\n' "$path" "$code"
  check "verifier page $path" "$code" "200"
done
curl -s -b "$JAR" -o /dev/null -w "   missing report %{http_code}\n" "$BASE/admin/audit-reports/999999"

echo "19. clean-up"
# This suite builds a company of its own to hang the report off. Left behind, the
# fixture accumulates a company per run and pollutes the register other suites
# read from — so the run takes its own fixtures away again, children first.
CARRIER="SELECT id FROM employers WHERE employer_code = 'KPC$RUN_TAIL'"
q "DELETE FROM verifier_comments WHERE report_id IN (SELECT id FROM audit_reports WHERE employer_id IN ($CARRIER));"
q "DELETE FROM verifier_assignments WHERE report_id IN (SELECT id FROM audit_reports WHERE employer_id IN ($CARRIER));"
q "DELETE FROM audit_report_comments WHERE report_id IN (SELECT id FROM audit_reports WHERE employer_id IN ($CARRIER));"
q "DELETE FROM audit_report_versions WHERE report_id IN (SELECT id FROM audit_reports WHERE employer_id IN ($CARRIER));"
q "DELETE FROM audit_reports WHERE employer_id IN ($CARRIER);"
q "DELETE FROM audit_assignments WHERE employer_id IN ($CARRIER);"
q "DELETE FROM notifications WHERE entity_type = 'audit_report' AND entity_id NOT IN (SELECT id FROM audit_reports);"
q "DELETE FROM files WHERE entity_type = 'AUDIT_REPORT' AND entity_id NOT IN (SELECT id FROM audit_reports);"
q "DELETE FROM company_units WHERE employer_id IN ($CARRIER);"
q "DELETE FROM departments WHERE employer_id IN ($CARRIER);"
q "DELETE FROM employers WHERE employer_code = 'KPC$RUN_TAIL';"
q "DELETE FROM auditors WHERE email = 'deepa.reports$RUN_TAIL@example.com';"
check "the fixture company is gone" "$(q "SELECT COUNT(*) FROM employers WHERE employer_code = 'KPC$RUN_TAIL';")" "0"
check "the fixture auditor is gone" "$(q "SELECT COUNT(*) FROM auditors WHERE email = 'deepa.reports$RUN_TAIL@example.com';")" "0"
check "no report is left hanging off it" "$(q "SELECT COUNT(*) FROM audit_reports WHERE employer_id IS NULL;")" "0"

echo
printf 'RESULT %d passed, %d failed (run %s)\n' "$PASS" "$FAIL" "$RUN_TAIL"
[ "$FAIL" -eq 0 ] || exit 1
