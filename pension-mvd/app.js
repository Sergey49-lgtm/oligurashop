(function () {
  'use strict';

  var STORAGE_KEY = 'pension-mvd:v1';
  var form = document.getElementById('form');
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

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  document.getElementById('reset').addEventListener('click', function () {
    restore(defaults);
    render();
  });

  render();

  // ----- Таблица окладов -----
  var rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var tab = 'ranks';
  var dateSelect = document.getElementById('salaryDate');
  var capital = document.getElementById('capital');
  var table = document.getElementById('salaries');
  var today = new Date().toISOString().slice(0, 10);
  dateSelect.value = today >= '2026-10-01' ? '2026-10-01' : '2025-10-01';

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

    if (tab === 'ranks') {
      head = ['Специальное звание', 'Оклад 2012', 'Оклад сейчас'];
      rows = PensionCalc.rankSalaries(onDate).map(function (r) {
        return [r.name, rub.format(r.base) + ' ₽', pick('rankSalary', r.salary, '')];
      });
      note = 'Базовые оклады — постановление Правительства РФ от 03.11.2011 № 878. Текущие суммы рассчитаны ' +
        'индексацией с округлением до рубля вверх; сверяйте с расчётным листком.';
    } else if (tab === 'district') {
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

  table.addEventListener('click', function (e) {
    var b = e.target.closest('.pick');
    if (!b) return;
    var input = form.elements[b.getAttribute('data-field')];
    input.value = b.getAttribute('data-value');
    render();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    input.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    input.classList.remove('flash');
    void input.offsetWidth;
    input.classList.add('flash');
  });

  renderTable();
})();
