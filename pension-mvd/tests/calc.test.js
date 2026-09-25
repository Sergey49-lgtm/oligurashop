const test = require('node:test');
const assert = require('node:assert');
const C = require('../calc.js');

test('процент за выслугу: 50 % за 20 лет, +3 % за год, максимум 85 %', () => {
  assert.strictEqual(C.seniorityPercent(19), 0);
  assert.strictEqual(C.seniorityPercent(20), 50);
  assert.strictEqual(C.seniorityPercent(25), 65);
  assert.strictEqual(C.seniorityPercent(31), 83);
  assert.strictEqual(C.seniorityPercent(32), 85);
  assert.strictEqual(C.seniorityPercent(40), 85);
});

test('надбавка за стаж службы по 247-ФЗ', () => {
  assert.strictEqual(C.servicePayBonusPercent(1.9), 0);
  assert.strictEqual(C.servicePayBonusPercent(2), 10);
  assert.strictEqual(C.servicePayBonusPercent(7), 15);
  assert.strictEqual(C.servicePayBonusPercent(12), 20);
  assert.strictEqual(C.servicePayBonusPercent(19.9), 25);
  assert.strictEqual(C.servicePayBonusPercent(22), 30);
  assert.strictEqual(C.servicePayBonusPercent(25), 40);
});

test('иждивенцы: 32 / 64 / 100 % РРП', () => {
  assert.deepStrictEqual([0, 1, 2, 3, 5].map(C.dependentsPercent), [0, 32, 64, 100, 100]);
});

test('базовый расчёт: 20 лет, оклады 30 000 + 20 000', () => {
  const r = C.calculate({ positionSalary: 30000, rankSalary: 20000, serviceYears: 20, reductionCoef: 93.59 });
  // 50 000 × 1,30 × 0,9359 × 0,5
  assert.strictEqual(r.allowance, 65000);
  assert.strictEqual(r.bonusPercent, 30);
  assert.strictEqual(r.percent, 50);
  assert.strictEqual(r.total, 30416.75);
  assert.ok(r.eligible);
});

test('неполный год выслуги не увеличивает процент', () => {
  const r = C.calculate({ positionSalary: 30000, rankSalary: 20000, serviceYears: 22, serviceMonths: 11 });
  assert.strictEqual(r.percent, 56);
});

test('меньше 20 лет — права на пенсию за выслугу нет', () => {
  const r = C.calculate({ positionSalary: 30000, rankSalary: 20000, serviceYears: 19, serviceMonths: 11 });
  assert.strictEqual(r.eligible, false);
  assert.strictEqual(r.total, 0);
  assert.ok(r.warnings.length > 0);
});

test('надбавки от РРП и районный коэффициент', () => {
  const r = C.calculate({
    positionSalary: 30000, rankSalary: 20000, serviceYears: 20,
    rrp: 10000, dependents: 1, combatVeteran: true, regionalCoef: 1.5
  });
  assert.strictEqual(r.supplementsSum, 6400);
  assert.strictEqual(r.total, 55225.13); // (30 416,75 + 6 400) × 1,5
});

test('смешанный стаж: 27 лет общего стажа → 52 %', () => {
  const r = C.calculate({
    mode: 'mixed', positionSalary: 30000, rankSalary: 20000,
    serviceYears: 13, totalWorkYears: 27, age: 46
  });
  assert.ok(r.eligible);
  assert.strictEqual(r.percent, 52);
});

test('смешанный стаж: служба меньше 12,5 лет — нет права', () => {
  const r = C.calculate({
    mode: 'mixed', positionSalary: 30000, rankSalary: 20000,
    serviceYears: 12, serviceMonths: 5, totalWorkYears: 30, age: 50
  });
  assert.strictEqual(r.eligible, false);
});

test('индексация окладов увеличивает пенсию пропорционально', () => {
  const a = C.calculate({ positionSalary: 30000, rankSalary: 20000, serviceYears: 25 });
  const b = C.calculate({ positionSalary: 30000, rankSalary: 20000, serviceYears: 25, salaryIndexation: 4 });
  assert.ok(Math.abs(b.total - a.total * 1.04) < 0.02);
});

test('прогноз по годам', () => {
  const rows = C.forecastByYears({ positionSalary: 30000, rankSalary: 20000, serviceYears: 19 }, 3);
  assert.deepStrictEqual(rows.map((r) => r.percent), [0, 50, 53, 56]);
});
