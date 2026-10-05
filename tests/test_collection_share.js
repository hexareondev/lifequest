/* Коллекция в обмене — не отдельный формат, а ярлык на группу записей библиотеки: перед сборкой
   файла она раскрывается в свои записи, а структура едет отдельным массивом рядом. Здесь
   проверяется именно раскрытие. */
const E = require("./notes_env.js");
const { eq, done } = E;

const coll = {
  id: "c1", name: "Ведьмак", coverEmoji: "🐺", mainBranchName: "Сага", showProgress: false,
  branches: [
    { id: "bg", name: "Игры", anchorId: null, order: 1 },
    { id: "bs", name: "Вокруг первой книги", anchorId: "b1", order: 0 },
  ],
};
const state = {
  libraryCollections: [coll],
  books: [
    { id: "b1", title: "Последнее желание", collectionId: "c1", collectionOrder: 0 },
    { id: "b2", title: "Меч Предназначения", collectionId: "c1", branchId: "bs", collectionOrder: 0 },
  ],
  games: [{ id: "g1", title: "Ведьмак 3", collectionId: "c1", branchId: "bg", collectionOrder: 0 }],
  movies: [{ id: "m9", title: "Чужой фильм" }],
};
const entry = { id: "collection:c1", title: "Ведьмак", __collection: coll };
const plain = (id, title, libKind) => ({ id, title, libKind });

/* --- Без коллекций ничего не меняется --- */
const asIs = E.expandShareSelection("library", [plain("m9", "Чужой фильм", "movie")], state);
eq("выбор без коллекций проходит насквозь", asIs.entries.map(x => x.id), ["m9"]);
eq("и структуры не появляется", asIs.collections, []);
eq("чужой раздел не трогаем", E.expandShareSelection("people", [{ id: "p1" }], state).collections, []);

/* --- Раскрытие --- */
const r = E.expandShareSelection("library", [entry], state);
eq("ярлык коллекции заменяется её записями", r.entries.map(x => x.id).sort(), ["b1", "b2", "g1"]);
eq("вид записи проставляется", r.entries.find(x => x.id === "g1").libKind, "game");
eq("сам ярлык в записи не попадает", r.entries.some(x => x.__collection), false);
eq("структура коллекции выделена отдельно", r.collections.length, 1);
eq("оформление и настройки едут", [r.collections[0].name, r.collections[0].coverEmoji, r.collections[0].showProgress],
  ["Ведьмак", "🐺", false]);
eq("имя основной линии едет", r.collections[0].mainBranchName, "Сага");
eq("ветки по своему порядку", r.collections[0].branches.map(b => b.name), ["Вокруг первой книги", "Игры"]);

/* Ссылки — индексы, а не id */
const idx = (id) => r.entries.findIndex(x => x.id === id);
eq("привязка ветки — индекс записи", r.collections[0].branches[0].anchor, idx("b1"));
eq("параллельная ветка привязки не имеет", r.collections[0].branches[1].anchor, null);
eq("принадлежность записи — индекс коллекции и индекс ветки",
  r.membership.get("g1"), { collection: 0, branch: 1 });
eq("запись основной линии ветки не имеет", r.membership.get("b1").branch, null);
eq("в структуре нет внутренних id",
  JSON.stringify(r.collections).includes("bs") || JSON.stringify(r.collections).includes("b1"), false);

/* --- Запись, отмеченная и сама по себе, и в составе коллекции --- */
const both = E.expandShareSelection("library", [plain("b1", "Последнее желание", "book"), entry], state);
eq("дубля не возникает", both.entries.filter(x => x.id === "b1").length, 1);
eq("отмеченная отдельно остаётся первой", both.entries[0].id, "b1");
eq("и всё равно получает принадлежность коллекции", both.membership.get("b1").collection, 0);

/* --- Записи вне коллекции едут рядом --- */
const mixed = E.expandShareSelection("library", [plain("m9", "Чужой фильм", "movie"), entry], state);
eq("посторонняя запись сохраняется", mixed.entries.map(x => x.id).includes("m9"), true);
eq("но принадлежности у неё нет", mixed.membership.get("m9"), undefined);
eq("и индексы привязок считаются по полному списку",
  mixed.collections[0].branches[0].anchor, mixed.entries.findIndex(x => x.id === "b1"));

/* --- Две коллекции --- */
const coll2 = { id: "c2", name: "Дюна", branches: [] };
const state2 = { ...state, libraryCollections: [coll, coll2],
  movies: [...state.movies, { id: "m1", title: "Дюна", collectionId: "c2", collectionOrder: 0 }] };
const two = E.expandShareSelection("library",
  [entry, { id: "collection:c2", title: "Дюна", __collection: coll2 }], state2);
eq("обе коллекции в структуре", two.collections.map(c => c.name), ["Ведьмак", "Дюна"]);
eq("записи второй коллекции ссылаются на её индекс", two.membership.get("m1").collection, 1);

/* --- Пустая коллекция --- */
const emptyColl = { id: "c9", name: "Пустая", branches: [] };
const one = E.expandShareSelection("library", [{ id: "collection:c9", __collection: emptyColl }], state);
eq("пустая коллекция даёт структуру без записей", [one.entries.length, one.collections.length], [0, 1]);

/* --- Перестановка веток --- */
const branches = [{ id: "a" }, { id: "b" }, { id: "c" }];
const ids = (l) => l.map(x => x.id);
eq("ветка встаёт перед целевой", ids(E.reorderBranchList(branches, "c", "a")), ["c", "a", "b"]);
eq("бросок мимо отправляет в конец", ids(E.reorderBranchList(branches, "a", null)), ["b", "c", "a"]);
eq("бросок на себя ничего не меняет", ids(E.reorderBranchList(branches, "b", "b")), ["a", "b", "c"]);
eq("одна реализация работает и на записях",
  E.reorderBy([{ item: { id: "x" } }, { item: { id: "y" } }], r => r.item.id, "y", "x").map(r => r.item.id),
  ["y", "x"]);

/* --- Совпадения с уже имеющимся ---
   Сверяем по названию: чужие id у нас ничего не значат, а одна и та же книга у двух людей
   называется одинаково. */
const mine = {
  libraryCollections: [],
  books: [
    { id: "own1", title: "Дюна", collectionId: null },
    { id: "own2", title: "Kafka on the Shore", displayTitle: "Кафка на пляже" },
  ],
  games: [{ id: "own3", title: "Дюна" }],
  movies: [],
};
const dup = (items) => E.shareDuplicateMatches("library", items, mine);

eq("точное совпадение названия", dup([{ libKind: "book", title: "Дюна" }]).map(d => d.existing.id), ["own1"]);
eq("регистр и пробелы не мешают", dup([{ libKind: "book", title: "  дюна " }]).map(d => d.existing.id), ["own1"]);
eq("вид записи учитывается: игра «Дюна» это не книга «Дюна»",
  dup([{ libKind: "game", title: "Дюна" }])[0].existing.id, "own3");
eq("фильма с таким названием нет", dup([{ libKind: "movie", title: "Дюна" }]), []);
eq("новое название совпадением не считается", dup([{ libKind: "book", title: "Другая" }]), []);

/* Названий два с каждой стороны — совпасть должно любое с любым */
eq("присланное настоящее совпало с нашим настоящим",
  dup([{ libKind: "book", title: "Kafka on the Shore" }])[0].existing.id, "own2");
eq("присланное настоящее совпало с нашим отображаемым",
  dup([{ libKind: "book", title: "Кафка на пляже" }])[0].existing.id, "own2");
eq("присланное отображаемое совпало с нашим настоящим",
  dup([{ libKind: "book", title: "Что-то ещё", displayTitle: "Kafka on the Shore" }])[0].existing.id, "own2");

eq("индекс в присланном списке сохраняется",
  dup([{ libKind: "book", title: "Новая" }, { libKind: "book", title: "Дюна" }])[0].index, 1);
eq("запись без названия совпадением не считается", dup([{ libKind: "book", title: "  " }]), []);
eq("пустой список не роняет", dup([]), []);
eq("чужой раздел не проверяется", E.shareDuplicateMatches("people", [{ title: "Дюна" }], mine), []);
eq("пустая библиотека — совпадений нет",
  E.shareDuplicateMatches("library", [{ libKind: "book", title: "Дюна" }], { books: [], games: [], movies: [] }), []);

done();
