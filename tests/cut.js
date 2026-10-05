/* Сырой текст исходников — для тестов, которые проверяют правила по самому коду, а не по
   поведению: «сохранённая картинка всегда рисуется с точкой кадрирования», «урезанных списков
   статусов в коде не осталось».

   Сами функции тесты берут из модулей (notes_env.js). Раньше здесь же жила вырезка объявлений по
   тексту — она была нужна, пока приложение было одним файлом, и больше не нужна. */
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src");

// Переводы строк приводятся к одному виду: на Windows файл хранится с CRLF.
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
// Главный файл первым, дальше модули по алфавиту — порядок стабилен между запусками.
const pool = [MAIN, ...collectSources(SRC_DIR).filter(f => f !== MAIN).sort()]
  .map(read)
  .join("\n\n");

module.exports = { pool, mainSource, read };
