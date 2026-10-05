// Заметки: теги, дерево папок, поиск, встраивания и выгрузка в markdown/zip. Модель без
// разметки — разбор самого markdown и панель инструментов живут отдельно, в разделе MARKDOWN.

import { clamp } from "../core/basics.js";
import { LIBRARY_KINDS } from "../library/constants.js";

// Заметки живут в state как обычные поля (notes/noteFolders), поэтому им бесплатно достаются
// commit/undo, normalizeState и полная выгрузка. А вот СОХРАНЯЮТСЯ они отдельным ключом
// localStorage (NOTES_STORAGE_KEY) — см. App: набор текста не должен каждые несколько секунд
// пересериализовывать финансы, спорт и календарь, а отметка подхода в тренировке не должна
// переписывать мегабайт текста. Разделено только физическое хранение, модель по-прежнему одна.

// Теги — часть текста, как в Obsidian, а не отдельное поле рядом с ним. Второе поле означало бы
// два источника правды и вечный вопрос «почему в тексте #работа есть, а в списке тегов нет».
// Косая черта разрешена ради иерархических тегов (#работа/отчёты).
const NOTE_TAG_CLASS = "A-Za-zА-Яа-яЁё0-9_/-";
export const NOTE_TAG_INLINE_RE = new RegExp(`^#([${NOTE_TAG_CLASS}]+)`);
const NOTE_TAG_SCAN_RE = new RegExp(`(^|[\\s(\\[])#([${NOTE_TAG_CLASS}]+)`, "g");
export const NOTE_MAX_TITLE = 200;

export function defaultNotesPrefs() {
  return { expanded: [], lastNoteId: null, preview: false, sort: "updated", paneWidth: 300, toolbar: true, pickerCollapsed: [] };
}

// Чисто цифровой "тег" — это почти всегда номер (#1, #2024), а не тег. Пропускать его значило бы
// засорять облако тегов мусором, который никто никогда не выберет фильтром.
export function extractTags(body) {
  if (!body) return [];
  const out = [];
  NOTE_TAG_SCAN_RE.lastIndex = 0;
  let m;
  while ((m = NOTE_TAG_SCAN_RE.exec(body))) {
    const tag = m[2];
    if (/^\d+$/.test(tag)) continue;
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}
// Все теги сохранения с частотой — облако тегов и автодополнение строятся из этого.
export function allNoteTags(notes) {
  const counts = new Map();
  (notes || []).forEach(n => extractTags(n.body).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ru"));
}
export function noteHasAllTags(note, tags) {
  if (!tags || !tags.length) return true;
  const own = extractTags(note.body).map(t => t.toLowerCase());
  // Иерархический тег засчитывается родителю: фильтр по #работа находит и #работа/отчёты.
  return tags.every(t => {
    const needle = t.toLowerCase();
    return own.some(o => o === needle || o.startsWith(needle + "/"));
  });
}

export function noteTitleOf(note) {
  if (note && note.title && note.title.trim()) return note.title.trim();
  // Заголовка нет — берём первую содержательную строку тела, как это делает Obsidian в списке.
  const first = ((note && note.body) || "").split("\n").map(l => l.replace(/^#{1,6}\s+/, "").trim()).find(Boolean);
  return first ? first.slice(0, 80) : "Без названия";
}

/* --- Дерево папок --- */

export function childFolders(folders, parentId) {
  const pid = parentId || null;
  return (folders || [])
    .filter(f => (f.parentId || null) === pid)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name), "ru"));
}
export function notesInFolder(notes, folderId) {
  const fid = folderId || null;
  return (notes || []).filter(n => (n.folderId || null) === fid);
}
export function folderById(folders, id) { return (folders || []).find(f => f.id === id) || null; }

// Путь от корня до папки. Счётчик витков — страховка от испорченного руками бэкапа с циклом:
// без неё один битый parentId вешает приложение наглухо, а не портит одну хлебную крошку.
export function folderPathOf(folders, folderId) {
  const path = [];
  let cur = folderById(folders, folderId);
  let guard = 0;
  while (cur && guard++ < 64) {
    path.unshift(cur);
    cur = cur.parentId ? folderById(folders, cur.parentId) : null;
  }
  return path;
}
export function folderPathLabel(folders, folderId) {
  const path = folderPathOf(folders, folderId);
  return path.length ? path.map(f => f.name).join(" / ") : "Корень";
}
// Все id ветки, включая корень ветки. Нужен и для выгрузки, и для каскадного удаления.
export function folderBranchIds(folders, rootId) {
  const ids = [rootId];
  let i = 0;
  while (i < ids.length) {
    const cur = ids[i++];
    (folders || []).forEach(f => { if ((f.parentId || null) === cur && !ids.includes(f.id)) ids.push(f.id); });
  }
  return ids;
}
// Защита от цикла при переносе: папку нельзя положить внутрь самой себя или своего потомка.
// Без этой проверки дерево молча превращается в кольцо, и обход по нему уже не завершается.
export function canMoveFolder(folders, folderId, newParentId) {
  if (!folderId) return false;
  if ((newParentId || null) === folderId) return false;
  return !folderBranchIds(folders, folderId).includes(newParentId || null);
}
export function folderNoteCount(state, folderId, deep) {
  const ids = deep ? folderBranchIds(state.noteFolders || [], folderId) : [folderId];
  return (state.notes || []).filter(n => ids.includes(n.folderId || null)).length;
}

/* --- Поиск --- */

// Простой скоринг вместо нечёткого поиска: заголовок важнее тега, тег важнее тела. Запрос
// разбивается на слова, и подходят только заметки, где нашлись ВСЕ слова — иначе на длинном
// запросе выдача превращается в весь список, отсортированный по случайности.
function noteSearchScore(note, folderPath, terms) {
  const title = noteTitleOf(note).toLowerCase();
  const body = (note.body || "").toLowerCase();
  const tags = extractTags(note.body).join(" ").toLowerCase();
  const path = folderPath.toLowerCase();
  let score = 0;
  for (const term of terms) {
    let hit = 0;
    if (title.includes(term)) hit += title.startsWith(term) ? 12 : 8;
    if (tags.includes(term)) hit += 5;
    if (path.includes(term)) hit += 2;
    if (body.includes(term)) hit += 1;
    if (!hit) return 0;
    score += hit;
  }
  return score;
}
function noteSnippet(note, terms, len = 140) {
  const body = note.body || "";
  if (!body) return "";
  const lower = body.toLowerCase();
  let at = -1;
  for (const term of terms) { const i = lower.indexOf(term); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return body.slice(0, len).replace(/\s+/g, " ").trim();
  const from = Math.max(0, at - 40);
  return (from > 0 ? "…" : "") + body.slice(from, from + len).replace(/\s+/g, " ").trim() + (from + len < body.length ? "…" : "");
}
export function searchNotes(state, query, activeTags) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const folders = state.noteFolders || [];
  const notes = (state.notes || []).filter(n => noteHasAllTags(n, activeTags));
  if (!terms.length) return { notes: notes.map(note => ({ note, score: 0, snippet: "" })), folders: [] };
  const hits = [];
  notes.forEach(note => {
    const path = folderPathLabel(folders, note.folderId);
    const score = noteSearchScore(note, path, terms);
    if (score > 0) hits.push({ note, score, snippet: noteSnippet(note, terms) });
  });
  hits.sort((a, b) => b.score - a.score || String(b.note.updatedAt || "").localeCompare(String(a.note.updatedAt || "")));
  const folderHits = folders.filter(f => terms.every(t => folderPathLabel(folders, f.id).toLowerCase().includes(t)));
  return { notes: hits, folders: folderHits };
}
export function sortNotesList(list, sortKey) {
  const arr = [...list];
  if (sortKey === "title") arr.sort((a, b) => noteTitleOf(a).localeCompare(noteTitleOf(b), "ru"));
  else if (sortKey === "created") arr.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  else arr.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  // Закреплённые всегда сверху — сортировка внутри групп сохраняется.
  return [...arr.filter(n => n.pinned), ...arr.filter(n => !n.pinned)];
}

/* --- Выгрузка: .md на заметку, .zip на ветку --- */

// Имена файлов и папок чистятся от того, что запрещено в файловых системах. Точки в начале тоже
// убираем: скрытый файл в архиве выглядит как потерянный.
export function safeFileSegment(name) {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 80) || "Без названия";
}
function uniqueName(used, base, ext) {
  let name = base + ext;
  let i = 2;
  while (used.has(name.toLowerCase())) { name = `${base} (${i++})${ext}`; }
  used.add(name.toLowerCase());
  return name;
}
// Файл заметки — чистый markdown без служебной обёртки: имя файла и есть заголовок, ровно как в
// хранилище Obsidian. Такой архив можно распаковать прямо в чужое хранилище и он там заработает.
export function buildNoteMarkdown(note) { return note.body || ""; }

export function buildBranchFiles(state, rootFolderId) {
  const folders = state.noteFolders || [];
  const files = [];
  function walk(folderId, prefix) {
    const used = new Set();
    sortNotesList(notesInFolder(state.notes, folderId), "title").forEach(note => {
      const name = uniqueName(used, safeFileSegment(noteTitleOf(note)), ".md");
      files.push({ path: prefix + name, text: buildNoteMarkdown(note) });
    });
    const usedDirs = new Set();
    childFolders(folders, folderId).forEach(f => {
      const dir = uniqueName(usedDirs, safeFileSegment(f.name), "");
      walk(f.id, prefix + dir + "/");
    });
  }
  const root = rootFolderId ? folderById(folders, rootFolderId) : null;
  walk(rootFolderId || null, root ? safeFileSegment(root.name) + "/" : "");
  return files;
}

/* --- Встраивание объектов приложения ---
   Синтаксис взят от Obsidian: [[Имя]] — ссылка, ![[тип:Имя]] — встраивание. Ссылка на объект идёт
   по ИМЕНИ, а не по id: имя можно набрать и прочитать, id — нет. Плата за это — встраивание
   ломается при переименовании объекта; поэтому ищем сначала по имени, потом по id (так работают
   вставки из списка, они кладут имя, но старые записи с id продолжают жить), а вместо пустоты
   всегда показываем заметный placeholder. Молча исчезнувший виджет — худший исход. */
export const EMBED_ALIASES = {
  "человек": "person",  "person": "person",
  "сфера": "sphere",    "sphere": "sphere",
  "книга": "book",      "book": "book",
  "игра": "game",       "game": "game",
  "фильм": "movie",     "movie": "movie",     "сериал": "movie",     "series": "movie",
  "библиотека": "library", "library": "library",
};
// Потолок на заметку: пара десятков карточек — это уже не заметка, а раздел, и каждая из них
// перерисовывается вместе с текстом.
export const EMBED_MAX_PER_NOTE = 30;

// Набор полей живёт В ТЕКСТЕ заметки, после вертикальной черты: ![[человек:Аня|отношения,др]].
// Не в настройках, потому что настройка одна на всё приложение, а смысл виджета у каждой заметки
// свой — в дневнике встреч нужен день рождения, в рабочей заметке он только мешает. Заодно набор
// полей уезжает вместе с текстом в .md-выгрузку и возвращается из неё.
export const EMBED_FIELDS = {
  person: [
    { key: "отношения", label: "Тип отношений" },
    { key: "уровень",   label: "Уровень и XP" },
    { key: "прогресс",  label: "Полоса прогресса" },
    { key: "др",        label: "День рождения" },
    { key: "квесты",    label: "Число квестов" },
    { key: "привычки",  label: "Число привычек" },
    { key: "долг",      label: "Баланс долга" },
    { key: "заметка",   label: "Заметка о человеке" },
  ],
  sphere: [
    { key: "уровень",  label: "Уровень и XP" },
    { key: "прогресс", label: "Полоса прогресса" },
    { key: "квесты",   label: "Число квестов" },
    { key: "привычки", label: "Число привычек" },
  ],
  library: [
    { key: "оригинал", label: "Настоящее название" },
    { key: "статус",   label: "Статус" },
    { key: "оценка",   label: "Оценка" },
    { key: "прогресс", label: "Прогресс" },
    { key: "сфера",    label: "Связанная сфера" },
    { key: "заметка",  label: "Последняя заметка" },
  ],
};
export const EMBED_DEFAULT_FIELDS = {
  person: ["отношения", "уровень", "прогресс"],
  sphere: ["уровень", "прогресс", "квесты", "привычки"],
  library: ["статус", "оценка", "прогресс"],
};
// Незнакомые ключи отбрасываются молча: заметка, написанная в будущей версии с новым полем,
// должна открываться в старой без поломки, а не рисовать пустое место.
export function embedFieldsOf(kind, fields) {
  const known = (EMBED_FIELDS[kind] || []).map(f => f.key);
  if (!fields) return EMBED_DEFAULT_FIELDS[kind] || [];
  return fields.filter(f => known.includes(f));
}

export function parseEmbedRef(raw) {
  const src = String(raw || "").trim();
  // Черта отделяет список полей. Разбираем её ПЕРВОЙ: двоеточие может встретиться и в названии
  // ("Дюна: часть вторая"), а вот черта в именах объектов не встречается.
  const bar = src.indexOf("|");
  const head = (bar < 0 ? src : src.slice(0, bar)).trim();
  // Разница между «черты нет» и «черта есть, список пуст» существенна: первое означает набор по
  // умолчанию, второе — осознанно голую карточку с одним названием.
  const fields = bar < 0 ? null : src.slice(bar + 1).split(",").map(f => f.trim().toLowerCase()).filter(Boolean);
  const i = head.indexOf(":");
  if (i < 0) return null;
  const alias = head.slice(0, i).trim().toLowerCase();
  const kind = EMBED_ALIASES[alias];
  const ref = head.slice(i + 1).trim();
  if (!kind || !ref) return null;
  // Псевдоним возвращаем ровно таким, каким его написали: при перенастройке полей строка
  // переписывается, и подменять "библиотека" на "книга" (или русское на латинское) — значит
  // молча править чужой текст.
  return { kind, ref, fields, alias };
}
// У записей библиотеки два названия: настоящее (title, подтягивается из источников) и
// отображаемое (displayTitle, задаётся руками). Ссылаться можно на любое — человек пишет то,
// которое видит, а видит он как раз отображаемое.
function findByNameOrId(list, ref, nameKeys) {
  const needle = String(ref || "").trim().toLowerCase();
  if (!needle) return null;
  const keys = Array.isArray(nameKeys) ? nameKeys : [nameKeys];
  const matches = (x) => keys.some(k => String(x[k] || "").trim().toLowerCase() === needle);
  return (list || []).find(matches) || (list || []).find(x => x.id === ref) || null;
}
export function resolveEmbed(state, raw) {
  const parsed = parseEmbedRef(raw);
  if (!parsed || !state) return null;
  const { kind, ref, fields, alias } = parsed;
  if (kind === "person") {
    const item = findByNameOrId(state.people, ref, "name");
    return item ? { kind: "person", item, alias, fields, ref } : null;
  }
  if (kind === "sphere") {
    const item = findByNameOrId(state.spheres, ref, "name");
    return item ? { kind: "sphere", item, alias, fields, ref } : null;
  }
  // "библиотека" ищет по всем трём спискам — удобно, когда не помнишь, книга это или фильм.
  const libKinds = kind === "library" ? ["book", "game", "movie"] : [kind];
  for (const k of libKinds) {
    const meta = LIBRARY_KINDS[k];
    if (!meta) continue;
    const item = findByNameOrId(state[meta.stateKey], ref, ["displayTitle", "title"]);
    if (item) return { kind: "library", libKind: k, item, alias, fields, ref };
  }
  return null;
}
// Разделы ждут фокус по-разному: людям и сферам достаточно id, а Библиотека — это три списка в
// одной вкладке, и без вида записи она откроет тот список, который был открыт прошлый раз, а не
// тот, где лежит нужная запись. Держим это знание в одном месте, чтобы следующий вид виджета не
// повторил ту же ошибку.
export function embedNavTarget(found) {
  if (found.kind === "person") return { tab: "people", focus: found.item.id };
  if (found.kind === "sphere") return { tab: "spheres", focus: found.item.id };
  return { tab: "library", focus: { kind: found.libKind, id: found.item.id } };
}

// Строка списка вставки ищется по обеим подписям: у записей библиотеки их две (отображаемая и
// настоящая), и заранее не угадать, какую человек помнит.
export function pickerItemMatches(item, needle) {
  const n = String(needle || "").trim().toLowerCase();
  if (!n) return true;
  return [item.name, item.alt].some(v => String(v || "").toLowerCase().includes(n));
}

export function embedSyntax(alias, name, fields) {
  return `![[${alias}:${name}${fields ? "|" + fields.join(",") : ""}]]`;
}
// Замена одной строки исходника — тем же приёмом, что и переключение чекбокса в просмотре:
// правится ровно та строка, остальной текст не пересобирается.
export function replaceEmbedLine(text, lineIndex, snippet) {
  const lines = String(text || "").split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) return text;
  lines[lineIndex] = snippet;
  return lines.join("\n");
}


// Вставка встраивания всегда встаёт отдельной строкой: посреди абзаца ![[...]] распознаётся как
// строчная плашка, а карточкой становится только на собственной строке.
export function insertEmbedEdit(text, pos, snippet) {
  const src = String(text || "");
  const at = clamp(pos, 0, src.length);
  const before = src.slice(0, at);
  const after = src.slice(at);
  const lead = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
  const tail = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
  const insert = lead + snippet + tail;
  const caret = at + lead.length + snippet.length;
  return { from: at, to: at, insert, selStart: caret, selEnd: caret };
}

/* --- ZIP (без сжатия) ---
   Ветка выгружается настоящим архивом с настоящими папками, а не одним склеенным файлом: только
   так её можно распаковать в хранилище Obsidian и получить ту же структуру. Готовой библиотеки
   здесь нет и быть не может (файл один, зависимости не тянем), поэтому пишем формат руками.
   Метод хранения — 0 (stored, без сжатия): текст и так невелик, а deflate потребовал бы
   собственной реализации сжатия, где ошибиться куда легче, чем в заголовках. */
export function utf8Bytes(str) { return new TextEncoder().encode(str); }

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
export function zipStore(files) {
  const enc = files.map(f => {
    const nameBytes = utf8Bytes(f.path);
    const dataBytes = utf8Bytes(f.text || "");
    return { nameBytes, dataBytes, crc: crc32(dataBytes) };
  });
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const localSize = enc.reduce((a, e) => a + 30 + e.nameBytes.length + e.dataBytes.length, 0);
  const centralSize = enc.reduce((a, e) => a + 46 + e.nameBytes.length, 0);
  const buf = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(buf.buffer);
  let off = 0;
  const offsets = [];
  // Флаг 0x0800 объявляет имена файлов в UTF-8 — без него кириллические названия папок и заметок
  // распаковываются кракозябрами на любой системе, где кодировка по умолчанию не UTF-8.
  const FLAGS = 0x0800;
  enc.forEach(e => {
    offsets.push(off);
    view.setUint32(off, 0x04034b50, true);
    view.setUint16(off + 4, 20, true);
    view.setUint16(off + 6, FLAGS, true);
    view.setUint16(off + 8, 0, true);
    view.setUint16(off + 10, dosTime, true);
    view.setUint16(off + 12, dosDate, true);
    view.setUint32(off + 14, e.crc, true);
    view.setUint32(off + 18, e.dataBytes.length, true);
    view.setUint32(off + 22, e.dataBytes.length, true);
    view.setUint16(off + 26, e.nameBytes.length, true);
    view.setUint16(off + 28, 0, true);
    off += 30;
    buf.set(e.nameBytes, off); off += e.nameBytes.length;
    buf.set(e.dataBytes, off); off += e.dataBytes.length;
  });
  const centralStart = off;
  enc.forEach((e, i) => {
    view.setUint32(off, 0x02014b50, true);
    view.setUint16(off + 4, 20, true);
    view.setUint16(off + 6, 20, true);
    view.setUint16(off + 8, FLAGS, true);
    view.setUint16(off + 10, 0, true);
    view.setUint16(off + 12, dosTime, true);
    view.setUint16(off + 14, dosDate, true);
    view.setUint32(off + 16, e.crc, true);
    view.setUint32(off + 20, e.dataBytes.length, true);
    view.setUint32(off + 24, e.dataBytes.length, true);
    view.setUint16(off + 28, e.nameBytes.length, true);
    view.setUint16(off + 30, 0, true);
    view.setUint16(off + 32, 0, true);
    view.setUint16(off + 34, 0, true);
    view.setUint16(off + 36, 0, true);
    view.setUint32(off + 38, 0, true);
    view.setUint32(off + 42, offsets[i], true);
    off += 46;
    buf.set(e.nameBytes, off); off += e.nameBytes.length;
  });
  view.setUint32(off, 0x06054b50, true);
  view.setUint16(off + 4, 0, true);
  view.setUint16(off + 6, 0, true);
  view.setUint16(off + 8, enc.length, true);
  view.setUint16(off + 10, enc.length, true);
  view.setUint32(off + 12, off - centralStart, true);
  view.setUint32(off + 16, centralStart, true);
  view.setUint16(off + 20, 0, true);
  return buf;
}
export function downloadBinaryFile(bytes, filename, mime) {
  try {
    const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) { return false; }
}
