/* Вырезка объявлений из исходников — общая для всех тестов.

   Тесты берут код из src/, а не копируют его, иначе проверка молча разойдётся с приложением.
   После разделения на модули «исходник» — это уже не один файл: имя может лежать в
   src/library или src/core, поэтому поиск идёт по всему дереву src/. Раньше эту вырезку каждый
   тест держал у себя, и переезд одной константы ломал их поимённо. */
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src");

// Переводы строк приводятся к одному виду: на Windows файл хранится с CRLF, а вырезка ищет
// границы по "\n" — с \r\n она не находит конец и падает на ровном месте.
function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}
function collectSources(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSources(full));
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const MAIN = path.join(SRC_DIR, "questlife-app.jsx");
const mainSource = read(MAIN);

// Слово export снимается сразу: вырезанный текст исполняется внутри new Function, а там
// объявление с export — синтаксическая ошибка.
function stripExport(text) {
  return text.replace(/^export\s+(?=(?:const|let|var|function|class|async)\b)/gm, "");
}

// Файлы храним по отдельности, а не одной простынёй: вырезка не должна уметь перешагнуть границу
// файла. Склеенная простынёй, она при потерянном конце объявления молча утаскивала хвост
// соседнего файла — и тест падал с «имя уже объявлено» где-то совсем в другом месте.
const files = [MAIN, ...collectSources(SRC_DIR).filter(f => f !== MAIN)]
  .map(file => ({ file, text: stripExport(read(file)) }));
const pool = files.map(f => f.text).join("\n\n");

/* Конец объявления ищется по закрывающей скобке в нулевой колонке ("\n}" у функции, "\n};" или
   "\n];" у объекта и массива): всё верхнеуровневое в этом коде закрывается именно так, а
   разбирать тело по-настоящему нельзя — внутри разметки лежат регулярки с кавычками и обратными
   апострофами, на которых любой упрощённый лексер расходится.

   Однострочное объявление берётся своей строкой. Без этого вырезка искала закрывающую скобку
   дальше по файлу и утаскивала с собой соседа целиком: с функциями это сходило с рук (повторное
   объявление function в JS молчит), а первый же прихваченный const валил разбор. */
function cutDecl(name) {
  const re = new RegExp("^(?:async\\s+)?(const|let|var|function|class)\\s+" + name + "\\b", "m");
  const found = files.map(f => ({ ...f, m: re.exec(f.text) })).find(f => f.m);
  if (!found) throw new Error("не найдено объявление " + name + " ни в одном файле src/");

  const { text, file, m } = found;
  const kind = m[1];
  const start = m.index;
  const where = path.relative(SRC_DIR, file);

  const lineEnd = text.indexOf("\n", start);
  const firstLine = text.slice(start, lineEnd < 0 ? text.length : lineEnd);
  const balanced = (firstLine.match(/{/g) || []).length === (firstLine.match(/}/g) || []).length;

  let cut;
  if (kind === "function" || kind === "class") {
    if (balanced && firstLine.trimEnd().endsWith("}")) cut = firstLine;
    else {
      const end = text.indexOf("\n}\n", start);
      if (end < 0) throw new Error(`не найден конец функции ${name} в ${where}`);
      cut = text.slice(start, end + 3);
    }
  } else if (firstLine.trimEnd().endsWith(";")) {
    cut = firstLine;
  } else {
    const ends = ["\n};", "\n];"].map(mark => text.indexOf(mark, start)).filter(i => i >= 0);
    if (!ends.length) throw new Error(`не найден конец константы ${name} в ${where}`);
    cut = text.slice(start, Math.min(...ends) + 3);
  }

  // Страховка: вырезка обязана содержать ровно одно объявление в нулевой колонке. Если их больше,
  // конец потерялся и мы утащили соседа — молча это даёт «имя уже объявлено» при сборке теста.
  const heads = cut.split("\n").filter(line =>
    /^(?:async\s+)?(?:const|let|var|function|class)\s+[A-Za-z_$]/.test(line));
  if (heads.length > 1) {
    throw new Error(`вырезка ${name} из ${where} захватила соседей: ` +
      heads.slice(1).map(h => h.trim().slice(0, 40)).join(", "));
  }
  return cut;
}

/* Целый модуль как исходник для теста. Когда раздел переезжает в свой файл, резать его по
   шапкам больше нечего и незачем: берём файл целиком, снимая строки импорта и слово export.
   Внутренние имена модуля при этом остаются видны тесту, как раньше были видны имена секции. */
function moduleBody(rel, mustDeclare) {
  const out = [];
  let tail = false;   // многострочный импорт продолжается
  for (const line of stripExport(read(path.join(SRC_DIR, rel))).split("\n")) {
    if (tail) { if (/;\s*$/.test(line)) tail = false; continue; }
    if (/^import\b/.test(line)) { if (!/;\s*$/.test(line)) tail = true; continue; }
    if (/^export\s*\{[^}]*\}\s*;?\s*$/.test(line)) continue;
    out.push(line);
  }
  const body = out.join("\n");
  // Проверка, что в файле лежит то, что мы думаем. Два модуля называются model.js, и подменённый
  // файл иначе просто уезжает в сборку вторым экземпляром чужой модели.
  if (mustDeclare && !new RegExp("^(?:async\\s+)?(?:const|let|var|function|class)\\s+" + mustDeclare + "\\b", "m").test(body)) {
    throw new Error(`в ${rel} нет объявления ${mustDeclare} — в файле лежит не то, что ожидалось`);
  }
  return body;
}

// Крупный кусок между шапками разделов. Шапки живут в главном файле, поэтому и ищем в нём.
function sliceBetween(startMark, endMark) {
  const a = mainSource.indexOf(startMark);
  if (a < 0) throw new Error("не найдено начало: " + startMark);
  const b = mainSource.indexOf(endMark, a + startMark.length);
  if (b < 0) throw new Error("не найден конец: " + endMark);
  return mainSource.slice(a + startMark.length, b);
}

module.exports = { cutDecl, moduleBody, sliceBetween, pool, mainSource, read };
