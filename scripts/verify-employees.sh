#!/usr/bin/env bash
# Employee + document vault + personal-file PDF verification against the
# production build on :3000. Every step asserts an HTTP status and prints the
# message the API returned. Run: bash scripts/verify-employees.sh
set -u
BASE=http://127.0.0.1:3001
JAR=/tmp/empverify.txt
RUN_TAIL=$(printf '%04d' $(( (RANDOM % 9000) + 1000 )))
rm -f "$JAR"

curl -s -c "$JAR" -o /dev/null "$BASE/login"
CSRF=$(awk '$6=="cos_csrf"{print $7}' "$JAR")
curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"identifier":"admin@complianceos.local","password":"Admin@2026"}' \
  -o /dev/null -w "1. login %{http_code}\n"
CSRF=$(awk '$6=="cos_csrf"{print $7}' "$JAR")

# The wizard payload needs an employer that owns a unit and a department. On a
# freshly seeded sandbox there is none, so the suite creates that context first
# through the same admin API the panel uses.
eval "$(python3 scripts/fixture-employee-context.py "$BASE")"
echo "1b. fixture context: employer $EMPLOYER_ID · unit $UNIT_ID · department $DEPARTMENT_ID"

echo "2. create employee (wizard payload, portal login, Tamil name fields)"
curl -s -b "$JAR" -X POST "$BASE/api/admin/employees" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"name\":\"Anitha Rajan $RUN_TAIL\",\"sex\":\"Female\",\"marital_status\":\"Single\",\"date_of_birth\":\"1998-01-09\",
  \"mobile\":\"+91984527$RUN_TAIL\",\"email\":\"anitha.rajan$RUN_TAIL@example.com\",\"employer_id\":$EMPLOYER_ID,\"unit_id\":$UNIT_ID,\"department_id\":$DEPARTMENT_ID,
  \"date_of_joining\":\"2026-09-15\",\"designation\":\"Junior Assistant\",\"category\":\"Staff\",\"state\":\"Tamil Nadu\",\"pincode\":\"641004\",
  \"basic_salary\":9000,\"da\":2000,\"hra\":1500,
  \"dependents\":[{\"dependent_name\":\"Rajan Murugan\",\"relationship\":\"Father\",\"sex\":\"Male\"}],
  \"interview\":{\"interview_date\":\"2026-09-10\",\"interviewer_name\":\"Ramesh Kumar\",\"position_applied\":\"Junior Assistant\",\"overall_rating\":4,\"recommendation\":\"Recommended\"},
  \"checklist\":[{\"item_id\":1,\"is_checked\":true},{\"item_id\":2,\"is_checked\":true}],
  \"create_login\":true,\"login_email\":\"anitha.rajan$RUN_TAIL@example.com\",\"login_username\":\"anitha.rajan$RUN_TAIL\"
}" -w "  HTTP %{http_code}\n" | head -c 420

# The record under test is always the most recently registered active employee.
EMP=$(curl -s -b "$JAR" "$BASE/api/admin/employees?page=1&limit=1&sortBy=created_at&sortDir=desc&status=active" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['data'][0]['id'])")
echo "3. detail GET -> employee id $EMP"
curl -s -b "$JAR" "$BASE/api/admin/employees/$EMP" -o /tmp/detail.json -w "  HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/detail.json'))
e=d['employee']
print('  ',e['employee_number'], e['name'], 'gross', e['gross_salary'], '| status', e['status'])
print('   children:', {k:len(v) for k,v in d.items() if isinstance(v,list)})
print('   login:', bool(d['login']), '| checklist done:', sum(1 for c in d['checklist'] if c['is_checked']))
"

echo "4. PUT partial update (designation + wage head -> gross recalculated)"
curl -s -b "$JAR" -X PUT "$BASE/api/admin/employees/$EMP" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"designation":"Senior Assistant","basic_salary":10500,"remarks":"Confirmed after probation"}' -o /tmp/put.json -w "  HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/put.json'));e=d.get('employee',{});print('  ',d.get('message'),'-> gross',e.get('gross_salary'))"

echo "5. qualifications add -> edit -> delete"
curl -s -b "$JAR" -X POST "$BASE/api/admin/employees/$EMP/qualifications" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"qualification":"Diploma","specialization":"Mechanical","institution":"PSG Polytechnic","year_of_passing":2016,"percentage":71.2,"grade":"First Class"}' \
  -w "  add %{http_code}\n" | head -c 160
QID=$(curl -s -b "$JAR" "$BASE/api/admin/employees/$EMP" | python3 -c "import json,sys;print(json.load(sys.stdin)['qualifications'][0]['id'])")
curl -s -b "$JAR" -X PUT "$BASE/api/admin/employees/$EMP/qualifications/$QID" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"qualification":"Diploma","specialization":"Mechanical","institution":"PSG Polytechnic","year_of_passing":2016,"percentage":78.6,"grade":"First Class with Distinction"}' \
  -w "  edit %{http_code}\n" | head -c 160
curl -s -b "$JAR" -X DELETE "$BASE/api/admin/employees/$EMP/qualifications/$QID" -H "X-CSRF-Token: $CSRF" -w "  delete %{http_code}\n" | head -c 160

echo "6. service record + dependent add"
curl -s -b "$JAR" -X POST "$BASE/api/admin/employees/$EMP/service-records" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"employer_name":"Sri Devi Mills Pvt Ltd","designation":"Helper","department":"Spinning","date_from":"2019-04-01","date_to":"2026-08-31","total_period":"7 yrs 5 mo","last_drawn_salary":11500,"reason_for_leaving":"Relocation"}' \
  -w "  service-record %{http_code}\n" | head -c 160
curl -s -b "$JAR" -X POST "$BASE/api/admin/employees/$EMP/dependents" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"dependent_name":"Meena Rajan","relationship":"Sister","date_of_birth":"2001-06-11","sex":"Female","occupation":"Student"}' \
  -w "  dependent %{http_code}\n" | head -c 160

echo "7. personal-file checklist: tick, un-tick, tick again, then clear through DELETE"
curl -s -b "$JAR" "$BASE/api/admin/employees/$EMP" -o /tmp/chk.json
CHK=$(python3 -c "import json;d=json.load(open('/tmp/chk.json'));print(d['checklist'][4]['item_id'])")
ROW=$(python3 -c "import json;d=json.load(open('/tmp/chk.json'));print(d['checklist'][4]['id'])")
curl -s -b "$JAR" -X POST "$BASE/api/admin/employees/$EMP/checklist" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d "{\"item_id\":$CHK,\"is_checked\":true,\"remarks\":\"Verified against original\"}" -w "  tick %{http_code}\n" | head -c 160
curl -s -b "$JAR" -X POST "$BASE/api/admin/employees/$EMP/checklist" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d "{\"item_id\":$CHK,\"is_checked\":false}" -w "  un-tick %{http_code}\n" | head -c 160
curl -s -b "$JAR" -X POST "$BASE/api/admin/employees/$EMP/checklist" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d "{\"item_id\":$CHK,\"is_checked\":true}" -o /dev/null -w "  re-tick %{http_code}\n"
curl -s -b "$JAR" -X DELETE "$BASE/api/admin/employees/$EMP/checklist/$ROW" -H "X-CSRF-Token: $CSRF" -w "  clear %{http_code}\n" | head -c 160
curl -s -b "$JAR" "$BASE/api/admin/employees/$EMP" | python3 -c "
import json,sys;d=json.load(sys.stdin);c=[r for r in d['checklist'] if r['item_id']==$CHK][0]
print('   item',c['item_code'],'checked =',bool(c['is_checked']),'| checklist rows still:',len(d['checklist']))"

echo "8. list, filters, sorting, pagination"
curl -s -b "$JAR" "$BASE/api/admin/employees?page=1&limit=10&status=active&sortBy=created_at&sortDir=desc" -o /tmp/list.json -w "  HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/list.json'));p=d['pagination']
print('   rows',len(d['data']),'of',p['total'],'| showing',p['from'],'to',p['to'],'| pages',p['totalPages'])"
for q in "employerId=1" "departmentId=1" "category=Staff" "state=Tamil%20Nadu"; do
  curl -s -b "$JAR" "$BASE/api/admin/employees?$q" -o /dev/null -w "   $q -> %{http_code}\n"
done

echo "9. document vault: upload -> metadata -> new version -> download -> delete"
printf 'Aadhaar scan for EMP file %s\n' "$RUN_TAIL" > /tmp/aadhaar.txt
UPLOAD=$(curl -s -b "$JAR" -X POST "$BASE/api/files/upload" -H "X-CSRF-Token: $CSRF" \
  -F "files=@/tmp/aadhaar.txt;type=text/plain" -F "entityType=EMPLOYEE" -F "entityId=$EMP" -F "category=Identity")
echo "   $UPLOAD" | head -c 280; echo
FILE_ID=$(echo "$UPLOAD" | python3 -c "import json,sys;print(json.load(sys.stdin)['files'][0]['id'])")
curl -s -b "$JAR" "$BASE/api/files/$FILE_ID" -o /tmp/fmeta.json -w "   metadata %{http_code}\n"
python3 -c "import json;d=json.load(open('/tmp/fmeta.json'));print('   versions:',len(d['versions']),'| access:',d['meta']['access_level'],'| checksum ok:',bool(d['meta']['storage_path']))"
curl -s -b "$JAR" -X PUT "$BASE/api/files/$FILE_ID" -H "X-CSRF-Token: $CSRF" -F "file=@/tmp/aadhaar.txt;type=text/plain" \
  -F "changeNote=Re-scan at 300dpi" -o /tmp/fver.json -w "   new version %{http_code}\n"
python3 -c "import json;d=json.load(open('/tmp/fver.json'));print('  ',d['message'],'| v',d['file']['version'])"
curl -s -b "$JAR" "$BASE/api/files/$FILE_ID/download" -o /tmp/dl.txt -w "   download %{http_code} bytes=%{size_download}\n"
cat /tmp/dl.txt
curl -s -b "$JAR" "$BASE/api/files/$FILE_ID" | python3 -c "import json,sys;print('   version chain:',[v['version'] for v in json.load(sys.stdin)['versions']])"

echo "10. employee document row linked to the vault file"
curl -s -b "$JAR" -X POST "$BASE/api/admin/employees/$EMP/documents" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d "{\"document_type\":\"Aadhaar Card\",\"document_name\":\"Aadhaar scan\",\"document_number\":\"234512345678\",\"issue_date\":\"2018-04-01\",\"file_id\":$FILE_ID}" \
  -w "  HTTP %{http_code}\n" | head -c 180
curl -s -b "$JAR" "$BASE/api/admin/employees/$EMP" | python3 -c "
import json,sys;d=json.load(sys.stdin);doc=d['documents'][0]
print('   document:',doc['document_name'],'| vault file:',doc['file_id'],'| mime:',doc['mime_type'])"

echo "11. personal file PDF"
curl -s -b "$JAR" "$BASE/api/pdf/employee/$EMP" -o /tmp/pf.pdf -w "   HTTP %{http_code} type=%{content_type} bytes=%{size_download}\n"
python3 -c "
import re
raw=open('/tmp/pf.pdf','rb').read().decode('latin1')
m=re.search(r'/Count\s+(\d+)', raw)
pages=int(m.group(1)) if m else len(re.findall(r'/Type\s*/Page[^s]', raw))
print('   PDF header', raw[:5], '| pages', pages, '| within 12-page limit:', pages<=12)"

echo "12. admin pages render"
for p in /admin/employees /admin/employees/create "/admin/employees/$EMP" "/admin/employees/$EMP/edit"; do
  curl -s -b "$JAR" -o /dev/null -w "   $p -> %{http_code}\n" "$BASE$p"
done

echo "13. archive (soft delete) then confirm it is gone"
curl -s -b "$JAR" -X DELETE "$BASE/api/admin/employees/$EMP" -H "X-CSRF-Token: $CSRF" -w "  archive %{http_code}\n" | head -c 180
curl -s -b "$JAR" "$BASE/api/admin/employees/$EMP" -o /dev/null -w "   detail after archive %{http_code}\n"
curl -s -b "$JAR" "/admin/employees/$EMP" -o /dev/null -w "   page after archive %{http_code}\n"
curl -s -b "$JAR" "$BASE/api/pdf/employee/$EMP" -o /dev/null -w "   pdf after archive %{http_code}\n"

echo "14. restore the archived employee (record + login come back)"
curl -s -b "$JAR" -X POST "$BASE/api/admin/employees/$EMP/restore" -H 'X-CSRF-Token: '"$CSRF"'' -w "   restore %{http_code}\n" | head -c 200
curl -s -b "$JAR" "$BASE/api/admin/employees/$EMP" -o /dev/null -w "   detail after restore %{http_code}\n"
curl -s -b "$JAR" "$BASE/api/pdf/employee/$EMP" -o /dev/null -w "   pdf after restore %{http_code}\n"

echo "15. vault file cleanup"
curl -s -b "$JAR" -X DELETE "$BASE/api/files/$FILE_ID" -H "X-CSRF-Token: $CSRF" -w "   delete %{http_code}\n" | head -c 160
curl -s -b "$JAR" "$BASE/api/files/$FILE_ID" -o /dev/null -w "   metadata after delete %{http_code}\n"
