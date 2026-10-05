/* Общее окружение тестов: настоящие модули приложения, подключённые как есть.

   Раньше окружение вырезало функции из исходника текстом и исполняло склейку через new Function:
   пока всё жило в одном файле, иначе было нельзя. Теперь модели лежат в своих модулях без
   разметки, и Node (22.12+) подключает ES-модули обычным require — тест проверяет ровно тот код,
   что поедет в браузер, без заглушек и без копий констант.

   Отсюда правило: модель (.js) не импортирует разметку (.jsx). Нарушишь — Node не сможет загрузить
   модуль, и тесты упадут на первой же строке с понятной ошибкой. */
const path = require("path");
const { pool, mainSource } = require("./cut.js");

const SRC = path.join(__dirname, "..", "src");
const load = (rel) => require(path.join(SRC, rel));

const MODULES = [
  "core/basics.js", "core/images.js", "core/lists.js", "core/backup.js",
  "library/constants.js", "library/collections.js",
  "notes/model.js", "notes/markdown.js",
  "quests/links.js", "people/model.js",
  "share/model.js", "misc/model.js",
];

// Все экспорты в одном объекте, как тесты привыкли. Если два модуля экспортируют одно имя, это
// почти наверняка дубликат одной и той же функции — лучше узнать сразу, чем гадать, какую взяли.
const env = {};
const owner = {};
for (const rel of MODULES) {
  const mod = load(rel);
  for (const [name, value] of Object.entries(mod)) {
    if (name === "default") continue;
    if (name in env && env[name] !== value) {
      throw new Error(`имя ${name} экспортируют и ${owner[name]}, и ${rel}`);
    }
    env[name] = value;
    owner[name] = rel;
  }
}

module.exports = env;
// Сырой текст всех исходников — для тестов, которые проверяют правила по самому коду
// (например, что сохранённая картинка всегда рисуется с точкой кадрирования).
module.exports.rawSource = pool;
module.exports.mainSource = mainSource;

let failures = 0;
module.exports.eq = function eq(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log("FAIL " + label + "\n  ждали " + e + "\n  вышло " + a); }
  else console.log("ok   " + label);
};
module.exports.done = function done() {
  console.log(failures ? `\n${failures} ТЕСТ(ОВ) УПАЛО` : "\nвсе тесты прошли");
  process.exit(failures ? 1 : 0);
};
