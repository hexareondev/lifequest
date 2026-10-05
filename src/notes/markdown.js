// Разметка заметок: разбор markdown в блоки и операции панели инструментов. Ни того, ни другого
// нет в интерфейсе — рендер блоков (MarkdownView, InlineText) остался в разделе MARKDOWN главного
// файла, сюда переехало только то, что можно проверить без браузера.

import { clamp } from "../core/basics.js";
import { NOTE_TAG_INLINE_RE } from "./model.js";

// Один парсер на всё приложение: и на заметки, и на свободные «Заметки» в карточке человека.
// Держать рядом упрощённый и полный означало бы чинить каждый баг разметки дважды.
// Библиотека сюда не тянется сознательно — файл один и должен открываться превью-загрузчиком
// артефакта, а нужного нам подмножества хватает на пару сотен строк.
//
// Блоки хранят номер исходной строки (line) — благодаря этому чекбоксы можно переключать прямо
// в просмотре: переключатель правит РОВНО одну строку исходника, а не пересобирает текст.
export function parseMarkdown(text) {
  if (!text) return [];
  const lines = String(text).split("\n");
  const blocks = [];
  let list = null;
  let quote = null;
  let code = null;

  function flush() {
    if (list) { blocks.push(list); list = null; }
    if (quote) { blocks.push(quote); quote = null; }
  }

  lines.forEach((raw, idx) => {
    const line = raw.replace(/\t/g, "  ");
    const trimmed = line.trim();

    if (code) {
      if (/^```/.test(trimmed)) { blocks.push(code); code = null; }
      else code.lines.push(raw);
      return;
    }
    const fence = trimmed.match(/^```\s*([A-Za-z0-9+#-]*)\s*$/);
    if (fence) { flush(); code = { type: "code", lang: fence[1] || "", lines: [] }; return; }

    // Встраивание на собственной строке становится карточкой; то же самое посреди абзаца
    // разбирается строчной плашкой (см. parseInline) — карточка разорвала бы текст.
    const embed = trimmed.match(/^!\[\[([^\]]+)\]\]$/);
    if (embed) { flush(); blocks.push({ type: "embed", ref: embed[1], line: idx }); return; }

    if (/^([-_*]\s*){3,}$/.test(trimmed) && !/^[-*]\s+\S/.test(trimmed)) { flush(); blocks.push({ type: "hr" }); return; }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { flush(); blocks.push({ type: "h", level: heading[1].length, text: heading[2], line: idx }); return; }

    const quoted = trimmed.match(/^>\s?(.*)$/);
    if (quoted) {
      if (list) { blocks.push(list); list = null; }
      if (!quote) quote = { type: "quote", lines: [] };
      quote.lines.push(quoted[1]);
      return;
    }
    if (quote) { blocks.push(quote); quote = null; }

    const indent = line.match(/^\s*/)[0].length;
    const depth = Math.min(4, Math.floor(indent / 2));
    const todo = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (todo) {
      if (!list || list.type !== "todo") { if (list) blocks.push(list); list = { type: "todo", items: [] }; }
      list.items.push({ text: todo[2], checked: todo[1].toLowerCase() === "x", depth, line: idx });
      return;
    }
    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      if (!list || list.type !== "ul") { if (list) blocks.push(list); list = { type: "ul", items: [] }; }
      list.items.push({ text: bullet[1], depth, line: idx });
      return;
    }
    const numbered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      if (!list || list.type !== "ol") { if (list) blocks.push(list); list = { type: "ol", items: [], start: Number(numbered[1]) || 1 }; }
      list.items.push({ text: numbered[2], depth, line: idx });
      return;
    }

    flush();
    if (trimmed === "") { blocks.push({ type: "blank" }); return; }
    // Идущие подряд обычные строки склеиваются в один абзац: перенос внутри абзаца сохраняется
    // (whitespace-pre-wrap), но лишние отступы между строками одного абзаца не появляются.
    const prev = blocks[blocks.length - 1];
    if (prev && prev.type === "p") { prev.text += "\n" + line; return; }
    blocks.push({ type: "p", text: line, line: idx });
  });

  if (code) blocks.push(code);
  flush();
  return blocks;
}

// Строчная разметка. Разбор — посимвольным сканером, а не одной большой регуляркой: у регулярки
// пришлось бы разруливать приоритет `**` над `*` и границу тега через lookbehind, который есть
// не во всех браузерах. Вложенность внутри выделения (жирный внутри курсива) не поддержана
// намеренно — она почти не встречается, а стоит заметного усложнения.
export function parseInline(text) {
  const out = [];
  let buf = "";
  let i = 0;
  const src = String(text || "");
  function push(node) { if (buf) { out.push(buf); buf = ""; } out.push(node); }
  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);
    let m;
    if (ch === "`" && (m = rest.match(/^`([^`]+)`/))) { push({ t: "code", v: m[1] }); i += m[0].length; continue; }
    if (ch === "!" && (m = rest.match(/^!\[\[([^\]]+)\]\]/))) { push({ t: "embed", v: m[1].trim() }); i += m[0].length; continue; }
    if (ch === "[" && (m = rest.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/))) { push({ t: "wiki", v: m[1].trim(), label: (m[2] || m[1]).trim() }); i += m[0].length; continue; }
    if (ch === "[" && (m = rest.match(/^\[([^\]]*)\]\(([^)\s]+)\)/))) { push({ t: "link", v: m[2], label: m[1] || m[2] }); i += m[0].length; continue; }
    if (ch === "*" && (m = rest.match(/^\*\*([^*]+)\*\*/))) { push({ t: "b", v: m[1] }); i += m[0].length; continue; }
    if (ch === "_" && (m = rest.match(/^__([^_]+)__/))) { push({ t: "b", v: m[1] }); i += m[0].length; continue; }
    if (ch === "~" && (m = rest.match(/^~~([^~]+)~~/))) { push({ t: "s", v: m[1] }); i += m[0].length; continue; }
    if (ch === "=" && (m = rest.match(/^==([^=]+)==/))) { push({ t: "mark", v: m[1] }); i += m[0].length; continue; }
    if (ch === "*" && (m = rest.match(/^\*([^*\n]+)\*/))) { push({ t: "i", v: m[1] }); i += m[0].length; continue; }
    if (ch === "_" && (m = rest.match(/^_([^_\n]+)_/))) { push({ t: "i", v: m[1] }); i += m[0].length; continue; }
    if (ch === "#" && (i === 0 || /[\s([]/.test(src[i - 1])) && (m = rest.match(NOTE_TAG_INLINE_RE)) && !/^\d+$/.test(m[1])) {
      push({ t: "tag", v: m[1] }); i += m[0].length; continue;
    }
    if (ch === "h" && (m = rest.match(/^https?:\/\/[^\s)]+/))) { push({ t: "link", v: m[0], label: m[0] }); i += m[0].length; continue; }
    buf += ch; i++;
  }
  if (buf) out.push(buf);
  return out;
}

// Переключение чекбокса правит ровно одну строку исходника — ни пробелы, ни соседние строки не
// трогаются, поэтому отметка галочки не переписывает текст заметки под себя.
export function toggleMarkdownCheckbox(text, lineIndex) {
  const lines = String(text || "").split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return text;
  const line = lines[lineIndex];
  const m = line.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/);
  if (!m) return text;
  lines[lineIndex] = m[1] + (m[2].toLowerCase() === "x" ? " " : "x") + m[3];
  return lines.join("\n");
}

/* --- Операции панели инструментов ---
   Каждая операция — чистая функция от (текст, границы выделения) к описанию правки:
   заменить [from, to) на insert и оставить выделение в [selStart, selEnd]. Такое описание, а не
   готовый новый текст, нужно по одной причине: применяя правку точечно через штатную вставку
   браузера, мы сохраняем СВОЮ историю отмены в поле ввода. Замена всего текста целиком её
   обнуляет, и Ctrl+Z после нажатия кнопки перестаёт работать. */

// Любой известный блочный префикс строки. Порядок важен: чекбокс должен разбираться раньше
// обычного маркера списка, иначе "- [ ] " распознается как "- " с текстом "[ ] ".
const MD_LINE_PREFIX_RE = /^(\s*)(#{1,6} +|> ?|[-*+] +\[[ xX]\] +|[-*+] +|\d+[.)] +)?/;

const MD_ACTIONS = {
  bold:      { kind: "wrap", left: "**", right: "**", placeholder: "жирный" },
  italic:    { kind: "wrap", left: "*",  right: "*",  placeholder: "курсив", single: true },
  strike:    { kind: "wrap", left: "~~", right: "~~", placeholder: "зачёркнутый" },
  mark:      { kind: "wrap", left: "==", right: "==", placeholder: "выделенный" },
  code:      { kind: "wrap", left: "`",  right: "`",  placeholder: "код" },
  wiki:      { kind: "wrap", left: "[[", right: "]]", placeholder: "Заметка" },
  h1:        { kind: "line", prefix: "# " },
  h2:        { kind: "line", prefix: "## " },
  h3:        { kind: "line", prefix: "### " },
  ul:        { kind: "line", prefix: "- " },
  ol:        { kind: "line", prefix: "1. ", ordered: true },
  todo:      { kind: "line", prefix: "- [ ] " },
  quote:     { kind: "line", prefix: "> " },
  codeblock: { kind: "fence" },
  link:      { kind: "link" },
  hr:        { kind: "insert", text: "\n---\n" },
};

// Уже стоящий на строке префикс того же рода? Заголовок при этом сверяется по уровню: H2 поверх
// H1 должен заменять уровень, а не выключать заголовок.
function mdSamePrefixKind(action, existing) {
  if (!existing) return false;
  if (action.ordered) return /^\d+[.)] +$/.test(existing);
  if (/^\[ \]/.test(action.prefix.slice(2))) return /^[-*+] +\[[ xX]\] +$/.test(existing);
  if (action.prefix === "- ") return /^[-*+] +$/.test(existing);
  if (action.prefix === "> ") return /^> ?$/.test(existing);
  return existing === action.prefix;
}

function mdApplyLineAction(text, selStart, selEnd, action) {
  const lineStart = text.lastIndexOf("\n", selStart - 1) + 1;
  let lineEnd = text.indexOf("\n", selEnd);
  if (lineEnd < 0) lineEnd = text.length;
  // Выделение, кончающееся переводом строки, не должно захватывать следующую строку целиком.
  if (selEnd > selStart && text[selEnd - 1] === "\n") lineEnd = selEnd - 1;

  const lines = text.slice(lineStart, lineEnd).split("\n");
  const parsed = lines.map(l => {
    const m = l.match(MD_LINE_PREFIX_RE);
    return { indent: m[1] || "", prefix: m[2] || "", rest: l.slice((m[1] || "").length + (m[2] || "").length) };
  });
  const targets = parsed.some(p => p.rest.trim() !== "")
    ? parsed.map((p, i) => (p.rest.trim() !== "" ? i : -1)).filter(i => i >= 0)
    : parsed.map((_, i) => i);
  const allHave = targets.every(i => mdSamePrefixKind(action, parsed[i].prefix));

  let n = 0;
  const out = parsed.map((p, i) => {
    if (!targets.includes(i)) return p.indent + p.prefix + p.rest;
    if (allHave) return p.indent + p.rest;
    n += 1;
    const prefix = action.ordered ? `${n}. ` : action.prefix;
    return p.indent + prefix + p.rest;
  });
  const insert = out.join("\n");
  return { from: lineStart, to: lineEnd, insert, selStart: lineStart, selEnd: lineStart + insert.length };
}

function mdApplyWrapAction(text, selStart, selEnd, action) {
  const { left, right } = action;
  let a = selStart, b = selEnd;
  // Пробелы по краям выносятся наружу: "** текст **" разметкой не является и ничего не выделит.
  while (a < b && /\s/.test(text[a])) a++;
  while (b > a && /\s/.test(text[b - 1])) b--;
  const sel = text.slice(a, b);

  const doubled = action.single && sel.startsWith(left + left);
  if (!doubled && sel.length >= left.length + right.length && sel.startsWith(left) && sel.endsWith(right)) {
    const insert = sel.slice(left.length, sel.length - right.length);
    return { from: a, to: b, insert, selStart: a, selEnd: a + insert.length };
  }
  // Маркеры могут стоять ВОКРУГ выделения — так выглядит повторное нажатие кнопки по тому же
  // слову: после первого нажатия выделенным остаётся текст внутри маркеров, а не вместе с ними.
  const outsideLeft = text.slice(Math.max(0, a - left.length), a);
  const outsideRight = text.slice(b, b + right.length);
  const outsideDoubled = action.single && (text.slice(Math.max(0, a - 2), a) === left + left);
  if (!outsideDoubled && outsideLeft === left && outsideRight === right) {
    return { from: a - left.length, to: b + right.length, insert: sel, selStart: a - left.length, selEnd: a - left.length + sel.length };
  }
  if (a === b) {
    const insert = left + action.placeholder + right;
    return { from: a, to: b, insert, selStart: a + left.length, selEnd: a + left.length + action.placeholder.length };
  }
  const insert = left + sel + right;
  return { from: a, to: b, insert, selStart: a + left.length, selEnd: a + left.length + sel.length };
}

function mdApplyFenceAction(text, selStart, selEnd) {
  const lineStart = text.lastIndexOf("\n", selStart - 1) + 1;
  let lineEnd = text.indexOf("\n", selEnd);
  if (lineEnd < 0) lineEnd = text.length;
  if (selEnd > selStart && text[selEnd - 1] === "\n") lineEnd = selEnd - 1;
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  if (lines.length >= 2 && /^```/.test(lines[0]) && /^```$/.test(lines[lines.length - 1].trim())) {
    const insert = lines.slice(1, -1).join("\n");
    return { from: lineStart, to: lineEnd, insert, selStart: lineStart, selEnd: lineStart + insert.length };
  }
  const insert = "```\n" + block + "\n```";
  return { from: lineStart, to: lineEnd, insert, selStart: lineStart + 4, selEnd: lineStart + 4 + block.length };
}

function mdApplyLinkAction(text, selStart, selEnd) {
  const sel = text.slice(selStart, selEnd);
  if (!sel) {
    const insert = "[текст](url)";
    return { from: selStart, to: selEnd, insert, selStart: selStart + 1, selEnd: selStart + 6 };
  }
  if (/^https?:\/\/\S+$/.test(sel.trim())) {
    // Выделили адрес — значит не хватает подписи, курсор ставим именно в неё.
    const insert = "[](" + sel.trim() + ")";
    return { from: selStart, to: selEnd, insert, selStart: selStart + 1, selEnd: selStart + 1 };
  }
  const insert = "[" + sel + "](url)";
  const at = selStart + sel.length + 3;
  return { from: selStart, to: selEnd, insert, selStart: at, selEnd: at + 3 };
}

export function applyMarkdownAction(text, selStart, selEnd, actionId) {
  const action = MD_ACTIONS[actionId];
  if (!action) return null;
  const src = String(text || "");
  const a = clamp(Math.min(selStart, selEnd), 0, src.length);
  const b = clamp(Math.max(selStart, selEnd), 0, src.length);
  if (action.kind === "wrap") return mdApplyWrapAction(src, a, b, action);
  if (action.kind === "line") return mdApplyLineAction(src, a, b, action);
  if (action.kind === "fence") return mdApplyFenceAction(src, a, b);
  if (action.kind === "link") return mdApplyLinkAction(src, a, b);
  if (action.kind === "insert") return { from: b, to: b, insert: action.text, selStart: b + action.text.length, selEnd: b + action.text.length };
  return null;
}

// Сколько снизу отъела экранная клавиатура. Считается по visualViewport: при открытой клавиатуре
// она сжимается, а обычный layout-viewport (window.innerHeight) остаётся прежним — именно поэтому
// элемент с position:fixed и bottom:0 на телефоне уезжает ПОД клавиатуру. Разница между ними и
// есть высота, на которую панель нужно приподнять. offsetTop учитывает сдвиг при зумe страницы.
export function keyboardInsetOf(innerHeight, viewportHeight, viewportOffsetTop) {
  const inset = Number(innerHeight) - Number(viewportHeight) - Number(viewportOffsetTop || 0);
  if (!isFinite(inset)) return 0;
  // Мелкие расхождения в пару пикселей дают адресная строка и дробное масштабирование — это не
  // клавиатура, и дёргать панель из-за них не нужно.
  return inset > 80 ? Math.round(inset) : 0;
}

// Enter внутри списка продолжает список, Enter на пустом пункте из списка выходит. Без этого
// кнопки списков выглядят издевательством: разметку ставит кнопка, а дальше её нужно дописывать
// руками на каждой строке.
export function continueListOnEnter(text, pos) {
  const src = String(text || "");
  const lineStart = src.lastIndexOf("\n", pos - 1) + 1;
  const line = src.slice(lineStart, pos);
  const m = line.match(/^(\s*)([-*+] +\[[ xX]\] +|[-*+] +|(\d+)[.)] +)(.*)$/);
  if (!m) return null;
  const [, indent, marker, num, rest] = m;
  if (rest.trim() === "") {
    // Пустой пункт: Enter не плодит ещё один, а убирает маркер и выпускает из списка.
    return { from: lineStart, to: pos, insert: "", selStart: lineStart, selEnd: lineStart };
  }
  let nextMarker = marker;
  if (num) nextMarker = marker.replace(/^\d+/, String(Number(num) + 1));
  else if (/\[[xX]\]/.test(marker)) nextMarker = marker.replace(/\[[xX]\]/, "[ ]");
  const insert = "\n" + indent + nextMarker;
  return { from: pos, to: pos, insert, selStart: pos + insert.length, selEnd: pos + insert.length };
}
