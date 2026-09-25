const test = require('node:test');
const assert = require('node:assert');
const S = require('../checker.js');

function fixAll(text, lists) {
  return S.applyAll(text, S.merge(lists || [S.localCheck(text)])).text;
}

test('словарь частых ошибок с сохранением регистра', () => {
  assert.strictEqual(fixAll('Я пошол домой. Вообщем, всё.'), 'Я пошёл домой. В общем, всё.');
  assert.strictEqual(fixAll('Здраствуйте!'), 'Здравствуйте!');
  assert.strictEqual(fixAll('Это нечего подобного.'), 'Это ничего подобного.');
});

test('повтор слова', () => {
  const issues = S.localCheck('Мы пошли в в магазин.');
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].category, 'grammar');
  assert.strictEqual(fixAll('Мы пошли в в магазин.'), 'Мы пошли в магазин.');
});

test('пробелы и знаки препинания', () => {
  assert.strictEqual(fixAll('Привет ,как дела ?'), 'Привет, как дела?');
  assert.strictEqual(fixAll('Один  два.'), 'Один два.');
  assert.strictEqual(fixAll('Москва - столица.'), 'Москва — столица.');
});

test('заглавная буква в начале предложения, но не после сокращений', () => {
  assert.strictEqual(fixAll('привет. как дела? хорошо'), 'Привет. Как дела? Хорошо');
  assert.deepStrictEqual(S.localCheck('Яблоки, груши и т. д. все фрукты.'), []);
  assert.deepStrictEqual(S.localCheck('Сайт example.com и число 3.5 без ошибок.'), []);
});

test('чистый текст — без замечаний', () => {
  assert.deepStrictEqual(S.localCheck('Мама мыла раму. Папа читал газету, а кот спал.'), []);
});

test('разбор ответа LanguageTool', () => {
  const text = 'Он зделал ошибку';
  const lt = { matches: [
    { message: 'Возможно, опечатка', offset: 3, length: 6,
      replacements: [{ value: 'сделал' }, { value: 'сделала' }],
      rule: { id: 'MORFOLOGIK_RULE_RU_RU', issueType: 'misspelling', category: { id: 'TYPOS' } } },
    { message: 'Пропущена точка', offset: 10, length: 6, replacements: [{ value: 'ошибку.' }],
      rule: { id: 'X', issueType: 'typographical', category: { id: 'PUNCTUATION' } } }
  ] };
  const issues = S.fromLanguageTool(lt);
  assert.deepStrictEqual(issues.map(i => i.category), ['spelling', 'punctuation']);
  assert.deepStrictEqual(issues[0].replacements, ['сделал', 'сделала']);
  // Дубль со встроенным словарём схлопывается
  const merged = S.merge([S.localCheck(text), issues]);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(S.applyAll(text, merged).text, 'Он сделал ошибку.');
});

test('разбор ответа Claude: поиск фрагментов и логика без автоисправления', () => {
  const text = 'Сегодня понедельник, поэтому завтра будет воскресенье. Мы едем на дачу.';
  const data = { summary: '', issues: [
    { fragment: 'завтра будет воскресенье', category: 'logic', has_fix: true,
      replacement: 'завтра будет вторник', explanation: 'После понедельника идёт вторник.' },
    { fragment: 'нет такого фрагмента', category: 'spelling', has_fix: true,
      replacement: 'x', explanation: '' },
    { fragment: 'Мы едем на дачу', category: 'style', has_fix: false,
      replacement: '', explanation: 'Не связано с предыдущим.' }
  ] };
  const issues = S.fromClaude(text, data);
  assert.strictEqual(issues.length, 2);
  assert.strictEqual(text.substr(issues[0].offset, issues[0].length), 'завтра будет воскресенье');
  assert.deepStrictEqual(issues[1].replacements, []);
  const merged = S.merge([issues]);
  assert.strictEqual(S.applyAll(text, merged).text,
    'Сегодня понедельник, поэтому завтра будет вторник. Мы едем на дачу.');
});

test('логическое замечание поверх орфографической ошибки остаётся в списке', () => {
  const text = 'Он пошол домой и остался на работе.';
  const logic = S.fromClaude(text, { issues: [{ fragment: 'Он пошол домой и остался на работе',
    category: 'logic', has_fix: false, replacement: '', explanation: 'Противоречие.' }] });
  const merged = S.merge([S.localCheck(text), logic]);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged.find(i => i.category === 'logic').inline, false);
  assert.strictEqual(S.segments(text, merged).filter(s => s.issue).length, 1);
});

test('исправление сдвигает остальные замечания', () => {
  const text = 'вообщем, я пошол.';
  const merged = S.merge([S.localCheck(text)]);
  const first = merged.find(i => i.replacements[0] === 'В общем');
  const st = S.applyFix(text, merged, first.id);
  assert.strictEqual(st.text, 'В общем, я пошол.');
  const rest = st.issues[0];
  assert.strictEqual(st.text.substr(rest.offset, rest.length), 'пошол');
  assert.strictEqual(S.applyFix(st.text, st.issues, rest.id).text, 'В общем, я пошёл.');
});

test('сегменты склеиваются обратно в исходный текст', () => {
  const text = 'привет ,мир  и и всё';
  const segs = S.segments(text, S.merge([S.localCheck(text)]));
  assert.strictEqual(segs.map(s => s.text).join(''), text);
});

test('деление длинного текста на части', () => {
  const text = 'Первый абзац текста.\nВторой абзац. Третье предложение тут.';
  const chunks = S.splitChunks(text, 25);
  assert.ok(chunks.every(c => c.text.length <= 25));
  assert.strictEqual(chunks.map(c => c.text).join(''), text);
  chunks.forEach(c => assert.strictEqual(text.substr(c.offset, c.text.length), c.text));
  assert.deepStrictEqual(S.splitChunks('коротко', 100), [{ offset: 0, text: 'коротко' }]);
});
