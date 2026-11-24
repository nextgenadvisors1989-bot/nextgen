/** Unit checks for lib/calculators: npx tsx scripts/test-calculators.ts */
import {
  afr, asr, bonus, electricalPower, emissions, epf, esi, extinguishersFor, flammability, gratuity, incidentRate, ltifr, manHours, NOISE_TABLE, overtime, oxygenStatus, permissibleNoiseHours,
  pollutantLoadKgPerDay, pressure, riskMatrix, riskScore, safeWorkingLoad, safetyRates, scaffoldLoad, trir, waterBalance,
} from '../lib/calculators';

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

// the safety officer's chart: each line is the chart's own worked example
check('chart 1 LTIFR: 2 LTI, 500,000 hours = 4', ltifr(2, 500000), 4);
check('chart 2 TRIR: 5 cases, 500,000 hours = 2', trir(5, 500000), 2);
check('chart 3 AFR: 3 accidents, 600,000 hours = 5', afr(3, 600000), 5);
check('chart 4 ASR: 120 lost workdays, 600,000 hours = 200', asr(120, 600000), 200);
check('chart 5 incident rate: 10 incidents, 250 employees = 8,000', incidentRate(10, 250), 8000);
check('chart 6 man-hours: 100 x 8 x 26 = 20,800', manHours(100, 8, 26), 20800);
check('chart rates with no hours are 0, not a divide by zero', [ltifr(1, 0), trir(1, 0), afr(1, 0), asr(1, 0), incidentRate(1, 0)], [0, 0, 0, 0, 0]);
check('chart 7 extinguishers: 1,000 sq m needs 4 to 5', extinguishersFor(1000), { fewest: 4, most: 5 });
check('chart 7 extinguishers: 0 area needs none', extinguishersFor(0), { fewest: 0, most: 0 });
check("chart 8 noise table is the chart's", NOISE_TABLE.map((row) => permissibleNoiseHours(row.level)), [8, 4, 2, 1]);
check('chart 8 noise: 97 dB allows half an hour', permissibleNoiseHours(97), 0.5);
check('chart 9 oxygen: 19.5 and 23.5 are safe, outside is not', [oxygenStatus(19.4), oxygenStatus(19.5), oxygenStatus(20.9), oxygenStatus(23.5), oxygenStatus(23.6)], ['Oxygen deficient', 'Safe', 'Safe', 'Safe', 'Fire risk']);
check('chart 10 LEL/UEL: methane 5 - 15 %', [flammability(3, 5, 15).zone, flammability(10, 5, 15).zone, flammability(20, 5, 15).zone], ['Below LEL - too lean', 'LEL to UEL - flammable range', 'Above UEL - too rich']);
check('chart 10 hot work needs gas below 10 % of the LEL', [flammability(0.4, 5, 15).hotWorkAllowed, flammability(0.5, 5, 15).hotWorkAllowed], [true, false]);
check('chart 11 scaffold: 500 + 1500 + 300 = 2300 kg (2.3 t)', scaffoldLoad(500, 1500, 300), { kg: 2300, tonnes: 2.3 });
check('chart 12 power: 230 V x 10 A = 2300 W (2.3 kW)', electricalPower(230, 10), { watts: 2300, kilowatts: 2.3 });
check('chart 13 pressure: 1000 N on 2 sq m = 500 Pa', pressure(1000, 2), 500);
check('chart 13 pressure on no area is 0', pressure(1000, 0), 0);
check('chart 14 SWL: 10 ton breaking load, FOS 5 = 2 ton', safeWorkingLoad(10, 5), 2);
check('chart 15 risk: likelihood 4 x severity 5 = 20', riskScore(4, 5).score, 20);
check('chart 15 matrix is 5 x 5 with 1 at the bottom left and 25 at the top right', [riskMatrix().length, riskMatrix()[0].cells.length, riskMatrix()[4].cells[0].score, riskMatrix()[0].cells[4].score], [5, 5, 1, 25]);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
