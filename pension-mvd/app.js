(function () {
  'use strict';

  var STORAGE_KEY = 'pension-mvd:v1';
  var form = document.getElementById('form');
  var activeDate = PensionCalc.currentSalaryDate(new Date().toISOString().slice(0, 10));
  var rankInput = form.elements.rank;
  var rankButtons = document.getElementById('rankButtons');
  var RANK_GROUPS = [
    { title: 'Рядовой и младший начсостав', from: 0, to: 6 },
    { title: 'Средний начсостав', from: 7, to: 10 },
    { title: 'Старший начсостав', from: 11, to: 13 },
    { title: 'Высший начсостав', from: 14, to: 17 }
  ];
  var SHORT = { 'Рядовой полиции': 'Рядовой', 'Генерал полиции РФ': 'Генерал полиции' };
  var rankList = PensionCalc.rankSalaries(activeDate);
  rankButtons.innerHTML = RANK_GROUPS.map(function (g) {
    var btns = '';
    for (var k = g.from; k <= g.to; k++) {
      var r = rankList[k];
      btns += '<button type="button" class="rank-btn" data-rank="' + k + '" aria-pressed="false" title="' +
        r.name + ': ' + r.salary + ' ₽">' + (SHORT[r.name] || r.name) + '</button>';
    }
    return '<div class="rank-group"><span class="rank-group-title">' + g.title + '</span><div class="rank-row">' + btns + '</div></div>';
  }).join('');

  function syncRank() {
    Array.prototype.forEach.call(rankButtons.querySelectorAll('.rank-btn'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-rank') === rankInput.value ? 'true' : 'false');
    });
    var chosen = document.querySelectorAll('#ranksTable tbody tr');
    Array.prototype.forEach.call(chosen, function (tr, k) {
      tr.classList.toggle('chosen', String(k) === rankInput.value);
    });
  }

  function chooseRank(k, salary) {
    rankInput.value = String(k);
    form.elements.rankSalary.value = salary != null ? salary : rankList[k].salary;
    syncRank();
    render();
  }
  var defaults = snapshot();

  var money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
  var num = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

  function snapshot() {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
      else if (el.type === 'checkbox') data[el.name] = el.checked;
      else data[el.name] = el.value;
    });
    return data;
  }

  function restore(data) {
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || !(el.name in data)) return;
      if (el.type === 'radio') el.checked = el.value === data[el.name];
      else if (el.type === 'checkbox') el.checked = !!data[el.name];
      else el.value = data[el.name];
    });
  }

  function yearsWord(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'год';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'года';
    return 'лет';
  }

  function row(label, value, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + label + '</th><td>' + value + '</td></tr>';
  }

  function render() {
    var input = snapshot();
    document.getElementById('mixedFields').hidden = input.mode !== 'mixed';

    var r = PensionCalc.calculate(input);

    document.getElementById('total').textContent = r.eligible ? money.format(r.total) : 'нет права';
    document.getElementById('totalSub').textContent = r.eligible
      ? r.percent + ' % от ' + money.format(r.pensionBase) + (r.supplementsSum ? ' + надбавки' : '')
      : '';

    document.getElementById('warnings').innerHTML = r.warnings.map(function (w) {
      return '<li>' + w + '</li>';
    }).join('');

    var html = '';
    html += row('Оклад по должности', money.format(r.positionSalary));
    html += row('Оклад по званию', money.format(r.rankSalary));
    html += row('Надбавка за стаж службы, ' + r.bonusPercent + ' %', money.format(r.bonusAmount));
    html += row('Денежное довольствие для пенсии', money.format(r.allowance), 'sum');
    html += row('× понижающий коэффициент ' + num.format(r.reductionCoef) + ' %', money.format(r.pensionBase));
    html += row('× ' + r.percent + ' % за ' + (r.mode === 'mixed' ? 'смешанный стаж' : 'выслугу'), money.format(r.basePension), 'sum');
    r.supplements.forEach(function (s) {
      html += row('+ ' + s.name + ' (' + s.percent + ' % РРП)', money.format(s.amount));
    });
    if (r.regionalCoef !== 1) {
      html += row('+ районный коэффициент ' + num.format(r.regionalCoef), money.format(r.regionalAddition));
    }
    html += row('Итого в месяц', r.eligible ? money.format(r.total) : '—', 'grand');
    document.getElementById('breakdown').innerHTML = html;

    var rows = PensionCalc.forecastByYears(input, 5);
    var base = rows[0].total;
    document.querySelector('#forecast tbody').innerHTML = rows.map(function (f, idx) {
      var diff = f.total - base;
      return '<tr' + (idx === 0 ? ' class="now"' : '') + '>' +
        '<td>' + f.serviceYears + ' ' + yearsWord(f.serviceYears) + (idx === 0 ? ' (сейчас)' : '') + '</td>' +
        '<td>' + (f.eligible ? f.percent : '—') + '</td>' +
        '<td>' + (f.eligible ? money.format(f.total) : 'нет права') + '</td>' +
        '<td>' + (idx > 0 && diff > 0 ? '+' + money.format(diff) : '') + '</td></tr>';
    }).join('');

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(input)); } catch (e) { /* хранилище недоступно */ }
  }

  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) restore(saved);
  } catch (e) { /* игнорируем */ }

  rankButtons.addEventListener('click', function (e) {
    var b = e.target.closest('.rank-btn');
    if (!b) return;
    chooseRank(Number(b.getAttribute('data-rank')));
    var input = form.elements.rankSalary;
    input.classList.remove('flash');
    void input.offsetWidth;
    input.classList.add('flash');
  });
  form.elements.rankSalary.addEventListener('input', function () { rankInput.value = ''; syncRank(); });
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  document.getElementById('reset').addEventListener('click', function () {
    restore(defaults);
    syncRank();
    render();
  });

  render();

  // ----- Таблица окладов -----
  var rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var tab = 'district';
  var dateSelect = document.getElementById('salaryDate');
  var capital = document.getElementById('capital');
  var table = document.getElementById('salaries');
  dateSelect.value = activeDate >= '2026-10-01' ? '2026-10-01' : '2025-10-01';

  function pick(field, value, label) {
    return '<button type="button" class="pick" data-field="' + field + '" data-value="' + value +
      '" title="Подставить: ' + label + '">' + (label ? label + ' ' : '') + rub.format(value) + ' ₽</button>';
  }

  function current(base, onDate) {
    var v = PensionCalc.indexSalary(base, onDate);
    return capital.checked && tab === 'district' ? PensionCalc.capitalRegion(v) : v;
  }

  function renderTable() {
    var onDate = dateSelect.value;
    var head, rows, note;
    document.getElementById('capitalWrap').hidden = tab !== 'district';

    if (tab === 'district') {
      head = ['Должность', 'Оклад 2012', 'Оклад сейчас'];
      rows = PensionCalc.POSITIONS_DISTRICT.map(function (r) {
        var cell = pick('positionSalary', current(r.base, onDate), r.baseMax ? 'от' : '');
        if (r.baseMax) cell += pick('positionSalary', current(r.baseMax, onDate), 'до');
        return [r.name, rub.format(r.base) + (r.baseMax ? '–' + rub.format(r.baseMax) : '') + ' ₽', cell];
      });
      note = 'Нетиповые должности территориального органа районного уровня (приказ МВД России № 813, прил. 22). ' +
        'В приказе суммы на 01.10.2023 (например, 19 976 ₽ у участкового); здесь они доиндексированы на 5,1 % (2024) и 7,6 % (2025).';
    } else if (tab === 'central') {
      head = ['Должность', 'По приказу № 247', 'Оклад сейчас'];
      rows = PensionCalc.POSITIONS_CENTRAL.map(function (r) {
        var now = PensionCalc.indexFrom(r.salary, PensionCalc.CENTRAL_ORDER_DATE, onDate);
        return [r.name, rub.format(r.salary) + ' ₽', pick('positionSalary', now, '')];
      });
      note = 'Нетиповые должности центрального аппарата — приказ МВД России от 27.04.2026 № 247 ' +
        '(зарегистрирован в Минюсте 04.06.2026, заменил приказ № 373 от 16.06.2025).';
    } else {
      head = ['Должность', 'Оклад 2012', 'Оклад сейчас'];
      rows = PensionCalc.POSITIONS_TYPICAL.map(function (r) {
        var cell = pick('positionSalary', current(r.base, onDate), r.baseMax ? 'от' : '');
        if (r.baseMax) cell += pick('positionSalary', current(r.baseMax, onDate), 'до');
        return [r.name, rub.format(r.base) + (r.baseMax ? '–' + rub.format(r.baseMax) : '') + ' ₽', cell];
      });
      note = 'Типовые должности, постановление № 878. Размер зависит от уровня органа: центральный аппарат, ' +
        'окружной, региональный или районный. Для Москвы, Санкт-Петербурга, Московской и Ленинградской областей ' +
        'оклады отдельных территориальных органов выше на 10 %.';
    }

    table.innerHTML = '<thead><tr>' + head.map(function (h) { return '<th scope="col">' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><th scope="row">' + r[0] + '</th><td class="muted">' + r[1] + '</td><td>' + r[2] + '</td></tr>';
      }).join('') + '</tbody>';
    document.getElementById('tableNote').textContent = note;
  }

  var allYears = document.getElementById('allYears');
  function renderRanks() {
    var ix = PensionCalc.INDEXATIONS;
    var show = function (x) { return allYears.checked || x.date >= '2022-01-01'; };
    var head = '<thead><tr><th scope="col">Звание</th><th scope="col">2012</th>' + ix.filter(show).map(function (x) {
      var label = x.date.slice(8, 10) + '.' + x.date.slice(5, 7) + '.' + x.date.slice(0, 4);
      var cls = x.date === activeDate ? ' class="active"' : '';
      return '<th scope="col"' + cls + '>' + label + (x.planned ? '<br><small>план</small>' : '') +
        '<br><small>+' + String(x.percent).replace('.', ',') + ' %</small></th>';
    }).join('') + '</tr></thead>';
    var body = PensionCalc.rankHistory().map(function (r, idx) {
      return '<tr><th scope="row">' + r.name + '</th><td>' + rub.format(r.base) + '</td>' + r.steps.map(function (v, k) {
        var d = ix[k].date;
        if (!show(ix[k])) return '';
        var cls = d === activeDate ? ' class="active"' : '';
        var cell = d >= activeDate
          ? pick('rankSalary', v, '').replace('class="pick"', 'class="pick" data-rank="' + idx + '"')
          : rub.format(v);
        return '<td' + cls + '>' + cell + '</td>';
      }).join('') + '</tr>';
    }).join('');
    document.getElementById('ranksTable').innerHTML = head + '<tbody>' + body + '</tbody>';
    syncRank();
  }

  document.querySelector('.tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.getAttribute('data-tab');
    Array.prototype.forEach.call(this.querySelectorAll('[data-tab]'), function (x) {
      x.setAttribute('aria-selected', x === b ? 'true' : 'false');
    });
    renderTable();
  });
  dateSelect.addEventListener('change', renderTable);
  capital.addEventListener('change', renderTable);

  function onPick(e) {
    var b = e.target.closest('.pick');
    if (!b) return;
    var input = form.elements[b.getAttribute('data-field')];
    if (b.hasAttribute('data-rank')) {
      chooseRank(Number(b.getAttribute('data-rank')), b.getAttribute('data-value'));
    } else {
      input.value = b.getAttribute('data-value');
      render();
    }
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    input.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    input.classList.remove('flash');
    void input.offsetWidth;
    input.classList.add('flash');
  }
  table.addEventListener('click', onPick);
  document.getElementById('ranksTable').addEventListener('click', onPick);

  allYears.addEventListener('change', renderRanks);
  renderRanks();
  renderTable();
})();
