/*
 * Ядро проверки правописания: встроенные правила, разбор ответов LanguageTool и Claude,
 * слияние замечаний, применение исправлений.
 *
 * Модуль без зависимостей: работает в браузере (window.SpellChecker) и в Node.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpellChecker = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Категории замечаний. Порядок — приоритет при пересечении (выше — важнее).
  var CATEGORIES = {
    spelling: { name: 'Орфография', priority: 5 },
    grammar: { name: 'Грамматика', priority: 4 },
    punctuation: { name: 'Пунктуация', priority: 3 },
    logic: { name: 'Логика и смысл', priority: 2 },
    style: { name: 'Стиль', priority: 1 }
  };

  // Частые ошибки, которые ловятся без интернета. Ключ — неверное написание (в нижнем регистре).
  var COMMON_MISTAKES = {
    'пошол': 'пошёл', 'зделать': 'сделать', 'зделал': 'сделал',
    'извени': 'извини', 'извените': 'извините', 'здраствуйте': 'здравствуйте',
    'здраствуй': 'здравствуй', 'прийдти': 'прийти', 'прийдёт': 'придёт', 'прийдет': 'придет',
    'будующий': 'будущий', 'будующем': 'будущем', 'черезчур': 'чересчур',
    'вообщем': 'в общем', 'впринципе': 'в принципе', 'вобщем': 'в общем',
    'координально': 'кардинально', 'агенство': 'агентство', 'инциндент': 'инцидент', 'конкурентноспособный': 'конкурентоспособный',
    'ихний': 'их', 'ихние': 'их', 'ихнего': 'их', 'ложить': 'класть', 'ложу': 'кладу',
    'ложит': 'кладёт', 'ехай': 'поезжай', 'ехайте': 'поезжайте', 'лазиет': 'лазит',
    'симпотичный': 'симпатичный', 'симпотичная': 'симпатичная', 'сдесь': 'здесь',
    'щас': 'сейчас', 'чтоли': 'что ли', 'в кратце': 'вкратце', 'нечего подобного': 'ничего подобного',
    'расчитать': 'рассчитать', 'расчитывать': 'рассчитывать', 'подчерк': 'почерк', 'сдесь': 'здесь', 'безплатно': 'бесплатно',
    'разочерованый': 'разочарованный', 'обьявление': 'объявление', 'обьяснить': 'объяснить',
    'подьезд': 'подъезд', 'сьесть': 'съесть', 'пъеса': 'пьеса', 'интерестный': 'интересный',
    'интерестно': 'интересно', 'чуствовать': 'чувствовать',
    'чуство': 'чувство', 'лесница': 'лестница', 'учавствовать': 'участвовать',
    'учавствует': 'участвует', 'подскользнуться': 'поскользнуться',
    'скурпулёзно': 'скрупулёзно', 'скурпулезно': 'скрупулезно', 'прецендент': 'прецедент',
    'дермантин': 'дерматин', 'экспрессо': 'эспрессо',
    'ексклюзивный': 'эксклюзивный', 'почтальен': 'почтальон', 'будте': 'будьте', 'помойму': 'по-моему', 'помоему': 'по-моему', 'почемуто': 'почему-то', 'какойто': 'какой-то', 'когдато': 'когда-то',
    'гдето': 'где-то', 'ктото': 'кто-то', 'чтото': 'что-то', 'както': 'как-то',
    'вобще': 'вообще', 'вообщем-то': 'в общем-то', 'граммотный': 'грамотный',
    'граматика': 'грамматика', 'аппелляция': 'апелляция', 'апеляция': 'апелляция', 'пасажир': 'пассажир', 'колличество': 'количество',
    'класный': 'классный', 'проффесионал': 'профессионал', 'профессианал': 'профессионал',
    'кофэ': 'кофе', 'тоесть': 'то есть', 'то-есть': 'то есть', 'итд': 'и т. д.',
    'итп': 'и т. п.', 'нету': 'нет'
  };

  var WORD = 'A-Za-zА-Яа-яЁё';

  function matchCase(sample, replacement) {
    if (sample === sample.toUpperCase() && sample.length > 1) return replacement.toUpperCase();
    if (sample[0] === sample[0].toUpperCase() && sample[0] !== sample[0].toLowerCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  function issue(offset, length, category, message, replacements, source) {
    return {
      offset: offset,
      length: length,
      category: category,
      message: message,
      replacements: replacements || [],
      source: source || 'local'
    };
  }

  /*
   * Встроенные правила: работают мгновенно и без интернета.
   * Ловят повторы слов, лишние пробелы, пробелы у знаков препинания,
   * строчную букву в начале предложения и частые орфографические ошибки.
   */
  function localCheck(text) {
    var out = [];
    var m;

    // Частые ошибки из словаря
    var single = new RegExp('[' + WORD + ']+', 'g');
    while ((m = single.exec(text))) {
      var w = m[0].toLowerCase();
      if (COMMON_MISTAKES[w]) {
        out.push(issue(m.index, m[0].length, 'spelling', 'Слово пишется иначе.',
          [matchCase(m[0], COMMON_MISTAKES[w])]));
      }
    }
    // Сочетания из двух слов («в кратце», «нечего подобного»)
    Object.keys(COMMON_MISTAKES).forEach(function (key) {
      if (key.indexOf(' ') < 0) return;
      var re = new RegExp('(^|[^' + WORD + '])(' + key.replace(' ', '\\s+') + ')(?=$|[^' + WORD + '])', 'gi');
      var mm;
      while ((mm = re.exec(text))) {
        var start = mm.index + mm[1].length;
        out.push(issue(start, mm[2].length, 'spelling', 'Сочетание пишется иначе.',
          [matchCase(mm[2], COMMON_MISTAKES[key])]));
      }
    });

    // Повтор слова: «и и», «я я»
    var rep = new RegExp('(^|[^' + WORD + '])([' + WORD + ']+)(\\s+)(\\2)(?=$|[^' + WORD + '])', 'gi');
    while ((m = rep.exec(text))) {
      var s = m.index + m[1].length;
      out.push(issue(s, m[2].length + m[3].length + m[4].length, 'grammar',
        'Слово повторяется два раза подряд.', [m[2]]));
      rep.lastIndex = s + m[2].length;
    }

    // Несколько пробелов подряд
    var sp = / {2,}/g;
    while ((m = sp.exec(text))) {
      out.push(issue(m.index, m[0].length, 'punctuation', 'Лишние пробелы.', [' ']));
    }

    // Пробел перед знаком препинания: «слово ,»
    var before = new RegExp('([' + WORD + '0-9)»"])( +)([,.;:!?])(?=([' + WORD + '])?)', 'g');
    while ((m = before.exec(text))) {
      // «слово ,слово» — заодно ставим пробел после знака
      out.push(issue(m.index + m[1].length, m[2].length + 1, 'punctuation',
        'Перед знаком препинания пробел не ставится.', [m[4] ? m[3] + ' ' : m[3]]));
    }

    // Нет пробела после знака препинания: «слово,слово»
    var after = new RegExp('([' + WORD + ']{2,})([,;:!?]|\\.)([' + WORD + ']{2,})', 'g');
    while ((m = after.exec(text))) {
      // Пропускаем адреса, домены и сокращения вида «т.е.»
      if (m[2] === '.' && /[a-z]/.test(m[3][0])) continue;
      var pos = m.index + m[1].length;
      out.push(issue(pos, 1, 'punctuation', 'После знака препинания нужен пробел.', [m[2] + ' ']));
      after.lastIndex = pos + 1;
    }

    // Строчная буква в начале текста или после конца предложения
    var cap = /(^|[.!?…]\s+)([а-яё])/g;
    while ((m = cap.exec(text))) {
      var p = m.index + m[1].length;
      // «т. е.», «и т. д. и т. п.» — после сокращений заглавная не нужна
      var prev = text.slice(Math.max(0, m.index - 4), m.index + 1);
      if (/(^|\s)(т|д|п|е|г|гг|им|см|ср|др|пр|тыс|млн|млрд|руб|коп|ул|стр|рис|ок|ст)\.$/i.test(prev)) continue;
      // Если слово уже исправляется по словарю — делаем заглавной букву в его замене
      var same = out.filter(function (i) { return i.offset === p; })[0];
      if (same) {
        same.replacements = same.replacements.map(function (r) { return r[0].toUpperCase() + r.slice(1); });
        same.message += ' Предложение начинается с заглавной буквы.';
        continue;
      }
      out.push(issue(p, 1, 'spelling', 'Предложение начинается с заглавной буквы.',
        [m[2].toUpperCase()]));
    }

    // Дефис вместо тире между словами: «Москва - столица»
    var dash = new RegExp('([' + WORD + '0-9]) (-|--) (?=[' + WORD + '0-9])', 'g');
    while ((m = dash.exec(text))) {
      out.push(issue(m.index + 2, m[2].length, 'punctuation',
        'Между словами ставится тире, а не дефис.', ['—']));
    }

    return out;
  }

  // Категория по правилу LanguageTool
  function ltCategory(match) {
    var rule = match.rule || {};
    var cat = (rule.category && rule.category.id) || '';
    var type = rule.issueType || '';
    if (type === 'misspelling' || cat === 'TYPOS' || cat === 'CASING') return 'spelling';
    if (cat === 'PUNCTUATION' || cat === 'TYPOGRAPHY' || type === 'typographical') return 'punctuation';
    if (cat === 'STYLE' || cat === 'REDUNDANCY' || cat === 'PLAIN_ENGLISH' || type === 'style') return 'style';
    if (cat === 'SEMANTICS' || cat === 'CONFUSED_WORDS' || cat === 'LOGIC') return 'logic';
    return 'grammar';
  }

  // Ответ LanguageTool (/v2/check) → замечания
  function fromLanguageTool(response) {
    return ((response && response.matches) || []).map(function (m) {
      return issue(m.offset, m.length, ltCategory(m), m.message || m.shortMessage || 'Возможная ошибка.',
        (m.replacements || []).slice(0, 5).map(function (r) { return r.value; }), 'languagetool');
    });
  }

  // JSON-схема ответа Claude (structured outputs)
  var CLAUDE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['issues', 'summary'],
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['fragment', 'category', 'explanation', 'has_fix', 'replacement'],
          properties: {
            fragment: { type: 'string', description: 'Точная цитата ошибочного места из исходного текста, символ в символ' },
            category: { type: 'string', enum: ['spelling', 'grammar', 'punctuation', 'style', 'logic'] },
            explanation: { type: 'string', description: 'Короткое объяснение по-русски: в чём ошибка и какое правило' },
            has_fix: { type: 'boolean', description: 'false, если исправить автоматически нельзя (например, противоречие в рассуждении)' },
            replacement: { type: 'string', description: 'Исправленный вариант фрагмента; пустая строка — удалить фрагмент' }
          }
        }
      },
      summary: { type: 'string', description: 'Общий вывод о тексте в 1–3 предложениях' }
    }
  };

  var CLAUDE_SYSTEM = [
    'Ты — опытный корректор и редактор русского языка (и других языков, если текст на них).',
    'Проверь текст пользователя: орфографию, грамматику (согласование, управление, формы слов),',
    'пунктуацию, стиль (тавтология, канцелярит, неудачные обороты) и логику',
    '(противоречия, нарушенная последовательность, неверные выводы, фактические несостыковки внутри текста).',
    'Для каждой ошибки верни fragment — точную цитату из текста, как можно короче, но однозначную;',
    'не перефразируй и не меняй в ней ни одного символа, иначе её не найти в тексте.',
    'replacement — только исправленный фрагмент, а не всё предложение.',
    'Не придирайся к допустимым вариантам и авторскому стилю; если ошибок нет, верни пустой список.',
    'Объяснения пиши по-русски, кратко.'
  ].join(' ');

  // Находит фрагменты, которые вернул Claude, в исходном тексте и превращает их в замечания
  function fromClaude(text, data) {
    var out = [];
    var cursor = 0;
    ((data && data.issues) || []).forEach(function (it) {
      if (!it.fragment) return;
      var pos = text.indexOf(it.fragment, cursor);
      if (pos < 0) pos = text.indexOf(it.fragment);
      if (pos < 0) return;
      cursor = pos + it.fragment.length;
      var cat = CATEGORIES[it.category] ? it.category : 'grammar';
      var reps = it.has_fix && it.replacement !== it.fragment ? [it.replacement] : [];
      out.push(issue(pos, it.fragment.length, cat, it.explanation, reps, 'claude'));
    });
    return out;
  }

  function overlaps(a, b) {
    return a.offset < b.offset + b.length && b.offset < a.offset + a.length;
  }

  /*
   * Объединяет замечания из разных источников: убирает дубли и пересечения.
   * При пересечении остаётся замечание более важной категории, затем — более короткое.
   * Логическое замечание, которое накрывает уже подчёркнутое место, не теряется:
   * оно остаётся в списке с пометкой inline = false (без подчёркивания в тексте).
   */
  function merge(lists) {
    var all = [].concat.apply([], lists).filter(function (i) { return i.length > 0; });
    all.sort(function (a, b) {
      return (CATEGORIES[b.category].priority - CATEGORIES[a.category].priority) ||
        (a.length - b.length) || (a.offset - b.offset);
    });
    var kept = [];
    all.forEach(function (i) {
      var clash = kept.filter(function (k) { return k.inline !== false && overlaps(k, i); });
      if (!clash.length) {
        kept.push(Object.assign({}, i, { inline: true }));
      } else if (i.category === 'logic' && clash.every(function (k) { return k.category !== 'logic'; })) {
        kept.push(Object.assign({}, i, { inline: false }));
      }
    });
    kept.sort(function (a, b) { return a.offset - b.offset; });
    kept.forEach(function (k, n) { k.id = n; });
    return kept;
  }

  /*
   * Применяет замену к тексту. Возвращает новый текст и сдвинутые оставшиеся замечания
   * (исправленное и пересекающиеся с ним удаляются).
   */
  function applyFix(text, issues, id, replacement) {
    var target = issues.filter(function (i) { return i.id === id; })[0];
    if (!target) return { text: text, issues: issues };
    if (replacement === undefined) replacement = target.replacements[0];
    if (replacement === undefined) return { text: text, issues: issues };
    var newText = text.slice(0, target.offset) + replacement + text.slice(target.offset + target.length);
    var delta = replacement.length - target.length;
    var rest = issues.filter(function (i) {
      return i.id !== id && !overlaps(i, target);
    }).map(function (i) {
      var c = Object.assign({}, i);
      if (c.offset >= target.offset + target.length) c.offset += delta;
      return c;
    });
    return { text: newText, issues: rest };
  }

  // Применяет первую предложенную замену ко всем замечаниям, где она есть
  function applyAll(text, issues) {
    var state = { text: text, issues: issues };
    var fixable = issues.filter(function (i) { return i.replacements.length; })
      .sort(function (a, b) { return b.offset - a.offset; });
    fixable.forEach(function (i) {
      if (state.issues.some(function (x) { return x.id === i.id; })) {
        state = applyFix(state.text, state.issues, i.id);
      }
    });
    return state;
  }

  /*
   * Делит длинный текст на части не длиннее max символов по границам абзацев
   * (или предложений), чтобы уложиться в лимит запроса LanguageTool.
   */
  function splitChunks(text, max) {
    var chunks = [];
    var start = 0;
    while (text.length - start > max) {
      var slice = text.slice(start, start + max);
      var cut = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '), slice.lastIndexOf(' '));
      cut = cut > 0 ? cut + 1 : max;
      chunks.push({ offset: start, text: text.slice(start, start + cut) });
      start += cut;
    }
    chunks.push({ offset: start, text: text.slice(start) });
    return chunks;
  }

  // Сдвигает замечания, найденные в части текста, на её позицию в целом тексте
  function shift(issues, offset) {
    return issues.map(function (i) { return Object.assign({}, i, { offset: i.offset + offset }); });
  }

  // Режет текст на куски для подсветки: [{text, issue|null}]
  function segments(text, issues) {
    var out = [];
    var pos = 0;
    issues.filter(function (i) { return i.inline !== false; })
      .sort(function (a, b) { return a.offset - b.offset; }).forEach(function (i) {
        if (i.offset < pos) return;
        if (i.offset > pos) out.push({ text: text.slice(pos, i.offset), issue: null });
        out.push({ text: text.slice(i.offset, i.offset + i.length), issue: i });
        pos = i.offset + i.length;
      });
    if (pos < text.length) out.push({ text: text.slice(pos), issue: null });
    return out;
  }

  function countByCategory(issues) {
    var c = {};
    Object.keys(CATEGORIES).forEach(function (k) { c[k] = 0; });
    issues.forEach(function (i) { c[i.category]++; });
    return c;
  }

  return {
    CATEGORIES: CATEGORIES,
    COMMON_MISTAKES: COMMON_MISTAKES,
    CLAUDE_SCHEMA: CLAUDE_SCHEMA,
    CLAUDE_SYSTEM: CLAUDE_SYSTEM,
    localCheck: localCheck,
    fromLanguageTool: fromLanguageTool,
    fromClaude: fromClaude,
    merge: merge,
    applyFix: applyFix,
    applyAll: applyAll,
    splitChunks: splitChunks,
    shift: shift,
    segments: segments,
    countByCategory: countByCategory
  };
});
