/*
 * Расчёт пенсии за выслугу лет сотрудников органов внутренних дел РФ.
 * Правовая основа: Закон РФ от 12.02.1993 № 4468-1 (ст. 13, 14, 17, 43, 48),
 * Федеральный закон от 19.07.2011 № 247-ФЗ (ст. 2 — надбавка за стаж службы).
 *
 * Модуль без зависимостей: работает в браузере (window.PensionCalc) и в Node.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PensionCalc = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Значения по умолчанию на 2026 год. Все они редактируются в интерфейсе.
  var DEFAULTS = {
    // Процент денежного довольствия, учитываемый при исчислении пенсии (с 01.01.2026)
    reductionCoef: 93.59,
    // Расчётный размер пенсии (РРП) = социальная пенсия по старости, с 01.04.2026
    // 8 907,70 ₽ (2025) × 1,068 ≈ 9 513,42 ₽
    rrp: 9513.42
  };

  // Оклады по специальным званиям на 01.01.2012 (постановление Правительства РФ № 878)
  var RANKS = [
    { name: 'Рядовой полиции', base: 5000 },
    { name: 'Младший сержант', base: 6000 },
    { name: 'Сержант', base: 6500 },
    { name: 'Старший сержант', base: 7000 },
    { name: 'Старшина', base: 7500 },
    { name: 'Прапорщик', base: 8000 },
    { name: 'Старший прапорщик', base: 8500 },
    { name: 'Младший лейтенант', base: 9500 },
    { name: 'Лейтенант', base: 10000 },
    { name: 'Старший лейтенант', base: 10500 },
    { name: 'Капитан', base: 11000 },
    { name: 'Майор', base: 11500 },
    { name: 'Подполковник', base: 12000 },
    { name: 'Полковник', base: 13000 },
    { name: 'Генерал-майор', base: 20000 },
    { name: 'Генерал-лейтенант', base: 22000 },
    { name: 'Генерал-полковник', base: 25000 },
    { name: 'Генерал полиции РФ', base: 27000 }
  ];

  // Нетиповые должности территориального органа районного уровня (приказ МВД № 813,
  // прил. 22): оклады 2012 года, из которых получены суммы приказа (19 976 ₽ = 15 000 ₽
  // после индексаций по 01.10.2023). Москва, СПб, Московская и Ленинградская обл. — +10 %.
  var POSITIONS_DISTRICT = [
    { name: 'Дознаватель, участковый уполномоченный', base: 15000 },
    { name: 'Юрисконсульт', base: 15000 },
    { name: 'Инженер отдела связи и защиты информации', base: 15000 },
    { name: 'Старший дознаватель, старший участковый', base: 15500 },
    { name: 'Начальник группы дознания', base: 16000 },
    { name: 'Начальник дежурной части', base: 17000, baseMax: 17500 },
    { name: 'Начальник отделения', base: 17500 },
    { name: 'Заместитель начальника отдела', base: 17500 },
    { name: 'Начальник отдела', base: 18000 },
    { name: 'Заместитель начальника полиции', base: 18500 },
    { name: 'Начальник отделения МВД', base: 19000 }
  ];

  // Нетиповые должности центрального аппарата, приказ МВД России от 27.04.2026 № 247
  var POSITIONS_CENTRAL = [
    { name: 'Первый заместитель Министра — начальник службы', salary: 64473 },
    { name: 'Статс-секретарь — заместитель Министра', salary: 63039 },
    { name: 'Первый заместитель начальника службы', salary: 58026 },
    { name: 'Начальник НЦБ Интерпола', salary: 51579 },
    { name: 'Помощник Министра', salary: 50146 },
    { name: 'Первый заместитель начальника управления', salary: 48713 },
    { name: 'Начальник управления, центра, инспекции', salary: 47281 },
    { name: 'Заместитель начальника управления, центра', salary: 45849 },
    { name: 'Начальник отдела', salary: 42983 },
    { name: 'Заместитель начальника отдела', salary: 41549 },
    { name: 'Начальник отделения', salary: 40118 },
    { name: 'Старший дознаватель, эксперт, инспектор, инженер', salary: 35819 },
    { name: 'Дознаватель, эксперт, инспектор, инженер', salary: 34388 }
  ];

  // Типовые должности, оклады 2012 года (постановление № 878) — диапазоны по уровням органов
  var POSITIONS_TYPICAL = [
    { name: 'Первый заместитель Министра', base: 45000 },
    { name: 'Заместитель Министра', base: 44000 },
    { name: 'Начальник департамента, главного управления', base: 37000 },
    { name: 'Начальник управления МВД', base: 36000 },
    { name: 'Заместитель начальника департамента', base: 35000 },
    { name: 'Начальник территориального органа окружного уровня', base: 34000 },
    { name: 'Начальник отдела в центральном аппарате', base: 30000 },
    { name: 'Начальник управления в территориальном органе', base: 27000 },
    { name: 'Начальник отдела в территориальном органе', base: 20500, baseMax: 22000 },
    { name: 'Начальник отделения', base: 16500, baseMax: 28000 },
    { name: 'Старший следователь, оперуполномоченный, инспектор', base: 16500, baseMax: 25000 },
    { name: 'Следователь, оперуполномоченный, эксперт, инспектор', base: 15000, baseMax: 24000 },
    { name: 'Младший инспектор', base: 10000, baseMax: 14000 },
    { name: 'Старший полицейский', base: 9500, baseMax: 13500 },
    { name: 'Полицейский', base: 9000, baseMax: 13000 }
  ];

  // Индексации окладов денежного содержания сотрудников ОВД после 2012 года
  var INDEXATIONS = [
    { date: '2018-01-01', percent: 4 },
    { date: '2019-10-01', percent: 4.3 },
    { date: '2020-10-01', percent: 3 },
    { date: '2021-10-01', percent: 3.7 },
    { date: '2022-10-01', percent: 4 },
    { date: '2023-10-01', percent: 10.5 },
    { date: '2024-10-01', percent: 5.1 },
    { date: '2025-10-01', percent: 7.6 },
    { date: '2026-10-01', percent: 4, planned: true }
  ];

  // Оклад на дату: последовательная индексация с округлением до рубля в большую сторону
  function indexSalary(base, onDate) {
    var value = base;
    INDEXATIONS.forEach(function (ix) {
      if (ix.date <= onDate) value = Math.ceil(value * (1 + ix.percent / 100) - 1e-9);
    });
    return value;
  }

  // Индексации после даты `fromDate` (для сумм, уже действующих на эту дату)
  function indexFrom(value, fromDate, onDate) {
    INDEXATIONS.forEach(function (ix) {
      if (ix.date > fromDate && ix.date <= onDate) value = Math.ceil(value * (1 + ix.percent / 100) - 1e-9);
    });
    return value;
  }

  // Повышение на 10 % для Москвы, Санкт-Петербурга, Московской и Ленинградской областей
  function capitalRegion(value) {
    return Math.ceil(value * 1.1 - 1e-9);
  }

  function rankSalaries(onDate) {
    return RANKS.map(function (r) {
      return { name: r.name, base: r.base, salary: indexSalary(r.base, onDate) };
    });
  }

  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  // Ежемесячная надбавка за стаж службы (выслугу лет), ч. 7 ст. 2 247-ФЗ
  function servicePayBonusPercent(years) {
    if (years >= 25) return 40;
    if (years >= 20) return 30;
    if (years >= 15) return 25;
    if (years >= 10) return 20;
    if (years >= 5) return 15;
    if (years >= 2) return 10;
    return 0;
  }

  // Процент пенсии при выслуге 20+ лет, п. «а» ст. 14 4468-1
  function seniorityPercent(fullYears) {
    if (fullYears < 20) return 0;
    return Math.min(85, 50 + 3 * (fullYears - 20));
  }

  // Процент пенсии при смешанном стаже, п. «б» ст. 14 4468-1
  function mixedPercent(totalWorkYears) {
    if (totalWorkYears < 25) return 0;
    return 50 + (totalWorkYears - 25);
  }

  // Надбавка на нетрудоспособных иждивенцев, п. «в» ст. 17: 32 / 64 / 100 % РРП
  function dependentsPercent(count) {
    if (count <= 0) return 0;
    if (count === 1) return 32;
    if (count === 2) return 64;
    return 100;
  }

  function toYears(years, months) {
    return (Number(years) || 0) + (Number(months) || 0) / 12;
  }

  /*
   * input:
   *   positionSalary, rankSalary — оклады по должности и по специальному званию, ₽
   *   serviceYears, serviceMonths — выслуга лет для пенсии (с учётом льготного исчисления)
   *   bonusYears — стаж для надбавки за выслугу (если не задан — берётся выслуга)
   *   bonusPercent — надбавка за выслугу вручную, % (если задана — перекрывает таблицу)
   *   mode — 'seniority' (выслуга 20+) | 'mixed' (смешанный стаж)
   *   totalWorkYears, totalWorkMonths, age — для смешанного стажа
   *   reductionCoef — понижающий коэффициент, %
   *   regionalCoef — районный коэффициент (1 — нет)
   *   salaryIndexation — индексация окладов для прогноза, %
   *   rrp — расчётный размер пенсии, ₽
   *   dependents — число нетрудоспособных иждивенцев
   *   disabledGroup1 — инвалид I группы; age80 — достиг 80 лет
   *   combatVeteran — ветеран боевых действий
   */
  function calculate(input) {
    var i = input || {};
    var warnings = [];

    var coef = i.reductionCoef != null && i.reductionCoef !== '' ? Number(i.reductionCoef) : DEFAULTS.reductionCoef;
    var rrp = i.rrp != null && i.rrp !== '' ? Number(i.rrp) : DEFAULTS.rrp;
    var regional = Number(i.regionalCoef) || 1;
    var indexation = Number(i.salaryIndexation) || 0;
    var mode = i.mode === 'mixed' ? 'mixed' : 'seniority';

    var indexK = 1 + indexation / 100;
    var positionSalary = (Number(i.positionSalary) || 0) * indexK;
    var rankSalary = (Number(i.rankSalary) || 0) * indexK;
    var salarySum = positionSalary + rankSalary;

    var serviceYears = toYears(i.serviceYears, i.serviceMonths);
    var serviceFullYears = Math.floor(serviceYears + 1e-9);
    var bonusYears = i.bonusYears != null && i.bonusYears !== '' ? Number(i.bonusYears) : serviceYears;

    var bonusPercent = i.bonusPercent != null && i.bonusPercent !== ''
      ? Number(i.bonusPercent)
      : servicePayBonusPercent(bonusYears);
    var bonusAmount = salarySum * bonusPercent / 100;
    var allowance = salarySum + bonusAmount;
    var pensionBase = allowance * coef / 100;

    var percent = 0;
    var eligible = false;
    if (mode === 'seniority') {
      percent = seniorityPercent(serviceFullYears);
      eligible = serviceFullYears >= 20;
      if (!eligible) {
        warnings.push('Для пенсии за выслугу лет нужно не менее 20 полных лет службы (сейчас ' +
          serviceFullYears + '). Если выслуга 12,5+ лет, проверьте вариант «смешанный стаж».');
      }
      if (serviceFullYears > 31) {
        warnings.push('Достигнут максимум — 85 % денежного довольствия (выслуга 32 года и более).');
      }
    } else {
      var totalWork = toYears(i.totalWorkYears, i.totalWorkMonths);
      var totalFull = Math.floor(totalWork + 1e-9);
      percent = mixedPercent(totalFull);
      var age = Number(i.age) || 0;
      eligible = totalWork >= 25 && serviceYears >= 12.5 && age >= 45;
      if (totalWork < 25) warnings.push('Общий трудовой стаж должен быть не менее 25 календарных лет.');
      if (serviceYears < 12.5) warnings.push('Из общего стажа не менее 12 лет 6 месяцев должна составлять служба.');
      if (age < 45) warnings.push('На день увольнения нужно достичь 45 лет.');
      warnings.push('Смешанный стаж применяется только при увольнении по возрасту, состоянию здоровья ' +
        'или в связи с организационно-штатными мероприятиями.');
    }

    var basePension = eligible ? pensionBase * percent / 100 : 0;

    // Надбавки к пенсии (ст. 17), считаются от РРП
    var supplements = [];
    if (eligible) {
      if (i.disabledGroup1 || i.age80) {
        supplements.push({
          name: i.disabledGroup1 ? 'Инвалид I группы (уход)' : 'Достижение 80 лет (уход)',
          percent: 100, amount: rrp
        });
      }
      var dep = Math.max(0, Math.floor(Number(i.dependents) || 0));
      if (dep > 0) {
        var dp = dependentsPercent(dep);
        supplements.push({
          name: 'Нетрудоспособные иждивенцы: ' + dep, percent: dp, amount: rrp * dp / 100
        });
      }
      if (i.combatVeteran) {
        supplements.push({ name: 'Ветеран боевых действий', percent: 32, amount: rrp * 0.32 });
      }
    }
    var supplementsSum = supplements.reduce(function (s, x) { return s + x.amount; }, 0);

    var beforeRegional = basePension + supplementsSum;
    var total = beforeRegional * regional;

    supplements.forEach(function (s) { s.amount = round2(s.amount); });

    return {
      eligible: eligible,
      mode: mode,
      positionSalary: round2(positionSalary),
      rankSalary: round2(rankSalary),
      salarySum: round2(salarySum),
      bonusPercent: bonusPercent,
      bonusAmount: round2(bonusAmount),
      allowance: round2(allowance),
      reductionCoef: coef,
      pensionBase: round2(pensionBase),
      percent: percent,
      basePension: round2(basePension),
      supplements: supplements,
      supplementsSum: round2(supplementsSum),
      regionalCoef: regional,
      regionalAddition: round2(total - beforeRegional),
      total: round2(total),
      serviceFullYears: serviceFullYears,
      warnings: warnings
    };
  }

  /*
   * Прогноз: как изменится пенсия, если остаться служить ещё N лет
   * (при тех же окладах и коэффициенте).
   */
  function forecastByYears(input, extraYears) {
    var rows = [];
    for (var k = 0; k <= extraYears; k++) {
      var inp = Object.assign({}, input, {
        serviceYears: (Number(input.serviceYears) || 0) + k,
        bonusYears: input.bonusYears != null && input.bonusYears !== ''
          ? Number(input.bonusYears) + k : undefined,
        totalWorkYears: (Number(input.totalWorkYears) || 0) + k,
        age: (Number(input.age) || 0) + k
      });
      var r = calculate(inp);
      rows.push({ extra: k, serviceYears: r.serviceFullYears, percent: r.percent, total: r.total, eligible: r.eligible });
    }
    return rows;
  }

  return {
    DEFAULTS: DEFAULTS,
    RANKS: RANKS,
    INDEXATIONS: INDEXATIONS,
    POSITIONS_DISTRICT: POSITIONS_DISTRICT,
    POSITIONS_CENTRAL: POSITIONS_CENTRAL,
    POSITIONS_TYPICAL: POSITIONS_TYPICAL,
    CENTRAL_ORDER_DATE: '2026-04-27',
    indexSalary: indexSalary,
    indexFrom: indexFrom,
    capitalRegion: capitalRegion,
    rankSalaries: rankSalaries,
    servicePayBonusPercent: servicePayBonusPercent,
    seniorityPercent: seniorityPercent,
    mixedPercent: mixedPercent,
    dependentsPercent: dependentsPercent,
    calculate: calculate,
    forecastByYears: forecastByYears
  };
});
