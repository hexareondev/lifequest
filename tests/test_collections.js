const E = require("./notes_env.js");
const { eq, done } = E;

/* «Ведьмак»: книги основной саги, игры отдельной веткой, ответвление — третьей.
   Записи намеренно разложены по трём разным спискам состояния: ради этого коллекции и лежат на
   верхнем уровне, а не внутри books/games/movies. */
const witcher = {
  id: "c1", name: "Ведьмак", coverEmoji: "🐺", order: 0,
  branches: [
    { id: "br-games", name: "Игры", order: 1 },
    { id: "br-side", name: "Ответвления", order: 0 },
  ],
};
const state = {
  libraryCollections: [witcher, { id: "c2", name: "Дюна", branches: [], order: 1 }],
  books: [
    { id: "b1", title: "Последнее желание", status: "done", collectionId: "c1", collectionOrder: 0 },
    { id: "b2", title: "Меч Предназначения", status: "done", collectionId: "c1", collectionOrder: 1 },
    { id: "b3", title: "Кровь эльфов", status: "active", collectionId: "c1", collectionOrder: 2 },
    { id: "b9", title: "Дюна", status: "want", collectionId: "c2", collectionOrder: 0 },
    { id: "b0", title: "Ничей", status: "want" },
  ],
  games: [
    { id: "g1", title: "Ведьмак", status: "done", collectionId: "c1", branchId: "br-games", collectionOrder: 0 },
    { id: "g2", title: "Ведьмак 3", status: "active", collectionId: "c1", branchId: "br-games", collectionOrder: 1 },
  ],
  movies: [
    { id: "m1", title: "Сезон Гроз", kind: "series", status: "want", collectionId: "c1", branchId: "br-side", collectionOrder: 0 },
  ],
};

/* --- Сбор записей --- */
eq("записи собираются из всех трёх списков",
  E.collectionRefs(state, "c1").map(r => r.item.id).sort(), ["b1", "b2", "b3", "g1", "g2", "m1"]);
eq("вид записи едет вместе с ней",
  E.collectionRefs(state, "c1").find(r => r.item.id === "g1").libKind, "game");
eq("чужая коллекция не подмешивается", E.collectionRefs(state, "c2").map(r => r.item.id), ["b9"]);
eq("запись без коллекции нигде не всплывает",
  E.collectionRefs(state, "c1").some(r => r.item.id === "b0"), false);
eq("без коллекции — пустой список", E.collectionRefs(state, null), []);
eq("несуществующая коллекция — пустой список", E.collectionRefs(state, "нет"), []);

/* --- Ветки --- */
eq("ветки идут по своему порядку, а не по порядку в массиве",
  E.collectionBranches(witcher).map(b => b.id), ["br-side", "br-games"]);
eq("запись без ветки — в основной линии", E.refBranchId(state.books[0], witcher), "__main__");
eq("запись со своей веткой", E.refBranchId(state.games[0], witcher), "br-games");
eq("ветку удалили, а запись помнит — показываем в основной линии, а не теряем",
  E.refBranchId({ branchId: "br-deleted" }, witcher), "__main__");

/* --- Прогресс --- */
eq("прогресс считает пройденные по всей коллекции", E.collectionProgress(state, "c1"), { done: 3, total: 6 });
eq("пустая коллекция не делит на ноль", E.collectionProgress(state, "нет"), { done: 0, total: 0 });

/* --- Коллекция записи --- */
eq("коллекция находится по записи", E.itemCollection(state, state.books[0]).id, "c1");
eq("запись без коллекции", E.itemCollection(state, state.books[4]), null);
eq("ссылка в никуда (запись из чужого сохранения) не роняет",
  E.itemCollection(state, { collectionId: "нет-такой" }), null);

/* --- Порядок при добавлении --- */
eq("новая запись встаёт в конец основной линии",
  E.nextCollectionOrder(state, "c1", null, witcher), 3);
eq("и в конец конкретной ветки", E.nextCollectionOrder(state, "c1", "br-games", witcher), 2);
eq("после единственной записи — следующий номер",
  E.nextCollectionOrder(state, "c2", null, { id: "c2", branches: [] }), 1);
eq("неизвестная ветка пуста, значит с нуля",
  E.nextCollectionOrder(state, "c2", "нет-такой", { id: "c2", branches: [] }), 0);
eq("совсем пустая коллекция начинается с нуля",
  E.nextCollectionOrder({ ...state, books: [] }, "c2", null, { id: "c2", branches: [] }), 0);

/* --- Перестановка --- */
const refs = E.collectionRefs(state, "c1").filter(r => E.refBranchId(r.item, witcher) === "__main__");
const ids = (list) => list.map(r => r.item.id);
eq("перенос в начало", ids(E.reorderRefs(refs, "b3", "b1")), ["b3", "b1", "b2"]);
eq("перенос в середину", ids(E.reorderRefs(refs, "b1", "b3")), ["b2", "b1", "b3"]);
eq("перенос в конец (бросок мимо строк)", ids(E.reorderRefs(refs, "b1", null)), ["b2", "b3", "b1"]);
eq("бросок на себя ничего не меняет", ids(E.reorderRefs(refs, "b2", "b2")), ["b1", "b2", "b3"]);
eq("неизвестная запись не ломает список", ids(E.reorderRefs(refs, "нет", "b1")), ["b1", "b2", "b3"]);
eq("неизвестная цель отправляет в конец", ids(E.reorderRefs(refs, "b1", "нет")), ["b2", "b3", "b1"]);
eq("перестановка не мутирует исходный список", ids(refs), ["b1", "b2", "b3"]);

/* --- Перенумерация --- */
const patches = E.assignBranchOrder(E.reorderRefs(refs, "b3", "b1"));
eq("номера идут подряд с нуля", patches.map(p => p.collectionOrder), [0, 1, 2]);
eq("правка знает, в каком списке лежит запись", patches[0], { libKind: "book", id: "b3", collectionOrder: 0 });
const mixed = E.assignBranchOrder(E.collectionRefs(state, "c1"));
eq("правки на смешанной коллекции сохраняют вид каждой записи",
  mixed.filter(p => p.libKind === "game").map(p => p.id), ["g1", "g2"]);

/* ============ Ветки, привязанные к записи ============
   Сериал: два сезона в основной линии, спин-офф раскрывает события ПЕРВОГО сезона. В карточке
   второго сезона его быть не должно — в этом вся разница с параллельной веткой. */
const show = {
  id: "c3", name: "Сериал", order: 2,
  branches: [
    { id: "br-s1", name: "Вокруг первого сезона", anchorId: "s1", order: 0 },
    { id: "br-par", name: "Параллельная", anchorId: null, order: 1 },
  ],
};
const st = {
  libraryCollections: [show],
  books: [],
  games: [],
  movies: [
    { id: "s1", title: "Сезон 1", kind: "series", status: "done", collectionId: "c3", collectionOrder: 0 },
    { id: "s2", title: "Сезон 2", kind: "series", status: "active", collectionId: "c3", collectionOrder: 1 },
    { id: "sp1", title: "Спин-офф", kind: "movie", status: "want", collectionId: "c3", branchId: "br-s1", collectionOrder: 0 },
    { id: "px", title: "Параллельный", kind: "movie", status: "want", collectionId: "c3", branchId: "br-par", collectionOrder: 0 },
  ],
};

eq("привязка к существующей записи действует", E.anchorIsValid(st, show, "s1"), true);
eq("привязка в никуда не действует", E.anchorIsValid(st, show, "нет"), false);
eq("пустая привязка не действует", E.anchorIsValid(st, show, null), false);

eq("на верхнем уровне только параллельные ветки",
  E.topLevelBranches(st, show).map(b => b.id), ["br-par"]);
eq("привязанная ветка находится по своей записи",
  E.branchesAnchoredTo(st, show, "s1").map(b => b.id), ["br-s1"]);
eq("к другой записи она не относится", E.branchesAnchoredTo(st, show, "s2"), []);

/* Главное свойство: в карточке первого сезона спин-офф есть, в карточке второго — нет */

/* Дерево: привязанная ветка стоит под своей записью, параллельная — на верхнем уровне */
const tree = E.collectionTree(st, show);
eq("верхний уровень: основная линия и параллельная ветка", tree.map(n => n.id), ["__main__", "br-par"]);
eq("в основной линии два сезона", tree[0].refs.map(r => r.item.id), ["s1", "s2"]);
eq("под первым сезоном висит его ветка", tree[0].refs[0].branches.map(n => n.id), ["br-s1"]);
eq("под вторым сезоном ничего не висит", tree[0].refs[1].branches, []);
eq("вложенная ветка несёт свои записи", tree[0].refs[0].branches[0].refs.map(r => r.item.id), ["sp1"]);

/* Самопочинка: запись-якорь убрали из коллекции — ветка поднимается наверх, а не исчезает */
const orphan = { ...st, movies: st.movies.filter(m => m.id !== "s1") };
eq("ветка с осиротевшей привязкой уходит на верхний уровень",
  E.topLevelBranches(orphan, show).map(b => b.id).sort(), ["br-par", "br-s1"]);
eq("и её записи не теряются",
  E.collectionTree(orphan, show).find(n => n.id === "br-s1").refs.map(r => r.item.id), ["sp1"]);

/* ---- Защита от кольца ---- */
eq("ветку можно привязать к записи вне себя", E.canAnchorBranch(st, show, "br-s1", "s2"), true);
eq("ветку нельзя привязать к своей же записи", E.canAnchorBranch(st, show, "br-s1", "sp1"), false);
eq("привязка к несуществующей записи отклоняется", E.canAnchorBranch(st, show, "br-s1", "нет"), false);
eq("снять привязку можно всегда", E.canAnchorBranch(st, show, "br-s1", null), true);

/* Кольцо через два шага: ветка B привязана к записи внутри ветки A, привязанной к записи внутри B */
const deep = {
  id: "c4", name: "Глубокая", branches: [
    { id: "bA", name: "A", anchorId: "root", order: 0 },
    { id: "bB", name: "B", anchorId: "inA", order: 1 },
  ],
};
const stDeep = {
  libraryCollections: [deep], books: [], games: [],
  movies: [
    { id: "root", title: "Корень", collectionId: "c4", collectionOrder: 0 },
    { id: "inA", title: "В ветке A", collectionId: "c4", branchId: "bA", collectionOrder: 0 },
    { id: "inB", title: "В ветке B", collectionId: "c4", branchId: "bB", collectionOrder: 0 },
  ],
};
eq("поддерево ветки A включает вложенную B", E.branchSubtreeIds(stDeep, deep, "bA").sort(), ["bA", "bB"]);
eq("ветку A нельзя привязать к записи из вложенной B (кольцо через два шага)",
  E.canAnchorBranch(stDeep, deep, "bA", "inB"), false);
eq("а к записи вне поддерева — можно", E.canAnchorBranch(stDeep, deep, "bA", "root"), true);
eq("дерево разворачивается на всю глубину",
  E.collectionTree(stDeep, deep)[0].refs[0].branches[0].refs[0].branches[0].id, "bB");

/* Кольцо с другой стороны: перенос записи в ветку, которая к ней же привязана */
eq("запись нельзя уронить в привязанную к ней ветку",
  E.canPlaceItemInBranch(st, show, "s1", "br-s1"), false);
eq("в чужую ветку — можно", E.canPlaceItemInBranch(st, show, "s1", "br-par"), true);
eq("в основную линию — всегда можно", E.canPlaceItemInBranch(st, show, "s1", "__main__"), true);
eq("запись без своих веток кладётся куда угодно",
  E.canPlaceItemInBranch(st, show, "s2", "br-s1"), true);
eq("перенос через два шага тоже отклоняется",
  E.canPlaceItemInBranch(stDeep, deep, "root", "bB"), false);

/* Испорченное сохранение с кольцом не должно вешать отрисовку */
const looped = {
  id: "c5", name: "Кольцо", branches: [{ id: "bL", name: "L", anchorId: "x", order: 0 }],
};
const stLooped = {
  libraryCollections: [looped], books: [], games: [],
  movies: [{ id: "x", title: "X", collectionId: "c5", branchId: "bL", collectionOrder: 0 }],
};
eq("кольцевая ветка не разворачивается второй раз",
  E.collectionTree(stLooped, looped)[0].refs.length, 0);
eq("и обход поддерева завершается", E.branchSubtreeIds(stLooped, looped, "bL"), ["bL"]);

/* ============ Лента обложек в карточке ============
   Ожидаемый порядок из требования: 1, 2, 2.1, 2.2, 3, 4 — а при переходе на третью 1, 2, 3, 3.1, 4.
   Раскрыта всегда ровно одна запись. */
const saga = {
  id: "c6", name: "Сага", branches: [
    { id: "x2", name: "Вокруг второй", anchorId: "i2", order: 0 },
    { id: "x3", name: "Вокруг третьей", anchorId: "i3", order: 1 },
  ],
};
const stSaga = {
  libraryCollections: [saga], books: [], games: [],
  movies: [
    { id: "i1", title: "1", collectionId: "c6", collectionOrder: 0 },
    { id: "i2", title: "2", collectionId: "c6", collectionOrder: 1 },
    { id: "i3", title: "3", collectionId: "c6", collectionOrder: 2 },
    { id: "i4", title: "4", collectionId: "c6", collectionOrder: 3 },
    { id: "i21", title: "2.1", collectionId: "c6", branchId: "x2", collectionOrder: 0 },
    { id: "i22", title: "2.2", collectionId: "c6", branchId: "x2", collectionOrder: 1 },
    { id: "i31", title: "3.1", collectionId: "c6", branchId: "x3", collectionOrder: 0 },
  ],
};
const byId = (id) => stSaga.movies.find(m => m.id === id);
const strip = (id) => E.collectionStrip(stSaga, saga, byId(id)).map(r => r.item.title);

eq("на второй раскрыты её ответвления", strip("i2"), ["1", "2", "2.1", "2.2", "3", "4"]);
eq("на третьей раскрыта уже она", strip("i3"), ["1", "2", "3", "3.1", "4"]);
eq("на записи без ответвлений лента ровная", strip("i4"), ["1", "2", "3", "4"]);
eq("раскрыта всегда только одна запись",
  E.collectionStrip(stSaga, saga, byId("i2")).filter(r => r.nested).length, 2);

/* Открыв вложенную запись, очередь родителя остаётся на виду — иначе сериал пропадает целиком */
eq("у вложенной опорной считается родитель", strip("i21"), ["1", "2", "2.1", "2.2", "3", "4"]);
eq("и подсветить можно саму вложенную",
  E.collectionStrip(stSaga, saga, byId("i21")).some(r => r.item.id === "i21"), true);
eq("вложенные помечены как вложенные",
  E.collectionStrip(stSaga, saga, byId("i2")).filter(r => r.nested).map(r => r.item.title), ["2.1", "2.2"]);

/* Смежные ветки идут в той же очереди, следом за основной линией: открыв запись из смежной
   ветки, человек должен видеть всю коллекцию, а не только её кусок. */
eq("смежная ветка приписана в конец основной очереди",
  E.collectionStrip(st, show, st.movies[3]).map(r => r.item.id), ["s1", "s2", "px"]);
eq("и та же очередь видна с записи основной линии",
  E.collectionStrip(st, show, st.movies[1]).map(r => r.item.id), ["s1", "s2", "px"]);
eq("привязанная ветка в общую очередь не попадает — только под своей записью",
  E.collectionStrip(st, show, st.movies[1]).some(r => r.item.id === "sp1"), false);
eq("а под своей записью попадает",
  E.collectionStrip(st, show, st.movies[0]).map(r => r.item.id), ["s1", "sp1", "s2", "px"]);

/* Подпись ветки есть у каждой плитки — блок не должен менять высоту при переключении */
eq("каждая плитка знает свою ветку",
  E.collectionStrip(stSaga, saga, byId("i2")).map(r => E.branchNameOf(saga, r.branchId)),
  ["Основная линия", "Основная линия", "Вокруг второй", "Вокруг второй", "Основная линия", "Основная линия"]);
eq("на ровной ленте подписи тоже есть",
  E.collectionStrip(stSaga, saga, byId("i4")).every(r => !!E.branchNameOf(saga, r.branchId)), true);

eq("подпись основной линии", E.branchNameOf(saga, "__main__"), "Основная линия");
eq("подпись обычной ветки", E.branchNameOf(saga, "x2"), "Вокруг второй");
eq("удалённая ветка подписывается основной линией", E.branchNameOf(saga, "нет-такой"), "Основная линия");

/* Вырожденные случаи не роняют ленту */
eq("без коллекции лента пуста", E.collectionStrip(stSaga, null, byId("i1")), []);
eq("без записи лента пуста", E.collectionStrip(stSaga, saga, null), []);
eq("запись вне коллекции даёт ленту своей базы, но себя в ней не находит",
  E.collectionStrip(stSaga, saga, { id: "чужая" }).map(r => r.item.title), ["1", "2", "3", "4"]);

/* --- Добавление пачкой --- */
const batch = E.addToBranchPatches(state, witcher, "c1", null, [
  { libKind: "movie", id: "m1" }, { libKind: "book", id: "b0" },
]);
eq("номера продолжают ветку, а не начинаются с нуля", batch.map(p => p.collectionOrder), [3, 4]);
eq("порядок повторяет порядок отметок, а не порядок списков состояния",
  batch.map(p => p.id), ["m1", "b0"]);
eq("вид записи сохраняется в правке", batch.map(p => p.libKind), ["movie", "book"]);

const intoBranch = E.addToBranchPatches(state, witcher, "c1", "br-games", [{ libKind: "book", id: "b0" }]);
eq("для конкретной ветки счёт свой", intoBranch[0].collectionOrder, 2);
eq("пустой выбор ничего не даёт", E.addToBranchPatches(state, witcher, "c1", null, []), []);
eq("отсутствующий выбор не роняет", E.addToBranchPatches(state, witcher, "c1", null, null), []);

/* --- Порядок смежных веток --- */
const multi = {
  id: "c7", name: "Много веток", branches: [
    { id: "vt", name: "Вторая", anchorId: null, order: 1 },
    { id: "pr", name: "Первая", anchorId: null, order: 0 },
  ],
};
const stMulti = {
  libraryCollections: [multi], books: [], games: [],
  movies: [
    { id: "mm", title: "Основная", collectionId: "c7", collectionOrder: 0 },
    { id: "aa", title: "Из первой", collectionId: "c7", branchId: "pr", collectionOrder: 0 },
    { id: "bb", title: "Из второй", collectionId: "c7", branchId: "vt", collectionOrder: 0 },
  ],
};
eq("смежные ветки идут по своему порядку, а не по порядку в массиве",
  E.collectionStrip(stMulti, multi, stMulti.movies[0]).map(r => r.item.title),
  ["Основная", "Из первой", "Из второй"]);
eq("и подписаны своими названиями",
  E.collectionStrip(stMulti, multi, stMulti.movies[0]).map(r => E.branchNameOf(multi, r.branchId)),
  ["Основная линия", "Первая", "Вторая"]);

/* --- Название основной линии --- */
eq("по умолчанию — «Основная линия»", E.branchNameOf(multi, "__main__"), "Основная линия");
eq("переименованная основная линия", E.branchNameOf({ ...multi, mainBranchName: "Хронология" }, "__main__"), "Хронология");
eq("пустое значение возвращает умолчание", E.branchNameOf({ ...multi, mainBranchName: "   " }, "__main__"), "Основная линия");
eq("на обычные ветки это не влияет", E.branchNameOf({ ...multi, mainBranchName: "Хронология" }, "pr"), "Первая");

/* --- Состав коллекции: сериал не должен считаться фильмом --- */
const mixState = {
  libraryCollections: [{ id: "c8", name: "Смесь", branches: [] }],
  books: [{ id: "k1", title: "Книга", collectionId: "c8", collectionOrder: 0 }],
  games: [],
  movies: [
    { id: "f1", title: "Фильм", kind: "movie", collectionId: "c8", collectionOrder: 1 },
    { id: "t1", title: "Сериал 1", kind: "series", collectionId: "c8", collectionOrder: 2 },
    { id: "t2", title: "Сериал 2", kind: "series", collectionId: "c8", collectionOrder: 3 },
  ],
};
eq("сериалы считаются отдельно от фильмов",
  E.collectionKindCounts(mixState, "c8"),
  [{ label: "сериалы", count: 2 }, { label: "книги", count: 1 }, { label: "фильмы", count: 1 }]);
eq("пустая коллекция — пустой состав", E.collectionKindCounts(mixState, "нет"), []);
eq("записи без указанного вида кино считаются фильмами",
  E.collectionKindCounts({ ...mixState, movies: [{ id: "x", collectionId: "c8" }] }, "c8")
    .find(x => x.label === "фильмы").count, 1);

/* Переименование основной линии должно быть видно везде, где она подписана. Раньше дерево брало
   название из константы, поэтому переименование сохранялось, а на экране ничего не менялось. */
const renamed = { ...multi, mainBranchName: "Хронология" };
eq("дерево берёт название основной линии из коллекции",
  E.collectionTree(stMulti, renamed)[0].name, "Хронология");
eq("а не из константы",
  E.collectionTree(stMulti, multi)[0].name, "Основная линия");
eq("подписи в ленте согласованы с деревом",
  E.branchNameOf(renamed, "__main__"), E.collectionTree(stMulti, renamed)[0].name);
eq("обычные ветки в дереве подписаны своими именами",
  E.collectionTree(stMulti, renamed).map(n => n.name), ["Хронология", "Первая", "Вторая"]);
eq("переименование обычной ветки видно в дереве",
  E.collectionTree(stMulti, { ...multi, branches: multi.branches.map(b => b.id === "pr" ? { ...b, name: "Побочная" } : b) })
    .map(n => n.name), ["Основная линия", "Побочная", "Вторая"]);

done();
