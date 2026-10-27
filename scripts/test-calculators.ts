/** Unit checks for lib/calculators: npx tsx scripts/test-calculators.ts */
import { bonus, emissions, epf, esi, gratuity, manHours, overtime, pollutantLoadKgPerDay, riskScore, safetyRates, waterBalance } from '../lib/calculators';

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : `  -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

// EPF
check('EPF on a wage above the ceiling is capped at 15,000', epf(20000).employee, 1800);
check('EPF: employer share is the same 12 % in two parts', [epf(20000).employerEps, epf(20000).employerEpf, epf(20000).employerTotal], [1250, 550, 1800]);
check('EPF below the ceiling uses the wage', epf(10000).employee, 1200);
check('EPF on actual wage ignores the ceiling for the PF part', epf(20000, { onActualWage: true }).employee, 2400);
check('EPS stays on the ceiling even when PF is on the actual wage', epf(20000, { onActualWage: true }).employerEps, 1250);

// ESI
check('ESI at 15,000 gross', esi(15000), { covered: true, employee: 113, employer: 488, total: 601 });
check('ESI rounds up to the next rupee', esi(10000).employee, 75);
check('ESI exactly at the ceiling is covered', esi(21000).covered, true);
check('ESI above the ceiling is not covered', esi(21001), { covered: false, employee: 0, employer: 0, total: 0 });

// gratuity
check('gratuity: 30,000 x 15/26 x 10 years', gratuity(30000, 10, 0).amount, 173077);
check('gratuity: under five years pays nothing', gratuity(30000, 4, 11).eligible, false);
check('gratuity: 4 years 8 months counts as 5 but is not five years of service', gratuity(30000, 4, 8).eligible, false);
check('gratuity: 5 years 7 months counts as 6 years', gratuity(30000, 5, 7).yearsCounted, 6);
check('gratuity: 5 years 6 months stays at 5', gratuity(30000, 5, 6).yearsCounted, 5);
check('gratuity is capped', gratuity(500000, 30, 0), { eligible: true, yearsCounted: 30, amount: 2000000, capped: true, formula: '500000 x 15 / 26 x 30' });

// bonus
check('bonus: 7,000 ceiling, 8.33 %, full year', bonus(20000, 12).payable, 6997.2);
check('bonus: part year pays pro rata', bonus(20000, 6).payable, 3498.6);
check('bonus: wage below the ceiling is used as is', bonus(5000, 12).wageUsed, 5000);
check('bonus: percent is held between 8.33 and 20', [bonus(7000, 12, { percent: 5 }).annual, bonus(7000, 12, { percent: 40 }).annual], [6997.2, 16800]);
check('bonus: a higher calculation ceiling (minimum wage) is honoured', bonus(20000, 12, { ceiling: 12000 }).wageUsed, 12000);

// overtime
check('overtime: 26,000 a month, 8-hour day, double wages', overtime(26000, 4), { hourly: 125, rate: 250, amount: 1000 });

// safety
check('man-hours', manHours(150, 8, 300), 360000);
check('frequency / severity / incidence', safetyRates({ injuries: 3, daysLost: 45, manHours: 360000, averageEmployees: 150 }), { manHours: 360000, frequencyRate: 8.33, severityRate: 125, incidenceRate: 20, averageDaysLost: 15 });
check('no man-hours means no rates, not a divide by zero', safetyRates({ injuries: 1, daysLost: 1, manHours: 0, averageEmployees: 0 }).frequencyRate, 0);
check('risk 2 x 2 is low', riskScore(2, 2), { score: 4, level: 'Low' });
check('risk 3 x 3 is medium', riskScore(3, 3).level, 'Medium');
check('risk 4 x 4 is high', riskScore(4, 4).level, 'High');
check('risk 5 x 5 is extreme', riskScore(5, 5), { score: 25, level: 'Extreme' });
check('risk inputs are held to 1 to 5', riskScore(9, 0).score, 5);

// environment
const e = emissions([{ label: 'Electricity', quantity: 10000, factor: 0.7 }, { label: 'Diesel', quantity: 500, factor: 2.68 }]);
check('emissions add up', [e.totalKg, e.totalTonnes], [8340, 8.34]);
check('pollutant load: 250 KLD at 400 mg/l is 100 kg a day', pollutantLoadKgPerDay(250, 400), 100);
check('water balance', waterBalance({ freshKld: 80, recycledKld: 20, dischargedKld: 70, unitsPerDay: 50 }), { intensity: 2, recycledShare: 20, freshWater: 80, lossOrUnaccounted: 30 });
check('water balance with nothing produced', waterBalance({ freshKld: 10, recycledKld: 0, dischargedKld: 5, unitsPerDay: 0 }).intensity, 0);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
