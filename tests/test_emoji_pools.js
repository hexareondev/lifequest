/* Категории смайликов задаются в трёх местах: подписи для настроек, назначения по умолчанию и
   сами пулы. Разъезд между ними тихий — новая категория просто не появляется в настройках, а
   форма молча показывает пустой список. Здесь это ловится. */
const E = require("./notes_env.js");
const { eq, done } = E;
const src = E.rawSource;

function objectKeys(declaration) {
  const m = src.match(new RegExp(declaration + "\\s*=\\s*\\{([^}]*)\\}"));
  if (!m) throw new Error("не найдено объявление: " + declaration);
  return [...m[1].matchAll(/([A-Za-zА-Яа-я_][\w]*)\s*:/g)].map(x => x[1]);
}
function pairsInFunction(name) {
  const a = src.indexOf("function " + name + "()");
  if (a < 0) throw new Error("не найдена функция: " + name);
  const body = src.slice(a, src.indexOf("\n}\n", a));
  return [...body.matchAll(/([A-Za-zА-Яа-я_][\w]*)\s*:\s*"([^"]*)"/g)].map(x => [x[1], x[2]]);
}

const labels = objectKeys("const EMOJI_CATEGORY_LABELS");
const assignments = pairsInFunction("defaultEmojiAssignments");
// Пулы объявлены многострочно, ключи берём построчно из тела функции.
const poolBody = src.slice(src.indexOf("function defaultEmojiPools()"), src.indexOf("function defaultEmojiAssignments()"));
const poolIds = [...poolBody.matchAll(/^\s{4}([a-z]+):\s*\{/gm)].map(x => x[1]);

eq("пулы объявлены", poolIds.length > 0, true);
eq("категории объявлены", labels.length > 0, true);
eq("назначения объявлены", assignments.length > 0, true);

eq("«Серии» есть среди категорий", labels.includes("collection"), true);
eq("и у них есть назначение по умолчанию", assignments.some(([k]) => k === "collection"), true);

const assignedKeys = assignments.map(([k]) => k);
eq("у каждой подписанной категории есть назначение",
  labels.filter(l => !assignedKeys.includes(l)), []);
eq("у каждого назначения есть подпись для настроек",
  assignedKeys.filter(k => !labels.includes(k)), []);
eq("все назначения указывают на существующий пул",
  assignments.filter(([, pool]) => !poolIds.includes(pool)).map(([k]) => k), []);

/* Форма коллекции должна брать пул через назначения, а не по выдуманному ключу — ровно та
   ошибка, из-за которой список смайликов у серий оказывался пустым. */
eq("форма коллекции не обращается к несуществующему пулу напрямую",
  /emojiPools\s*&&\s*emojiPools\.library/.test(src), false);
eq("форма коллекции разрешает пул через назначения",
  /assignments\.collection\s*\|\|\s*Object\.keys\(pools\)\[0\]/.test(src), true);

done();
