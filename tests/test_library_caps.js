/* Тест капания прогресса библиотеки по объявленному максимуму.
   Функции вырезаются из исходника, а не копируются — иначе тест разойдётся с кодом.
   Вырезка общая (cut.js): она сама знает, в каком файле src/ лежит имя. */
const { cutDecl } = require("./cut.js");

const code = `
  function clamp(v,min,max) { return Math.max(min, Math.min(max,v)); }
  ${cutDecl("LIBRARY_PROGRESS_CAPS")}
  ${cutDecl("clampLibraryProgress")}
  return { clampLibraryProgress };
`;
const { clampLibraryProgress } = new Function(code)();

let failed = 0;
function eq(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log("FAIL " + label + "\n  ждали " + e + "\n  вышло " + a); }
  else console.log("ok   " + label);
}

/* ---------- Книги ---------- */
const book = { id:"b", pagesRead:180, pagesTotal:412 };

eq("страницы в пределах максимума не трогаются",
  clampLibraryProgress("book", book, { pagesRead: 300 }), { pagesRead: 300 });

eq("страницы выше максимума прижимаются к нему",
  clampLibraryProgress("book", book, { pagesRead: 999 }), { pagesRead: 412 });

eq("ровно максимум проходит",
  clampLibraryProgress("book", book, { pagesRead: 412 }), { pagesRead: 412 });

eq("минус приводится к нулю",
  clampLibraryProgress("book", book, { pagesRead: -5 }), { pagesRead: 0 });

eq("максимум не задан — капать не по чему, но минус всё равно ловим",
  clampLibraryProgress("book", { pagesRead:10, pagesTotal:0 }, { pagesRead: 5000 }), { pagesRead: 5000 });

eq("QuickAdd +10 у почти дочитанной книги упирается в максимум",
  clampLibraryProgress("book", { pagesRead:408, pagesTotal:412 }, { pagesRead: 418 }), { pagesRead: 412 });

/* Поля, которых нет в патче, из него появляться не должны */
eq("патч не про прогресс проходит нетронутым",
  clampLibraryProgress("book", book, { status:"done" }), { status:"done" });

eq("правка максимума вверх сама по себе прогресс не двигает",
  clampLibraryProgress("book", book, { pagesTotal: 500 }), { pagesTotal: 500 });

/* ---------- Уменьшение максимума тянет прогресс за собой ---------- */
eq("максимум опустили ниже прочитанного — прогресс едет следом",
  clampLibraryProgress("book", book, { pagesTotal: 100 }), { pagesTotal: 100, pagesRead: 100 });

eq("форма прислала оба поля разом — капаем по НОВОМУ максимуму, не по старому",
  clampLibraryProgress("book", book, { pagesRead: 300, pagesTotal: 200 }), { pagesRead: 200, pagesTotal: 200 });

eq("максимум сняли совсем (0 = «?») — прогресс остаётся как был",
  clampLibraryProgress("book", book, { pagesTotal: 0 }), { pagesTotal: 0 });

/* ---------- Игры: ачивки капаются, часы нет ---------- */
const game = { id:"g", hours:38, achievementsGot:32, achievementsTotal:49 };

eq("ачивки выше максимума прижимаются",
  clampLibraryProgress("game", game, { achievementsGot: 60 }), { achievementsGot: 49 });

eq("часы потолка не имеют и не трогаются",
  clampLibraryProgress("game", game, { hours: 9999 }), { hours: 9999 });

eq("уменьшили общее число ачивок — полученные едут следом",
  clampLibraryProgress("game", game, { achievementsTotal: 10 }), { achievementsTotal: 10, achievementsGot: 10 });

/* ---------- Сериалы ---------- */
const series = { id:"m", kind:"series", episodeAt:8, episodesTotal:10 };

eq("серии выше максимума прижимаются",
  clampLibraryProgress("movie", series, { episodeAt: 25 }), { episodeAt: 10 });

eq("переключение сериала в фильм обнуляет и то, и другое без сюрпризов",
  clampLibraryProgress("movie", series, { kind:"movie", episodesTotal: 0, episodeAt: 0 }),
  { kind:"movie", episodesTotal: 0, episodeAt: 0 });

/* ---------- Регресс: старое поведение книг сохранилось ---------- */
function oldBookClamp(item, patch) {
  let patchedPagesRead = patch.pagesRead;
  if (item && Object.prototype.hasOwnProperty.call(patch, "pagesRead") && item.pagesTotal > 0) {
    patchedPagesRead = Math.min(Number(patch.pagesRead) || 0, item.pagesTotal);
  }
  return Object.prototype.hasOwnProperty.call(patch, "pagesRead") ? { ...patch, pagesRead: patchedPagesRead } : patch;
}
const regress = [
  [{ pagesRead: 300 }], [{ pagesRead: 999 }], [{ pagesRead: 412 }],
  [{ pagesRead: 0 }], [{ status:"active" }], [{ pagesRead: 1, rating: 4 }],
];
let regressOk = true;
regress.forEach(([patch]) => {
  const a = JSON.stringify(clampLibraryProgress("book", book, patch));
  const b = JSON.stringify(oldBookClamp(book, patch));
  if (a !== b) { regressOk = false; console.log("  расхождение на " + JSON.stringify(patch) + ": было " + b + ", стало " + a); }
});
eq("на прежних сценариях книг новая функция совпадает со старой", regressOk, true);

/* Старая версия действительно НЕ ловила игры и сериалы — подтверждаем, что баг был реальным */
eq("старая версия ачивки не капала (баг существовал)",
  oldBookClamp(game, { achievementsGot: 60 }), { achievementsGot: 60 });

/* ---------- Идемпотентность ---------- */
const once = clampLibraryProgress("book", book, { pagesRead: 999 });
const twice = clampLibraryProgress("book", { ...book, ...once }, once);
eq("повторный прогон по уже прикапанному ничего не меняет", twice, once);

console.log(failed ? `\n${failed} ТЕСТ(ОВ) УПАЛО` : "\nвсе тесты прошли");
process.exit(failed ? 1 : 0);
