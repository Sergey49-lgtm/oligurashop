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
})();
