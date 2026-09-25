(function () {
  'use strict';

  var S = window.SpellChecker;
  var LT_URL = 'https://api.languagetool.org/v2/check';
  var LT_CHUNK = 15000; // лимит бесплатного LanguageTool — около 20 КБ на запрос
  var CLAUDE_MODEL = 'claude-opus-5';
  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0/+esm';

  var SAMPLE = 'здраствуйте! Вчера я пошол в магазин и и купил хлеб , молоко и сыр.' +
    'Продавец сказал что сыр свежий, но он был просрочен ещё на прошлой неделе поэтому я его вернул.\n\n' +
    'Вообщем,  магазин хороший - цены низкие. Я хожу туда каждый день, хотя был там всего один раз.';

  var $ = function (id) { return document.getElementById(id); };
  var input = $('input');
  var output = $('output');
  var popover = $('popover');

  // Текущее состояние: проверенный текст и оставшиеся замечания
  var state = null;
  var activeId = null;

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    } catch (e) { /* хранилище недоступно — работаем без него */ }
    return null;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function setStatus(msg, isError) {
    $('status').textContent = msg || '';
    $('status').classList.toggle('error', !!isError);
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function updateCharCount() {
    var n = (state ? state.text : input.value).length;
    $('charCount').textContent = n.toLocaleString('ru-RU') + ' ' + plural(n, 'символ', 'символа', 'символов');
  }

  // ---------- Источники проверки ----------

  function checkLanguageTool(text, lang) {
    var chunks = S.splitChunks(text, LT_CHUNK);
    return Promise.all(chunks.map(function (c) {
      var body = new URLSearchParams({ text: c.text, language: lang });
      return fetch(LT_URL, { method: 'POST', body: body }).then(function (r) {
        if (!r.ok) throw new Error('LanguageTool ответил ошибкой ' + r.status);
        return r.json();
      }).then(function (data) { return S.shift(S.fromLanguageTool(data), c.offset); });
    })).then(function (lists) { return [].concat.apply([], lists); });
  }

  function checkClaude(text, apiKey) {
    return import(SDK_URL).then(function (mod) {
      var Anthropic = mod.default || mod.Anthropic;
      var client = new Anthropic({ apiKey: apiKey, dangerouslyAllowBrowser: true });
      return client.beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        // При отказе модели запрос автоматически повторяется на рекомендованной резервной модели
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: S.CLAUDE_SYSTEM,
        output_config: { format: { type: 'json_schema', schema: S.CLAUDE_SCHEMA } },
        messages: [{ role: 'user', content: text }]
      });
    }).then(function (response) {
      if (response.stop_reason === 'refusal') throw new Error('Claude отказался проверять этот текст');
      if (response.stop_reason === 'max_tokens') throw new Error('Текст слишком длинный для одной проверки Claude');
      var block = response.content.filter(function (b) { return b.type === 'text'; })[0];
      if (!block) throw new Error('Claude вернул пустой ответ');
      var data = JSON.parse(block.text);
      return { issues: S.fromClaude(text, data), summary: data.summary };
    });
  }

  function describeError(e) {
    var status = e && e.status;
    if (status === 401) return 'неверный ключ API';
    if (status === 429) return 'слишком много запросов, подождите минуту';
    if (e instanceof TypeError) return 'нет соединения';
    return (e && e.message) || String(e);
  }

  function runCheck() {
    var text = input.value;
    if (!text.trim()) { setStatus('Введите текст для проверки.', true); return; }

    var useLT = $('useLT').checked;
    var useClaude = $('useClaude').checked;
    var apiKey = $('apiKey').value.trim();
    if (useClaude && !apiKey) { setStatus('Укажите ключ Anthropic API или отключите Claude.', true); return; }

    var btn = $('checkBtn');
    btn.disabled = true;
    btn.textContent = 'Проверяю…';
    setStatus(useClaude ? 'Проверка с Claude может занять до минуты…' : 'Проверяю…');

    var lists = [S.localCheck(text)];
    var warnings = [];
    var summary = '';
    var jobs = [];

    if (useLT) {
      jobs.push(checkLanguageTool(text, $('lang').value).then(function (l) { lists.push(l); },
        function (e) { warnings.push('LanguageTool: ' + describeError(e)); }));
    }
    if (useClaude) {
      jobs.push(checkClaude(text, apiKey).then(function (r) { lists.push(r.issues); summary = r.summary; },
        function (e) { warnings.push('Claude: ' + describeError(e)); }));
    }

    Promise.all(jobs).then(function () {
      state = { text: text, issues: S.merge(lists), summary: summary };
      showResult();
      var n = state.issues.length;
      var msg = n ? 'Найдено ' + n + ' ' + plural(n, 'замечание', 'замечания', 'замечаний') + '. Нажмите на подчёркнутое слово, чтобы исправить.'
        : 'Ошибок не найдено.';
      if (warnings.length) msg += ' Не удалось: ' + warnings.join('; ') + '.';
      setStatus(msg, warnings.length > 0 && !n);
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Проверить снова';
    });
  }

  // ---------- Отображение ----------

  function showResult() {
    input.hidden = true;
    output.hidden = false;
    ['editBtn', 'fixAllBtn', 'copyBtn'].forEach(function (id) { $(id).hidden = false; });
    render();
  }

  function showEditor() {
    if (state) input.value = state.text;
    state = null;
    hidePopover();
    input.hidden = false;
    output.hidden = true;
    ['editBtn', 'fixAllBtn', 'copyBtn'].forEach(function (id) { $(id).hidden = true; });
    $('checkBtn').textContent = 'Проверить';
    render();
    input.focus();
  }

  function render(fixedRange) {
    renderText(fixedRange);
    renderList();
    renderLegend();
    updateCharCount();
  }

  function renderText(fixedRange) {
    output.textContent = '';
    if (!state) return;
    S.segments(state.text, state.issues).forEach(function (seg) {
      if (!seg.issue) { output.appendChild(document.createTextNode(seg.text)); return; }
      var span = el('span', 'err c-' + seg.issue.category, seg.text);
      if (!seg.text.trim()) span.classList.add('ws');
      span.dataset.id = seg.issue.id;
      span.tabIndex = 0;
      span.title = seg.issue.message;
      if (seg.issue.id === activeId) span.classList.add('active');
      output.appendChild(span);
    });
    if (fixedRange) highlightFixed(fixedRange);
  }

  // Ненадолго подсвечивает только что исправленное место
  function highlightFixed(range) {
    if (!range.length) return;
    var pos = 0;
    var nodes = Array.prototype.slice.call(output.childNodes);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var len = node.textContent.length;
      if (node.nodeType === 3 && range.offset >= pos && range.offset + range.length <= pos + len) {
        var mid = node.splitText(range.offset - pos);
        mid.splitText(range.length);
        var mark = el('span', 'fixed', mid.textContent);
        output.replaceChild(mark, mid);
        setTimeout(function () { mark.classList.remove('fixed'); }, 1500);
        return;
      }
      pos += len;
    }
  }

  function fragmentLabel(issue) {
    var frag = state.text.substr(issue.offset, issue.length);
    // Пробелы показываем точками, чтобы было видно, что именно не так
    return frag === frag.trim() ? frag : '«' + frag.replace(/ /g, '·') + '»';
  }

  function fixButtons(issue, onDone) {
    var box = el('div', 'fixes');
    issue.replacements.forEach(function (r) {
      var b = el('button', 'fix', r.trim() ? r : (r ? '«' + r.replace(/ /g, '·') + '»' : 'удалить'));
      b.type = 'button';
      b.addEventListener('click', function (e) { e.stopPropagation(); fix(issue.id, r); if (onDone) onDone(); });
      box.appendChild(b);
    });
    var skip = el('button', 'skip', 'Пропустить');
    skip.type = 'button';
    skip.addEventListener('click', function (e) { e.stopPropagation(); ignore(issue.id); if (onDone) onDone(); });
    box.appendChild(skip);
    return box;
  }

  function renderList() {
    var list = $('issues');
    list.textContent = '';
    var issues = state ? state.issues : [];
    $('empty').hidden = issues.length > 0;
    $('empty').textContent = state ? 'Ошибок не осталось.' : 'Здесь появится список ошибок после проверки.';
    $('summary').hidden = !(state && state.summary);
    $('summary').textContent = state ? state.summary || '' : '';
    $('fixAllBtn').disabled = !issues.some(function (i) { return i.replacements.length; });

    issues.forEach(function (issue) {
      var li = el('li', 'issue c-' + issue.category);
      li.dataset.id = issue.id;
      if (issue.id === activeId) li.classList.add('active');
      li.appendChild(el('div', 'cat', S.CATEGORIES[issue.category].name +
        (issue.inline === false ? ' · весь фрагмент' : '')));
      var frag = el('div', 'frag');
      var old = el('s', '', fragmentLabel(issue));
      frag.appendChild(old);
      var rep = issue.replacements[0];
      if (rep !== undefined) {
        frag.appendChild(document.createTextNode(' → ' + (rep === rep.trim() && rep ? rep : '«' + rep.replace(/ /g, '·') + '»')));
      }
      li.appendChild(frag);
      li.appendChild(el('div', 'msg', issue.message));
      li.appendChild(fixButtons(issue));
      li.addEventListener('click', function () { focusIssue(issue.id, true); });
      list.appendChild(li);
    });
  }

  function renderLegend() {
    var legend = $('legend');
    legend.textContent = '';
    var counts = S.countByCategory(state ? state.issues : []);
    Object.keys(S.CATEGORIES).forEach(function (k) {
      var li = el('li');
      li.appendChild(el('span', 'swatch c-' + k));
      li.appendChild(el('span', '', S.CATEGORIES[k].name));
      li.appendChild(el('b', '', state ? String(counts[k]) : '—'));
      legend.appendChild(li);
    });
  }

  // ---------- Действия ----------

  function fix(id, replacement) {
    var target = state.issues.filter(function (i) { return i.id === id; })[0];
    var next = S.applyFix(state.text, state.issues, id, replacement);
    state.text = next.text;
    state.issues = next.issues;
    input.value = state.text;
    hidePopover();
    render(target ? { offset: target.offset, length: replacement.length } : null);
  }

  function ignore(id) {
    state.issues = state.issues.filter(function (i) { return i.id !== id; });
    hidePopover();
    render();
  }

  function fixAll() {
    var next = S.applyAll(state.text, state.issues);
    var fixed = state.issues.length - next.issues.length;
    state.text = next.text;
    state.issues = next.issues;
    input.value = state.text;
    hidePopover();
    render();
    setStatus('Исправлено: ' + fixed + '.' + (state.issues.length ? ' Остались замечания без готового исправления — посмотрите их в списке.' : ''));
  }

  function copyText() {
    var text = state ? state.text : input.value;
    var done = function () { setStatus('Текст скопирован в буфер обмена.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      input.value = text;
      input.hidden = false;
      input.select();
      try { document.execCommand('copy'); done(); } catch (e) { setStatus('Не удалось скопировать — выделите текст вручную.', true); }
      if (state) input.hidden = true;
    }
  }

  // ---------- Подсказка у подчёркнутого слова ----------

  function focusIssue(id, fromList) {
    activeId = id;
    document.querySelectorAll('.err.active, .issue.active').forEach(function (n) { n.classList.remove('active'); });
    var span = output.querySelector('.err[data-id="' + id + '"]');
    var li = document.querySelector('.issue[data-id="' + id + '"]');
    if (li) li.classList.add('active');
    if (span) {
      span.classList.add('active');
      if (fromList) span.scrollIntoView({ block: 'center', behavior: 'smooth' });
      else if (li) li.scrollIntoView({ block: 'nearest' });
    }
  }

  function showPopover(span) {
    var id = Number(span.dataset.id);
    var issue = state.issues.filter(function (i) { return i.id === id; })[0];
    if (!issue) return;
    focusIssue(id, false);
    popover.textContent = '';
    popover.appendChild(el('div', 'cat', S.CATEGORIES[issue.category].name));
    popover.appendChild(el('p', 'msg', issue.message));
    popover.appendChild(fixButtons(issue));
    popover.hidden = false;
    var r = span.getBoundingClientRect();
    var left = Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - popover.offsetWidth - 16);
    popover.style.left = Math.max(16, left) + 'px';
    popover.style.top = (r.bottom + window.scrollY + 6) + 'px';
  }

  function hidePopover() {
    popover.hidden = true;
  }

  // ---------- События ----------

  output.addEventListener('click', function (e) {
    var span = e.target.closest('.err');
    if (span) { e.stopPropagation(); showPopover(span); }
  });
  output.addEventListener('keydown', function (e) {
    var span = e.target.closest('.err');
    if (span && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showPopover(span); }
  });
  document.addEventListener('click', function (e) {
    if (!popover.hidden && !popover.contains(e.target)) hidePopover();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hidePopover();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runCheck();
  });

  $('checkBtn').addEventListener('click', function () {
    if (state) input.value = state.text;
    runCheck();
  });
  $('editBtn').addEventListener('click', showEditor);
  $('fixAllBtn').addEventListener('click', fixAll);
  $('copyBtn').addEventListener('click', copyText);
  $('sampleBtn').addEventListener('click', function () {
    if (state) showEditor();
    input.value = SAMPLE;
    updateCharCount();
    setStatus('');
  });
  $('clearBtn').addEventListener('click', function () {
    if (state) showEditor();
    input.value = '';
    updateCharCount();
    setStatus('');
  });
  input.addEventListener('input', updateCharCount);

  // Настройки запоминаются в браузере
  var useClaude = $('useClaude');
  var apiKey = $('apiKey');
  useClaude.checked = store('spell.useClaude') === '1';
  $('useLT').checked = store('spell.useLT') !== '0';
  $('lang').value = store('spell.lang') || 'ru-RU';
  apiKey.value = store('spell.apiKey') || '';
  $('claudeBox').hidden = !useClaude.checked;
  useClaude.addEventListener('change', function () {
    $('claudeBox').hidden = !useClaude.checked;
    store('spell.useClaude', useClaude.checked ? '1' : '0');
  });
  $('useLT').addEventListener('change', function () { store('spell.useLT', this.checked ? '1' : '0'); });
  $('lang').addEventListener('change', function () { store('spell.lang', this.value); });
  apiKey.addEventListener('change', function () { store('spell.apiKey', apiKey.value.trim() || null); });

  render();
})();
