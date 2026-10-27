#!/usr/bin/env bash
# Auditor module end-to-end HTTP verification against :3000.
#   bash scripts/verify-auditors.sh
set -u
BASE=http://127.0.0.1:3001
JAR=/tmp/audverify.txt
RUN_TAIL=$(printf '%04d' $(( (RANDOM % 9000) + 1000 )))
rm -f "$JAR"

curl -s -c "$JAR" -o /dev/null "$BASE/login"
CSRF=$(awk '$6=="cos_csrf"{print $7}' "$JAR")
curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" -d '{"identifier":"admin@complianceos.local","password":"Admin@2026"}' \
  -o /dev/null -w "1. login %{http_code}\n"
CSRF=$(awk ' $6=="cos_csrf"{print $7}' "$JAR")

echo "2. lookups (types + employers)"
curl -s -b "$JAR" "$BASE/api/admin/auditors/options?lookups=true" | python3 -c "
import json,sys;d=json.load(sys.stdin)
print('   auditor types:',len(d['auditorTypes']),'| employers:',len(d['employers']))
print('   first type:',d['auditorTypes'][0]['name'], d['auditorTypes'][0]['code'])"
TYPE_ID=$(curl -s -b "$JAR" "$BASE/api/admin/auditors/options?lookups=true" | python3 -c "import json,sys;print(json.load(sys.stdin)['auditorTypes'][0]['id'])")

echo "3. register auditor with a portal login"
curl -s -b "$JAR" -X POST "$BASE/api/admin/auditors" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"name\":\"Anand Krishnan $RUN_TAIL\",\"email\":\"anand.krishnan$RUN_TAIL@example.com\",\"mobile\":\"+91984527$RUN_TAIL\",
  \"auditor_type_id\":$TYPE_ID,\"role_title\":\"Lead Safety Auditor\",\"specialization\":\"Manufacturing\",
  \"qualification\":\"B.E. Mechanical, NEBOSH IGC\",\"experience_years\":9.5,
  \"address\":\"24, Bharathi Nagar, Saibaba Colony\",\"city\":\"Coimbatore\",\"state\":\"Tamil Nadu\",\"pincode\":\"641011\",
  \"pan_number\":\"ABCPK1234L\",\"aadhaar_number\":\"345678901234\",
  \"bank_name\":\"Indian Bank\",\"bank_account_number\":\"601223456789\",\"ifsc_code\":\"IDIB000C123\",
  \"date_of_joining\":\"2021-04-01\",\"max_concurrent_audits\":6,\"status\":\"active\",
  \"create_portal_user\":true,\"portal_user_email\":\"anand.krishnan$RUN_TAIL@example.com\",\"portal_user_name\":\"Anand Krishnan $RUN_TAIL\"
}" -o /tmp/aud.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/aud.json'))
print('  ',d.get('message'),'| code',d.get('auditorCode'),'| credentials',bool(d.get('credentials')),'| warnings',d.get('warnings'))"
AUD=$(python3 -c "import json;print(json.load(open('/tmp/aud.json')).get('auditorId'))")

echo "4. duplicate email is rejected"
curl -s -b "$JAR" -X POST "$BASE/api/admin/auditors" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -d "{
  \"name\":\"Duplicate Auditor\",\"email\":\"anand.krishnan$RUN_TAIL@example.com\",\"auditor_type_id\":$TYPE_ID
}" -o /tmp/dup.json -w "   HTTP %{http_code}\n"
python3 -c "import json;print('  ',json.load(open('/tmp/dup.json')).get('message'))"

echo "5. detail + stats"
curl -s -b "$JAR" "$BASE/api/admin/auditors/$AUD" -o /tmp/auddetail.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/auddetail.json'))
a=d['auditor'];s=d['stats']
print('  ',a['auditor_code'],a['name'],'| type',a['auditor_type_name'],'| capacity',a['max_concurrent_audits'])
print('   stats: assignments',s['assignments'],'pending',s['pending'],'overdue',s['overdue'],'reports',s['reportsSubmitted'])
print('   login:',bool(d['login']),'| documents:',len(d['documents']),'| clients:',len(d['clients']))"

echo "6. update profile (audit-trailed)"
curl -s -b "$JAR" -X PUT "$BASE/api/admin/auditors/$AUD" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"role_title":"Senior Lead Safety Auditor","experience_years":10.5,"max_concurrent_audits":8,"city":"Tiruppur"}' \
  -o /tmp/audput.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/audput.json'));a=d.get('auditor',{})
print('  ',d.get('message'),'->',a.get('role_title'),'| exp',a.get('experience_years'),'| city',a.get('city'))"

echo "7. validation: bad PAN, bad IFSC, bad pincode"
curl -s -b "$JAR" -X PUT "$BASE/api/admin/auditors/$AUD" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"pan_number":"ABC12","ifsc_code":"IDIB123","pincode":"64"}' -o /tmp/audbad.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/audbad.json'))
print('  ',d.get('message'),'|',[e['field'] for e in d.get('errors',[])])"

echo "8. rating"
curl -s -b "$JAR" -X PUT "$BASE/api/admin/auditors/$AUD/rating" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"rating":4.5}' -w "   HTTP %{http_code}\n" | head -c 160
curl -s -b "$JAR" -X PUT "$BASE/api/admin/auditors/$AUD/rating" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"rating":7}' -o /tmp/audrate.json -w "   out-of-range HTTP %{http_code}\n"

echo "9. list, filters, sorting, pagination"
curl -s -b "$JAR" "$BASE/api/admin/auditors?page=1&limit=10&sortBy=name&sortDir=asc" -o /tmp/audlist.json -w "   HTTP %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/audlist.json'));p=d['pagination']
print('   rows',len(d['data']),'of',p['total'],'| showing',p['from'],'to',p['to'])
print('   workload cols:',d['data'][0]['pending_assignments'],'/',d['data'][0]['max_concurrent_audits'])"
for q in "status=active" "auditorTypeId=$TYPE_ID" "specialization=Manufacturing" "state=Tamil%20Nadu" "availability=available" "search=Anand"; do
  curl -s -b "$JAR" "$BASE/api/admin/auditors?$q" -o /dev/null -w "   $q -> %{http_code}\n"
done

echo "10. auditor options (capacity shown for assignment planning)"
curl -s -b "$JAR" "$BASE/api/admin/auditors/options?search=Anand" | python3 -c "
import json,sys;d=json.load(sys.stdin)
print('   options:',len(d['data']),'| first:',d['data'][0]['name'],'open',d['data'][0]['open_assignments'],'/',d['data'][0]['max_concurrent_audits'])"

echo "11. auditor types register"
curl -s -b "$JAR" "$BASE/api/admin/auditor-types" | python3 -c "
import json,sys;d=json.load(sys.stdin);print('   seeded types:',len(d['data']),'|',', '.join(r['code'] for r in d['data'][:5]))"
curl -s -b "$JAR" -X POST "$BASE/api/admin/auditor-types" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d "{\"name\":\"Boiler Safety Auditor $RUN_TAIL\",\"code\":\"BOIL$RUN_TAIL\",\"description\":\"Boiler and pressure vessel statutory inspections\",\"specialization\":\"Manufacturing\",\"status\":\"active\"}" \
  -o /tmp/ttype.json -w "   create %{http_code}\n"
TYPE_NEW=$(python3 -c "import json;print(json.load(open('/tmp/ttype.json')).get('auditorTypeId'))")
curl -s -b "$JAR" -X PUT "$BASE/api/admin/auditor-types/$TYPE_NEW" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"description":"Boiler, pressure vessel and steam pipeline inspections"}' -w "   update %{http_code}\n" | head -c 140
curl -s -b "$JAR" -X DELETE "$BASE/api/admin/auditor-types/$TYPE_NEW" -H "X-CSRF-Token: $CSRF" -w "   archive %{http_code}\n" | head -c 140
curl -s -b "$JAR" -X DELETE "$BASE/api/admin/auditor-types/$TYPE_ID" -H "X-CSRF-Token: $CSRF" -w "   archive in-use type %{http_code}\n" | head -c 200

echo "12. document vault: upload against the auditor"
printf 'NEBOSH certificate copy for auditor %s\n' "$RUN_TAIL" > /tmp/cert.txt
UP=$(curl -s -b "$JAR" -X POST "$BASE/api/files/upload" -H "X-CSRF-Token: $CSRF" \
  -F "files=@/tmp/cert.txt;type=text/plain" -F "entityType=AUDITOR" -F "entityId=$AUD" -F "category=Auditor certificate")
FILE_ID=$(echo "$UP" | python3 -c "import json,sys;print(json.load(sys.stdin)['files'][0]['id'])")
echo "   uploaded file #$FILE_ID"
curl -s -b "$JAR" "$BASE/api/admin/auditors/$AUD" | python3 -c "
import json,sys;d=json.load(sys.stdin)
print('   documents now:',len(d['documents']),'| first:',d['documents'][0]['original_name'])"
curl -s -b "$JAR" "$BASE/api/files/$FILE_ID/download" -o /dev/null -w "   download %{http_code}\n"

echo "13. admin pages render"
for p in /admin/auditors /admin/auditors/create "/admin/auditors/$AUD" "/admin/auditors/$AUD/edit" /admin/auditor-types; do
  curl -s -b "$JAR" -o /dev/null -w "   $p -> %{http_code}\n" "$BASE$p"
done

echo "14. auditor login is provisioned and reaches only the auditor workspace"
rm -f /tmp/audjar.txt
curl -s -c /tmp/audjar.txt -o /dev/null "$BASE/login"
ACS=$(awk '$6=="cos_csrf"{print $7}' /tmp/audjar.txt)
AUSER=$(python3 -c "import json;print(json.load(open('/tmp/aud.json'))['credentials']['username'])")
APASS=$(python3 -c "import json;print(json.load(open('/tmp/aud.json'))['credentials']['temporaryPassword'])")
curl -s -c /tmp/audjar.txt -b /tmp/audjar.txt -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -H "X-CSRF-Token: $ACS" \
  -d "{\"identifier\":\"$AUSER\",\"password\":\"$APASS\"}" -o /tmp/audlogin.json -w "   login %{http_code}\n"
python3 -c "
import json;d=json.load(open('/tmp/audlogin.json'))
print('   redirectTo:',d.get('redirectTo'),'| role:',d.get('user',{}).get('primaryRole'))"
curl -s -b /tmp/audjar.txt "$BASE/api/admin/auditors" -o /dev/null -w "   auditor -> admin API %{http_code}\n"
curl -s -b /tmp/audjar.txt -o /dev/null -w "   auditor -> /admin/auditors page %{http_code}\n" "$BASE/admin/auditors"

echo "15. archive (uses a second, assignment-free auditor)"
AUD2=$(curl -s -b "$JAR" -X POST "$BASE/api/admin/auditors" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d "{\"name\":\"Temporary Auditor $RUN_TAIL\",\"email\":\"temp.auditor$RUN_TAIL@example.com\",\"auditor_type_id\":$TYPE_ID,\"status\":\"active\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('auditorId'))")
echo "   created auditor $AUD2"
curl -s -b "$JAR" -X DELETE "$BASE/api/admin/auditors/$AUD2" -H "X-CSRF-Token: $CSRF" -w "   archive %{http_code}\n" | head -c 200
curl -s -b "$JAR" "$BASE/api/admin/auditors/$AUD2" -o /dev/null -w "   detail after archive %{http_code}\n"
curl -s -b "$JAR" -X POST "$BASE/api/admin/auditors/$AUD2/restore" -H "X-CSRF-Token: $CSRF" -w "   restore %{http_code}\n" | head -c 160
curl -s -b "$JAR" "$BASE/api/admin/auditors/$AUD2" -o /dev/null -w "   detail after restore %{http_code}\n"
curl -s -b "$JAR" -X DELETE "$BASE/api/admin/auditors/$AUD2" -H "X-CSRF-Token: $CSRF" -o /dev/null -w "   re-archive %{http_code}\n"

echo "16. audit trail written for the profile update"
curl -s -b "$JAR" "$BASE/api/admin/auditors/$AUD" | python3 -c "
import json,sys;d=json.load(sys.stdin)
print('   role_title:',d['auditor']['role_title'],'| rating:',d['auditor']['rating'],'| city:',d['auditor']['city'])"
