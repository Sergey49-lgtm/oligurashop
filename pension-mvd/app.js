(function () {
  'use strict';

  var STORAGE_KEY = 'pension-mvd:v2';
  var C = PensionCalc;
  var form = document.getElementById('form');
  var el = function (id) { return document.getElementById(id); };
  var activeDate = C.currentSalaryDate(new Date().toISOString().slice(0, 10));
  var rankList = C.rankSalaries(activeDate);
  var calculated = false;

  var money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
  var rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var num = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

  // ----- Шаг 1: должность -----
  var posLevel = el('posLevel');
  var posIndex = el('posIndex');
  var capital = el('capital');
  var positionSalary = el('positionSalary');

  posLevel.innerHTML = C.POSITION_LEVELS.map(function (l) {
    return '<option value="' + l.id + '">' + l.name + '</option>';
  }).join('') + '<option value="manual">Другое — указать оклад вручную</option>';

  function positions() {
    return C.positionOptions(posLevel.value, activeDate, posLevel.value === 'district' && capital.checked);
  }

  function amount(p) {
    return p.min === p.max ? rub.format(p.min) + ' ₽' : rub.format(p.min) + '–' + rub.format(p.max) + ' ₽';
  }

  // Перестроить список должностей под выбранный уровень, сохранив выбор, если он есть
  function buildPositions(keepIndex) {
    var list = positions();
    el('posIndexWrap').hidden = posLevel.value === 'manual';
    el('capitalWrap').hidden = posLevel.value !== 'district';
    posIndex.innerHTML = list.map(function (p, i) {
      return '<option value="' + i + '">' + p.name + ' — ' + amount(p) + '</option>';
    }).join('');
    if (keepIndex != null && list[keepIndex]) posIndex.value = String(keepIndex);
  }

  function updatePosHint() {
    var hint = el('posHint');
    if (posLevel.value === 'manual') {
      hint.textContent = 'Оклад по должности смотрите в расчётном листке или приказе о назначении.';
      return;
    }
    var p = positions()[Number(posIndex.value)];
    if (!p) { hint.textContent = ''; return; }
    if (p.min !== p.max) {
      hint.textContent = 'Оклад зависит от подразделения: от ' + rub.format(p.min) + ' до ' + rub.format(p.max) +
        ' ₽. Подставлен минимальный — уточните по расчётному листку.';
    } else if (Number(positionSalary.value) !== p.min) {
      hint.textContent = 'Оклад изменён вручную. По таблице — ' + rub.format(p.min) + ' ₽.';
    } else {
      hint.textContent = '';
    }
  }

  function fillPositionSalary() {
    var p = positions()[Number(posIndex.value)];
    if (p && posLevel.value !== 'manual') positionSalary.value = p.min;
    updatePosHint();
  }

  // ----- Шаг 2: звание -----
  var rank = el('rank');
  var rankSalary = el('rankSalary');
  var RANK_GROUPS = [
    { title: 'Рядовой и младший начальствующий состав', from: 0, to: 6 },
    { title: 'Средний начальствующий состав', from: 7, to: 10 },
    { title: 'Старший начальствующий состав', from: 11, to: 13 },
    { title: 'Высший начальствующий состав', from: 14, to: 17 }
  ];
  rank.innerHTML = RANK_GROUPS.map(function (g) {
    var opts = '';
    for (var k = g.from; k <= g.to; k++) {
      opts += '<option value="' + k + '">' + rankList[k].name + ' — ' + rub.format(rankList[k].salary) + ' ₽</option>';
    }
    return '<optgroup label="' + g.title + '">' + opts + '</optgroup>';
  }).join('') + '<option value="">Другое — указать оклад вручную</option>';

  function syncRankTable() {
    Array.prototype.forEach.call(document.querySelectorAll('#ranksTable tbody tr'), function (tr, k) {
      tr.classList.toggle('chosen', String(k) === rank.value);
    });
  }

  function fillRankSalary() {
    var r = rankList[Number(rank.value)];
    if (rank.value !== '' && r) rankSalary.value = r.salary;
    syncRankTable();
  }

  // ----- Состояние формы -----
  function snapshot() {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (e) {
      if (!e.name) return;
      if (e.type === 'radio') { if (e.checked) data[e.name] = e.value; }
      else if (e.type === 'checkbox') data[e.name] = e.checked;
      else data[e.name] = e.value;
    });
    return data;
  }

  function restore(data) {
    // Сначала уровень и регион — от них зависит список должностей
    if (data.posLevel) posLevel.value = data.posLevel;
    capital.checked = !!data.capital;
    buildPositions(data.posIndex != null && data.posIndex !== '' ? Number(data.posIndex) : 0);
    Array.prototype.forEach.call(form.elements, function (e) {
      if (!e.name || !(e.name in data) || e === posLevel || e === capital) return;
      if (e.type === 'radio') e.checked = e.value === data[e.name];
      else if (e.type === 'checkbox') e.checked = !!data[e.name];
      else e.value = data[e.name];
    });
  }

  // Значения по умолчанию: районный отдел, участковый, майор, 20 лет
  posLevel.value = 'district';
  buildPositions(0);
  fillPositionSalary();
  rank.value = '11';
  fillRankSalary();
  var defaults = snapshot();

  // ----- Расчёт -----
  function yearsWord(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'год';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'года';
    return 'лет';
  }

  function row(label, value, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + label + '</th><td>' + value + '</td></tr>';
  }

  function save() {
    try {
      var data = snapshot();
      data.calculated = calculated;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* хранилище недоступно */ }
  }

  function render() {
    var input = snapshot();
    el('mixedFields').hidden = input.mode !== 'mixed';
    el('result').hidden = el('refine').hidden = el('forecastPanel').hidden = !calculated;
    save();
    if (!calculated) return;

    var r = C.calculate(input);

    el('total').textContent = r.eligible ? money.format(r.total) : 'нет права';
    el('totalSub').textContent = r.eligible
      ? r.percent + ' % от ' + money.format(r.pensionBase) + (r.supplementsSum ? ' + надбавки' : '')
      : '';
    el('warnings').innerHTML = r.warnings.map(function (w) { return '<li>' + w + '</li>'; }).join('');

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
    el('breakdown').innerHTML = html;

    var rows = C.forecastByYears(input, 5);
    var base = rows[0].total;
    el('forecast').querySelector('tbody').innerHTML = rows.map(function (f, idx) {
      var diff = f.total - base;
      return '<tr' + (idx === 0 ? ' class="now"' : '') + '>' +
        '<td>' + f.serviceYears + ' ' + yearsWord(f.serviceYears) + (idx === 0 ? ' (сейчас)' : '') + '</td>' +
        '<td>' + (f.eligible ? f.percent : '—') + '</td>' +
        '<td>' + (f.eligible ? money.format(f.total) : 'нет права') + '</td>' +
        '<td>' + (idx > 0 && diff > 0 ? '+' + money.format(diff) : '') + '</td></tr>';
    }).join('');
  }

  function scrollTo(node) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  function flash(input) {
    input.classList.remove('flash');
    void input.offsetWidth;
    input.classList.add('flash');
  }

  // ----- События формы -----
  posLevel.addEventListener('change', function () { buildPositions(0); fillPositionSalary(); });
  capital.addEventListener('change', function () { buildPositions(Number(posIndex.value)); fillPositionSalary(); });
  posIndex.addEventListener('change', fillPositionSalary);
  positionSalary.addEventListener('input', updatePosHint);
  rank.addEventListener('change', fillRankSalary);
  rankSalary.addEventListener('input', function () {
    var r = rankList[Number(rank.value)];
    if (rank.value !== '' && r && Number(rankSalary.value) !== r.salary) { rank.value = ''; syncRankTable(); }
  });
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    calculated = true;
    render();
    scrollTo(el('result'));
  });
  el('reset').addEventListener('click', function () {
    restore(defaults);
    updatePosHint();
    syncRankTable();
    render();
  });

  // ----- Справочник окладов -----
  var tab = 'district';
  var dateSelect = el('salaryDate');
  var tableCapital = el('tableCapital');
  var table = el('salaries');
  dateSelect.value = activeDate >= '2026-10-01' ? '2026-10-01' : '2025-10-01';

  function pick(attrs, value, label) {
    return '<button type="button" class="pick" ' + attrs + ' data-value="' + value + '">' +
      (label ? label + ' ' : '') + rub.format(value) + ' ₽</button>';
  }

  var NOTES = {
    district: 'Нетиповые должности территориального органа районного уровня (приказ МВД России № 813, прил. 22). ' +
      'В приказе суммы на 01.10.2023 (например, 19 976 ₽ у участкового); здесь они доиндексированы на 5,1 % (2024), 7,6 % (2025) и 4 % (2026).',
    central: 'Нетиповые должности центрального аппарата — приказ МВД России от 27.04.2026 № 247 ' +
      '(зарегистрирован в Минюсте 04.06.2026, заменил приказ № 373 от 16.06.2025).',
    typical: 'Типовые должности, постановление № 878. Размер зависит от уровня органа: центральный аппарат, ' +
      'окружной, региональный или районный. Для Москвы, Санкт-Петербурга, Московской и Ленинградской областей ' +
      'оклады отдельных территориальных органов выше на 10 %.'
  };

  function renderTable() {
    var cap = tab === 'district' && tableCapital.checked;
    el('tableCapitalWrap').hidden = tab !== 'district';
    var list = C.positionOptions(tab, dateSelect.value, cap);
    var source = tab === 'district' ? C.POSITIONS_DISTRICT : tab === 'central' ? C.POSITIONS_CENTRAL : C.POSITIONS_TYPICAL;
    var head = ['Должность', tab === 'central' ? 'По приказу № 247' : 'Оклад 2012', 'Оклад сейчас'];
    var body = list.map(function (p, i) {
      var src = source[i];
      var first = tab === 'central' ? rub.format(src.salary) + ' ₽'
        : rub.format(src.base) + (src.baseMax ? '–' + rub.format(src.baseMax) : '') + ' ₽';
      var attrs = 'data-level="' + tab + '" data-idx="' + i + '" data-cap="' + (cap ? 1 : 0) + '"';
      var cell = p.min === p.max ? pick(attrs, p.min, '') : pick(attrs, p.min, 'от') + pick(attrs, p.max, 'до');
      return '<tr><th scope="row">' + p.name + '</th><td class="muted">' + first + '</td><td>' + cell + '</td></tr>';
    }).join('');
    table.innerHTML = '<thead><tr>' + head.map(function (h) { return '<th scope="col">' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body + '</tbody>';
    el('tableNote').textContent = NOTES[tab];
  }

  var allYears = el('allYears');
  function renderRanks() {
    var ix = C.INDEXATIONS;
    var show = function (x) { return allYears.checked || x.date >= '2022-01-01'; };
    var head = '<thead><tr><th scope="col">Звание</th><th scope="col">2012</th>' + ix.filter(show).map(function (x) {
      var label = x.date.slice(8, 10) + '.' + x.date.slice(5, 7) + '.' + x.date.slice(0, 4);
      var cls = x.date === activeDate ? ' class="active"' : '';
      return '<th scope="col"' + cls + '>' + label + '<br><small>+' + String(x.percent).replace('.', ',') + ' %</small></th>';
    }).join('') + '</tr></thead>';
    var body = C.rankHistory().map(function (r, idx) {
      return '<tr><th scope="row">' + r.name + '</th><td>' + rub.format(r.base) + '</td>' + r.steps.map(function (v, k) {
        if (!show(ix[k])) return '';
        var d = ix[k].date;
        var cls = d === activeDate ? ' class="active"' : '';
        var cell = d >= activeDate ? pick('data-rank="' + idx + '"', v, '') : rub.format(v);
        return '<td' + cls + '>' + cell + '</td>';
      }).join('') + '</tr>';
    }).join('');
    el('ranksTable').innerHTML = head + '<tbody>' + body + '</tbody>';
    syncRankTable();
  }

  function onPick(e) {
    var b = e.target.closest('.pick');
    if (!b) return;
    var value = b.getAttribute('data-value');
    var target;
    if (b.hasAttribute('data-rank')) {
      rank.value = b.getAttribute('data-rank');
      rankSalary.value = value;
      syncRankTable();
      target = rankSalary;
    } else {
      posLevel.value = b.getAttribute('data-level');
      capital.checked = b.getAttribute('data-cap') === '1';
      buildPositions(Number(b.getAttribute('data-idx')));
      positionSalary.value = value;
      updatePosHint();
      target = positionSalary;
    }
    render();
    scrollTo(form);
    flash(target);
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
  tableCapital.addEventListener('change', renderTable);
  allYears.addEventListener('change', renderRanks);
  table.addEventListener('click', onPick);
  el('ranksTable').addEventListener('click', onPick);

  // ----- Запуск -----
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) {
      restore(saved);
      calculated = !!saved.calculated;
      // Оклады из таблиц — действующие: после индексации подставятся новые суммы
      // (ручной ввод не трогаем — обновляем только сумму, совпадающую со старой таблицей)
      var idx = Number(posIndex.value);
      var p = posLevel.value !== 'manual' ? positions()[idx] : null;
      var prevDates = C.INDEXATIONS.map(function (x) { return x.date; }).filter(function (d) { return d < activeDate; });
      var prevDate = prevDates[prevDates.length - 1];
      if (p && prevDate) {
        var old = C.positionOptions(posLevel.value, prevDate, posLevel.value === 'district' && capital.checked)[idx];
        var v = Number(positionSalary.value);
        if (v === old.min) positionSalary.value = p.min;
        else if (v === old.max) positionSalary.value = p.max;
      }
      if (rank.value !== '' && rankList[Number(rank.value)]) rankSalary.value = rankList[Number(rank.value)].salary;
    }
  } catch (e) { /* игнорируем */ }

  updatePosHint();
  renderRanks();
  renderTable();
  render();
})();
