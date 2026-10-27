/**
 * Unit checks for lib/water/usage.ts (no server or database needed):  npx tsx scripts/test-water-usage.ts
 */
import { intervals, monthly, nocStatusFor, recentIntervals, summarise, usageStatus } from '../lib/water/usage';

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const same = typeof expected === 'number' && typeof actual === 'number' ? Math.abs(actual - expected) < 1e-6 : JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? '  ok  ' : '  FAIL'} ${name}${same ? '' : `  -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
  if (!same) failed += 1;
}

// 700 kilolitres in 7 days is 100 KLD, which is exactly the approved 100,000 litres a day
const a = intervals([{ date: '2026-01-01', value: 1000 }, { date: '2026-01-08', value: 1700 }], 'KL');
check('one interval', a.length, 1);
check('litres', a[0].litres, 700000);
check('days', a[0].days, 7);
check('kld', a[0].kld, 100);
const sa = summarise(a, 100000);
check('100 percent of the limit', sa.percent, 100);
check('exactly at the limit is Near limit', sa.status, 'Near limit');

// readings in litres
const l = intervals([{ date: '2026-02-01', value: 5_000_000 }, { date: '2026-02-11', value: 6_000_000 }], 'L');
check('litres unit: 1,000,000 L over 10 days', l[0].kld, 100);

// the order the readings arrive in does not matter
const unordered = intervals([{ date: '2026-01-08', value: 1700 }, { date: '2026-01-01', value: 1000 }], 'KL');
check('unordered readings sorted', unordered[0].from, '2026-01-01');

// a meter reset starts a new baseline: no interval across the reset
const reset = intervals([
  { date: '2026-03-01', value: 900 }, { date: '2026-03-08', value: 20, isReset: true }, { date: '2026-03-15', value: 720 },
], 'KL');
check('reset skips the interval that crosses it', reset.length, 1);
check('after the reset: 700 KL in 7 days', reset[0].kld, 100);

// a month boundary: 400 KL over 4 days (29 Jan to 2 Feb) is 100 KLD; two days land in each month
const months = monthly(intervals([{ date: '2026-01-29', value: 0 }, { date: '2026-02-02', value: 400 }], 'KL'), 100000);
check('two months', months.map((m) => m.month), ['2026-01', '2026-02']);
check('January share', months[0].litres, 200000);
check('February share', months[1].litres, 200000);
check('January days', months[0].days, 2);

// status thresholds
check('85 percent is within the limit', usageStatus(85), 'Within limit');
check('90 percent is near the limit', usageStatus(90), 'Near limit');
check('101 percent is over', usageStatus(101), 'Over limit');
check('no readings', usageStatus(null), 'No data');
const over = summarise(intervals([{ date: '2026-04-01', value: 0 }, { date: '2026-04-11', value: 1100 }], 'KL'), 100000);
check('110 KLD against 100 KLD', over.percent, 110);
check('over status', over.status, 'Over limit');
check('empty summary has no percent', summarise([], 100000).percent, null);

// the recent window clips an interval that started before it
const recent = recentIntervals(intervals([{ date: '2026-05-01', value: 0 }, { date: '2026-05-31', value: 3000 }], 'KL'), '2026-05-31', 10);
check('last 10 days of a 30 day interval', recent[0].days, 10);
check('same rate', recent[0].kld, 100);
check('nothing recent when the interval is older', recentIntervals(a, '2026-06-30', 30).length, 0);

// NOC status from the expiry date
check('valid', nocStatusFor('2027-06-01', null, '2026-10-17'), 'Valid');
check('expiring within 90 days', nocStatusFor('2026-12-01', null, '2026-10-17'), 'Expiring Soon');
check('expired', nocStatusFor('2026-10-01', null, '2026-10-17'), 'Expired');
check('applied stays applied', nocStatusFor('2026-10-01', 'Applied', '2026-10-17'), 'Applied');
check('no expiry is valid', nocStatusFor(null, null, '2026-10-17'), 'Valid');

console.log(failed ? `\n${failed} check(s) failed` : '\nAll water usage checks passed');
process.exit(failed ? 1 : 0);
