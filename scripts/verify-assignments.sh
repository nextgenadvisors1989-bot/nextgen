#!/usr/bin/env bash
# Audit-assignment module end-to-end HTTP verification against :3000.
#
#   bash scripts/verify-assignments.sh
#
# Creates its own fixtures (employer → unit → departments → auditor) so it is
# safe to run against a seeds-only database, then exercises create → notify →
# calendar → list/filters → update → reassign → bulk → cancel → delete, plus the
# RBAC and page-level guards.
set -u
BASE=http://127.0.0.1:3001
JAR=/tmp/averify.txt
JAR2=/tmp/averify_auditor.txt
RUN_TAIL=$(printf '%04d' $(( (RANDOM % 9000) + 1000 )))
PASS=0
FAIL=0
rm -f "$JAR" "$JAR2"

DB_PASS=$(grep -E '^DB_PASSWORD=' .env | sed 's/^DB_PASSWORD=//; s/^"//; s/"$//')
DB_USER=$(grep -E '^DB_USER=' .env | sed 's/^DB_USER=//; s/^"//; s/"$//'); DB_USER=${DB_USER:-compliance_app}
DB_NAME=$(grep -E '^DB_NAME=' .env | sed 's/^DB_NAME=//; s/^"//; s/"$//'); DB_NAME=${DB_NAME:-compliance_platform}
q() { mysql -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -B -e "$1" 2>/dev/null; }

check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '   \033[32m✓\033[0m %s (%s)\n' "$1" "$2"
  else FAIL=$((FAIL+1)); printf '   \033[31m✗\033[0m %s — got %s, expected %s\n' "$1" "$2" "$3"; fi
}

curl -s -c "$JAR" -o /dev/null "$BASE/login"
CSRF=$(awk '$6=="cos_csrf"{print $7}' "$JAR")
curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"identifier":"admin@complianceos.local","password":"Admin@2026"}' \
  -o /dev/null -w "1. admin login %{http_code}\n"
CSRF=$(awk '$6=="cos_csrf"{print $7}' "$JAR")

# ---------------------------------------------------------------- fixtures
echo "2. fixtures: employer, unit, departments, auditor"
curl -s -b "$JAR" -X POST "$BASE/api/admin/employers" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"company_name\":\"Sri Balaji Textiles $RUN_TAIL Private Limited\",\"employer_code\":\"SBT$RUN_TAIL\",\"industry_type\":\"Textiles\",
  \"contact_person_name\":\"R. Muthu Kumar\",\"contact_person_email\":\"muthu$RUN_TAIL@example.com\",
  \"contact_person_mobile\":\"+9198$RUN_TAIL$(printf '%04d' $((RANDOM % 9000)))000\",
  \"address_line1\":\"12/4, Avinashi Road\",\"city\":\"Coimbatore\",\"state\":\"Tamil Nadu\",\"pincode\":\"641018\"
}" -o /tmp/a_emp.json -w "   employer HTTP %{http_code}\n"
EMP=$(python3 -c "import json;print(json.load(open('/tmp/a_emp.json'))['employerId'])")
EMP_CODE=$(python3 -c "import json;print(json.load(open('/tmp/a_emp.json'))['employerCode'])"); echo "   employer code $EMP_CODE" 

curl -s -b "$JAR" -X POST "$BASE/api/admin/employers/$EMP/units" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"unit_name":"Spinning Unit","unit_code":"SPN","address_line1":"Plot 7, SIDCO Industrial Estate","city":"Coimbatore","state":"Tamil Nadu","pincode":"641021"}' \
  -o /tmp/a_unit.json -w "   unit HTTP %{http_code}\n"
UNIT=$(python3 -c "import json;d=json.load(open('/tmp/a_unit.json'));print(d.get('unitId') or d.get('id') or (d.get('unit') or {}).get('id'))")

curl -s -b "$JAR" -X POST "$BASE/api/admin/employers/$EMP/departments" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d "{\"unit_id\":$UNIT,\"department_name\":\"Production\",\"department_code\":\"PROD\"}" -o /tmp/a_dept.json -w "   department HTTP %{http_code}\n"
DEPT=$(python3 -c "import json;d=json.load(open('/tmp/a_dept.json'));print(d.get('departmentId') or d.get('id') or (d.get('department') or {}).get('id'))")

TYPE_ID=$(curl -s -b "$JAR" "$BASE/api/admin/auditors/options?lookups=true" | python3 -c "import json,sys;print(json.load(sys.stdin)['auditorTypes'][0]['id'])")
curl -s -b "$JAR" -X POST "$BASE/api/admin/auditors" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"name\":\"Priya Venkatesan $RUN_TAIL\",\"email\":\"priya.auditor$RUN_TAIL@example.com\",\"mobile\":\"+9197$RUN_TAIL$(printf '%04d' $((RANDOM % 9000)))111\",
  \"auditor_type_id\":$TYPE_ID,\"role_title\":\"Factory Act Auditor\",\"specialization\":\"Textiles\",
  \"experience_years\":7.5,\"city\":\"Coimbatore\",\"state\":\"Tamil Nadu\",\"max_concurrent_audits\":3,\"status\":\"active\"
}" -o /tmp/a_aud.json -w "   auditor HTTP %{http_code}\n"
AUD=$(python3 -c "import json;print(json.load(open('/tmp/a_aud.json')).get('auditorId'))")
if [ -z "$AUD" ] || [ "$AUD" = "None" ]; then echo "FIXTURE FAILED: auditor not created"; cat /tmp/a_aud.json; exit 1; fi
if [ -z "$EMP" ] || [ "$EMP" = "None" ]; then echo "FIXTURE FAILED: employer not created"; cat /tmp/a_emp.json; exit 1; fi
AUD_CODE=$(python3 -c "import json;print(json.load(open('/tmp/a_aud.json')).get('auditorCode'))")
echo "3. options: enumerations, stats and lookups"
curl -s -b "$JAR" "$BASE/api/admin/audit-assignments/options" -o /tmp/a_opt.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_opt.json'))
print('   statuses:',len(d['statuses']),'| priorities:',d['priorities'],'| types:',len(d['types']))"
curl -s -b "$JAR" "$BASE/api/admin/audit-assignments/options?lookups=true" -o /tmp/a_look.json -w "   lookups HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_look.json'))
print('   employers:',len(d['employers']),'| units:',len(d['units']),'| departments:',len(d['departments']),
      '| auditors:',len(d['auditors']),'| verifiers:',len(d['verifiers']),'| modules:',len(d['modules']))
print('   auditor sample:',d['auditors'][0]['name'],'open',d['auditors'][0]['open_assignments'],'/',d['auditors'][0]['max_concurrent_audits'])"
VERIFIER=$(python3 -c "
import json;d=json.load(open('/tmp/a_look.json'));print(d['verifiers'][0]['id'] if d['verifiers'] else '')")

echo "4. create assignment (number, calendar row, notifications, emails)"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"assignment_type\":\"AUDIT\",\"audit_title\":\"Annual Factories Act compliance audit $RUN_TAIL\",
  \"employer_id\":$EMP,\"unit_id\":$UNIT,\"department_id\":$DEPT,
  \"auditor_id\":$AUD,\"verifier_id\":${VERIFIER:-null},
  \"start_date\":\"2026-10-12\",\"end_date\":\"2026-10-16\",\"due_date\":\"2026-10-24\",
  \"audit_end_meeting_at\":\"2026-10-17 16:00:00\",
  \"priority\":\"High\",\"scope\":\"Registers under the Factories Act 1948, welfare amenities, safety officers, canteen and creche records.\",
  \"instructions\":\"Verify Form 12 registers, inspect the creche and canteen, interview the safety committee.\",
  \"fee_amount\":45000,\"reminder_minutes\":1440
}" -o /tmp/a_new.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_new.json'))
print('  ',d.get('message'))
print('   number',d.get('assignmentNumber'),'| calendar event',d.get('calendarEventId'),'| capacity',d.get('capacity'),'| warnings',d.get('warnings'))"
ASG=$(python3 -c "import json;print(json.load(open('/tmp/a_new.json')).get('assignmentId'))")
ASG_NO=$(python3 -c "import json;print(json.load(open('/tmp/a_new.json')).get('assignmentNumber'))")
CAL=$(python3 -c "import json;print(json.load(open('/tmp/a_new.json')).get('calendarEventId'))")
check "assignment number prefix" "$(echo "$ASG_NO" | cut -d/ -f1)" "AUD"
check "calendar event created" "$(q "SELECT COUNT(*) FROM calendar_events WHERE assignment_id=$ASG AND deleted_at IS NULL")" "2"
check "calendar event types" "$(q "SELECT GROUP_CONCAT(event_type ORDER BY event_type) FROM calendar_events WHERE assignment_id=$ASG")" "AUDIT,AUDIT_END_MEETING"
check "calendar linked to auditor" "$(q "SELECT COUNT(*) FROM calendar_events WHERE assignment_id=$ASG AND auditor_id=$AUD")" "2"
check "assignment status seeded" "$(q "SELECT status FROM audit_assignments WHERE id=$ASG")" "Not Started"
check "activity log written" "$(q "SELECT COUNT(*) FROM activity_logs WHERE entity_type='audit_assignment' AND entity_id=$ASG AND action='created'")" "1"
check "audit trail written" "$(q "SELECT COUNT(*) > 0 FROM audit_trails WHERE table_name='audit_assignments' AND record_id=$ASG AND operation='INSERT'")" "1"
check "employer email queued" "$(q "SELECT COUNT(*) > 0 FROM email_logs WHERE template_code='audit.assigned.employer'")" "1"

echo "5. detail bundle"
curl -s -b "$JAR" "$BASE/api/admin/audit-assignments/$ASG" -o /tmp/a_det.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_det.json'));a=d['assignment']
print('  ',a['assignment_number'],'|',a['audit_title'])
print('   employer',a['employer_name'],'/',a.get('unit_name'),'/',a.get('department_name'))
print('   auditor',a['auditor_name'],a.get('auditor_email'),'| verifier',a.get('verifier_name'),'| assigned_by',a.get('assigned_by_name'))
print('   history rows:',len(d['history']),'| files:',len(d['files']),'| fee',a.get('fee_amount'))"

echo "6. list: search, filters, sorting, pagination"
curl -s -b "$JAR" "$BASE/api/admin/audit-assignments?page=1&limit=5&sortBy=created_at&sortDir=desc" -o /tmp/a_list.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_list.json'))
print('   rows',len(d['data']),'| pagination',d['pagination'])
print('   stats',d['stats'])"
curl -s -b "$JAR" "$BASE/api/admin/audit-assignments?search=$RUN_TAIL&status=Not%20Started&priority=High&employerId=$EMP&auditorId=$AUD&overdueOnly=false" -o /tmp/a_list2.json -w "   filtered HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_list2.json'))
print('   matched',d['pagination']['total'],'->',[r['assignment_number'] for r in d['data']])"
curl -s -b "$JAR" "$BASE/api/admin/audit-assignments?overdueOnly=true" -o /tmp/a_list3.json -w "   overdue-only HTTP %{http_code}\n"
python3 -c "import json;print('   overdue rows',len(json.load(open('/tmp/a_list3.json'))['data']))"

echo "7. validation: bad schedule, missing employer, unknown auditor"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"audit_title\":\"Backwards schedule test\",\"employer_id\":$EMP,\"auditor_id\":$AUD,
  \"start_date\":\"2026-11-10\",\"end_date\":\"2026-11-01\"}" -o /tmp/a_bad.json -w "   backward window HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_bad.json'))
print('  ',d.get('message'),'|',[e['field'] for e in d.get('errors',[])])"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"audit_title":"No employer or auditor"}' -o /tmp/a_bad2.json -w "   missing refs HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_bad2.json'))
print('  ',[ (e['field'], e['message']) for e in d.get('errors',[])])"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"audit_title\":\"Ghost auditor\",\"employer_id\":$EMP,\"auditor_id\":999999}" -o /tmp/a_bad3.json -w "   unknown auditor HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/a_bad3.json')).get('message'))"

echo "8. update: schedule syncs the calendar, audit trail records it"
curl -s -b "$JAR" -X PUT "$BASE/api/admin/audit-assignments/$ASG" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"priority\":\"Urgent\",\"due_date\":\"2026-10-20\",\"end_date\":\"2026-10-15\",
  \"instructions\":\"Verify Form 12 registers, inspect canteen, creche and safety committee minutes. Interview the safety officer.\",
  \"fee_amount\":52000}" -o /tmp/a_put.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_put.json'));a=d.get('assignment',{})
print('  ',d.get('message'),'-> priority',a.get('priority'),'| due',a.get('due_date'),'| fee',a.get('fee_amount'))"
check "calendar start moved" "$(q "SELECT DATE(start_datetime) FROM calendar_events WHERE assignment_id=$ASG AND parent_event_id IS NULL")" "2026-10-12"
check "calendar end moved" "$(q "SELECT DATE(end_datetime) FROM calendar_events WHERE assignment_id=$ASG AND parent_event_id IS NULL")" "2026-10-15"
check "update audited" "$(q "SELECT COUNT(*) > 0 FROM audit_trails WHERE table_name='audit_assignments' AND record_id=$ASG AND operation='UPDATE'")" "1"
check "update logged" "$(q "SELECT COUNT(*) FROM activity_logs WHERE entity_type='audit_assignment' AND entity_id=$ASG AND action='updated'")" "1"

echo "9. progress + status transition"
curl -s -b "$JAR" -X PUT "$BASE/api/admin/audit-assignments/$ASG" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"status":"In Progress","progress_percent":35}' -o /tmp/a_prog.json -w "   HTTP %{http_code}\n"
check "status stored" "$(q "SELECT status FROM audit_assignments WHERE id=$ASG")" "In Progress"
check "progress stored" "$(q "SELECT progress_percent FROM audit_assignments WHERE id=$ASG")" "35"
curl -s -b "$JAR" -X PUT "$BASE/api/admin/audit-assignments/$ASG" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"progress_percent":140}' -o /tmp/a_prog460.json -w "   progress 140 HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/a_prog460.json')).get('errors'))"

echo "10. reassign"
SECOND_AUD=$(curl -s -b "$JAR" "$BASE/api/admin/audit-assignments/options?lookups=true" | python3 -c "
import json,sys;d=json.load(sys.stdin)
others=[a['id'] for a in d['auditors'] if a['id']!=$AUD]
print(others[0] if others else '')")
# The reassign step needs a second auditor. When the register holds only the
# suite's own auditor (a fresh sandbox) the options list comes back empty, so the
# condition is "no other auditor yet" — not "the same auditor twice".
if [ -z "$SECOND_AUD" ] || [ "$SECOND_AUD" = "$AUD" ]; then
  curl -s -b "$JAR" -X POST "$BASE/api/admin/auditors" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
    \"name\":\"Karthik Rajan $RUN_TAIL\",\"email\":\"karthik.auditor$RUN_TAIL@example.com\",
    \"auditor_type_id\":$TYPE_ID,\"specialization\":\"Electrical Safety\",\"experience_years\":5,\"status\":\"active\"
  }" -o /tmp/a_aud2.json -w "   second auditor HTTP %{http_code}\n"
  SECOND_AUD=$(python3 -c "import json;print(json.load(open('/tmp/a_aud2.json')).get('auditorId'))")
fi
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments/$ASG/reassign" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"auditor_id\":$SECOND_AUD,\"reason\":\"Original auditor is on medical leave for the audit window.\"
}" -o /tmp/a_re.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_re.json'));a=d.get('assignment',{})
print('  ',d.get('message'),'| auditor now',a.get('auditor_name'),'| capacity',d.get('capacity'))"
check "auditor column updated" "$(q "SELECT auditor_id FROM audit_assignments WHERE id=$ASG")" "$SECOND_AUD"
check "calendar follows new auditor" "$(q "SELECT COUNT(*) FROM calendar_events WHERE assignment_id=$ASG AND auditor_id=$SECOND_AUD")" "2"
check "reassign logged" "$(q "SELECT COUNT(*) FROM activity_logs WHERE entity_type='audit_assignment' AND entity_id=$ASG AND description LIKE '%reassigned%'")" "1"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments/$ASG/reassign" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"auditor_id\":$SECOND_AUD,\"reason\":\"Trying the same auditor again\"}" -o /tmp/a_re2.json -w "   same auditor HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/a_re2.json')).get('message'))"

echo "11. bulk assignment"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments/bulk" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"template\":{\"audit_title\":\"Quarterly welfare audit $RUN_TAIL\",\"auditor_id\":$AUD,\"priority\":\"Medium\",
    \"start_date\":\"2026-11-02\",\"end_date\":\"2026-11-06\",\"due_date\":\"2026-11-12\",\"notify_employer\":false},
  \"targets\":[{\"employer_id\":$EMP,\"unit_id\":$UNIT},{\"employer_id\":$EMP}]
}" -o /tmp/a_bulk.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_bulk.json'))
print('  ',d.get('message'),'|',[c['assignmentNumber'] for c in d.get('created',[])])"
check "bulk created 2" "$(q "SELECT COUNT(*) FROM audit_assignments WHERE audit_title LIKE 'Quarterly welfare audit $RUN_TAIL%'")" "2"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments/bulk" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d "{\"template\":{\"audit_title\":\"No targets\",\"auditor_id\":$AUD},\"targets\":[]}" -o /tmp/a_bulk2.json -w "   no targets HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/a_bulk2.json')).get('message'))"

echo "12. delete guard (report filed) then real delete"
BULK_ONE=$(q "SELECT MIN(id) FROM audit_assignments WHERE audit_title LIKE 'Quarterly welfare audit $RUN_TAIL%'")
q "INSERT INTO audit_reports (uuid, report_number, assignment_id, employer_id, auditor_id, audit_title, status, current_version)
   VALUES (UUID(), 'RPT/TEST/$RUN_TAIL', $BULK_ONE, $EMP, $AUD, 'Verify guard report', 'Draft', 1)"
curl -s -b "$JAR" -X DELETE "$BASE/api/admin/audit-assignments/$BULK_ONE" -H "X-CSRF-Token: $CSRF" -o /tmp/a_del1.json -w "   with report HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/a_del1.json')).get('message'))"
q "DELETE FROM audit_reports WHERE report_number='RPT/TEST/$RUN_TAIL'"
curl -s -b "$JAR" -X DELETE "$BASE/api/admin/audit-assignments/$BULK_ONE" -H "X-CSRF-Token: $CSRF" -o /tmp/a_del2.json -w "   without report HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/a_del2.json')).get('message'))"
check "soft deleted" "$(q "SELECT deleted_at IS NOT NULL FROM audit_assignments WHERE id=$BULK_ONE")" "1"
check "calendar rows cleared" "$(q "SELECT COUNT(*) FROM calendar_events WHERE assignment_id=$BULK_ONE AND deleted_at IS NULL")" "0"
curl -s -b "$JAR" "$BASE/api/admin/audit-assignments/$BULK_ONE" -o /dev/null -w "   detail after delete HTTP %{http_code}\n"

echo "13. cancel"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments/$ASG/cancel" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"reason":"Employer requested a postponement to the next quarter."}' -o /tmp/a_can.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/a_can.json'));a=d.get('assignment',{})
print('  ',d.get('message'),'| status',a.get('status'))"
check "status cancelled" "$(q "SELECT status FROM audit_assignments WHERE id=$ASG")" "Cancelled"
check "calendar cancelled" "$(q "SELECT COUNT(*) FROM calendar_events WHERE assignment_id=$ASG AND status='cancelled'")" "2"
check "cancel logged" "$(q "SELECT COUNT(*) FROM activity_logs WHERE entity_type='audit_assignment' AND entity_id=$ASG AND description LIKE '%cancelled%'")" "1"
curl -s -b "$JAR" -X POST "$BASE/api/admin/audit-assignments/$ASG/cancel" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"x":"y"}' -o /tmp/a_canbad.json -w "   too-short reason HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/a_canbad.json')).get('message'))"

echo "14. RBAC + session guards"
curl -s "$BASE/api/admin/audit-assignments" -o /dev/null -w "   unauthenticated API %{http_code}\n"
curl -s -c "$JAR2" -o /dev/null "$BASE/login"
CSRF2=$(awk '$6=="cos_csrf"{print $7}' "$JAR2")
curl -s -c "$JAR2" -b "$JAR2" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF2" \
  -d '{"identifier":"auditor.test@complianceos.local","password":"Auditor@2026"}' -o /dev/null -w "   auditor login %{http_code}\n"
CSRF2=$(awk '$6=="cos_csrf"{print $7}' "$JAR2")
curl -s -b "$JAR2" "$BASE/api/admin/audit-assignments" -o /dev/null -w "   auditor on admin API %{http_code}\n"
curl -s -b "$JAR2" -o /dev/null -w "   auditor on /admin/audit-assignments %{http_code}\n" "$BASE/admin/audit-assignments"

echo "15. pages"
for path in "/admin/audit-assignments" "/admin/audit-assignments/create" "/admin/audit-assignments/$ASG" "/admin/audit-assignments/$ASG/edit" "/admin/dashboard"; do
  code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" "$BASE$path")
  printf '   %-42s %s\n' "$path" "$code"
  check "page $path" "$code" "200"
done
curl -s -b "$JAR" -o /dev/null -w "   missing assignment %{http_code}\n" "$BASE/admin/audit-assignments/999999"

echo "16. notifications raised by the workflow"
q "SELECT CONCAT('   ', n.type, ' | ', LEFT(n.title, 34), ' | ', n.user_id)
     FROM notifications n WHERE n.entity_type='audit_assignment' AND n.entity_id=$ASG ORDER BY n.id LIMIT 6"
check "notifications for assignment" "$(q "SELECT COUNT(*) > 0 FROM notifications WHERE entity_type='audit_assignment' AND entity_id=$ASG")" "1"

echo
printf 'RESULT %d passed, %d failed (run %s)\n' "$PASS" "$FAIL" "$RUN_TAIL"
[ "$FAIL" -eq 0 ] || exit 1
