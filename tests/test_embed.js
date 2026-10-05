const E = require("./notes_env.js");
const { eq, done } = E;

/* --- Заглушка LIBRARY_KINDS в окружении обязана совпадать с настоящей таблицей --- */
["book", "books", "game", "games", "movie", "movies"].forEach(() => {});
eq("ключи книг в исходнике те же, что в заглушке теста",
  /book:\s*\{\s*stateKey:\s*"books"/.test(E.rawSource), true);
eq("ключи игр совпадают",   /game:\s*\{\s*stateKey:\s*"games"/.test(E.rawSource), true);
eq("ключи фильмов совпадают", /movie:\s*\{\s*stateKey:\s*"movies"/.test(E.rawSource), true);

/* --- Разбор ссылки --- */
eq("человек", E.parseEmbedRef("человек:Аня"), { kind: "person", ref: "Аня", fields: null, alias: "человек" });
eq("сфера", E.parseEmbedRef("сфера:Здоровье"), { kind: "sphere", ref: "Здоровье", fields: null, alias: "сфера" });
eq("книга", E.parseEmbedRef("книга:Дюна"), { kind: "book", ref: "Дюна", fields: null, alias: "книга" });
eq("латинский псевдоним тоже работает", E.parseEmbedRef("person:Аня").kind, "person");
eq("регистр типа не важен", E.parseEmbedRef("Человек:Аня").kind, "person");
eq("пробелы вокруг обрезаются", E.parseEmbedRef("  сфера : Быт  ").ref, "Быт");
eq("двоеточие в имени сохраняется", E.parseEmbedRef("книга:Дюна: часть вторая").ref, "Дюна: часть вторая");
eq("неизвестный тип не разбирается", E.parseEmbedRef("погода:завтра"), null);
eq("без двоеточия не разбирается", E.parseEmbedRef("Аня"), null);
eq("пустое имя не разбирается", E.parseEmbedRef("человек:"), null);
eq("пустая строка не роняет", E.parseEmbedRef(""), null);

/* --- Разрешение по состоянию --- */
const state = {
  people: [{ id: "p1", name: "Настя", color: "rose" }, { id: "p2", name: "Мама", color: "amber" }],
  spheres: [{ id: "health", name: "Здоровье", color: "emerald", xp: 210 }],
  books: [
    { id: "b1", title: "Дюна", status: "active", pagesRead: 180, pagesTotal: 412 },
    { id: "b2", title: "Kafka on the Shore", displayTitle: "Кафка на пляже", status: "want", pagesRead: 0, pagesTotal: 0 },
  ],
  games: [{ id: "g1", title: "Hades", status: "done", achievementsGot: 32, achievementsTotal: 49 }],
  movies: [
    { id: "m1", title: "Дюна", status: "done", kind: "movie", episodeAt: 0, episodesTotal: 0 },
    { id: "m2", title: "Разделение", status: "active", kind: "series", episodeAt: 4, episodesTotal: 9 },
  ],
};

eq("человек по имени", E.resolveEmbed(state, "человек:Настя").item.id, "p1");
eq("регистр имени не важен", E.resolveEmbed(state, "человек:настя").item.id, "p1");
eq("сфера по имени", E.resolveEmbed(state, "сфера:Здоровье").item.id, "health");
eq("книга по названию", E.resolveEmbed(state, "книга:Дюна").item.id, "b1");
eq("вид библиотечной записи сохраняется", E.resolveEmbed(state, "игра:Hades").libKind, "game");
eq("библиотечные виды сводятся к одному типу", E.resolveEmbed(state, "книга:Дюна").kind, "library");

/* Поиск по id — страховка для записей, сделанных до переименования объекта */
eq("человек по id", E.resolveEmbed(state, "человек:p2").item.name, "Мама");
eq("имя имеет приоритет над id", E.resolveEmbed(state, "человек:Настя").item.id, "p1");

/* Обобщённый тип ищет по всем спискам, в объявленном порядке */
eq("библиотека находит книгу", E.resolveEmbed(state, "библиотека:Дюна").libKind, "book");
eq("библиотека находит игру", E.resolveEmbed(state, "библиотека:Hades").libKind, "game");
eq("одноимённые книга и фильм: выигрывает книга (порядок поиска фиксирован)",
  E.resolveEmbed(state, "библиотека:Дюна").item.id, "b1");
eq("явный тип обходит порядок и находит фильм", E.resolveEmbed(state, "фильм:Дюна").item.id, "m1");

/* Ненайденное — это null, а не исключение: наверху рисуется заметная заглушка */
eq("несуществующий человек", E.resolveEmbed(state, "человек:Кто-то"), null);
eq("человек в списке сфер не ищется", E.resolveEmbed(state, "сфера:Настя"), null);
eq("без состояния ничего не разрешается", E.resolveEmbed(null, "человек:Настя"), null);
eq("пустые списки не роняют", E.resolveEmbed({}, "человек:Настя"), null);

/* --- Прогресс библиотечной карточки --- */
eq("книга — страницы", E.libraryProgressOf("book", state.books[0]), { value: 180, total: 412, ratio: 180 / 412 });
eq("игра — ачивки", E.libraryProgressOf("game", state.games[0]).total, 49);
eq("фильм без серий прогресса не имеет", E.libraryProgressOf("movie", state.movies[0]), null);
eq("книга без общего числа страниц прогресса не имеет",
  E.libraryProgressOf("book", { pagesRead: 10, pagesTotal: 0 }), null);

/* --- Синтаксис и вставка --- */
eq("синтаксис собирается обратно", E.embedSyntax("сфера", "Здоровье"), "![[сфера:Здоровье]]");
eq("собранное разбирается назад", E.parseEmbedRef("сфера:Здоровье"),
  E.parseEmbedRef(E.embedSyntax("сфера", "Здоровье").slice(3, -2)));

/* --- Поля виджета --- */
eq("черты нет — поля не заданы", E.parseEmbedRef("человек:Аня").fields, null);
eq("черта со списком", E.parseEmbedRef("человек:Аня|отношения,др").fields, ["отношения", "др"]);
eq("пробелы и регистр в списке полей нормализуются",
  E.parseEmbedRef("человек:Аня| Отношения , ДР ").fields, ["отношения", "др"]);
eq("пустая черта — осознанно голая карточка, а не набор по умолчанию",
  E.parseEmbedRef("человек:Аня|").fields, []);
eq("имя с двоеточием и поля вместе",
  E.parseEmbedRef("книга:Дюна: часть вторая|статус").ref, "Дюна: часть вторая");
eq("и поля при этом разобраны", E.parseEmbedRef("книга:Дюна: часть вторая|статус").fields, ["статус"]);

eq("без черты берётся набор по умолчанию",
  E.embedFieldsOf("person", null), E.EMBED_DEFAULT_FIELDS.person);
eq("пустой список остаётся пустым", E.embedFieldsOf("person", []), []);
eq("незнакомые поля отбрасываются молча (заметка из будущей версии откроется)",
  E.embedFieldsOf("person", ["уровень", "телепатия"]), ["уровень"]);
eq("поля чужого вида не подходят", E.embedFieldsOf("sphere", ["долг"]), []);
eq("порядок полей сохраняется как задан", E.embedFieldsOf("person", ["др", "уровень"]), ["др", "уровень"]);
eq("у каждого вида свой каталог", Object.keys(E.EMBED_FIELDS).sort(), ["library", "person", "sphere"]);
eq("наборы по умолчанию состоят только из существующих полей",
  Object.keys(E.EMBED_DEFAULT_FIELDS).every(k =>
    E.EMBED_DEFAULT_FIELDS[k].every(f => E.EMBED_FIELDS[k].some(x => x.key === f))), true);

eq("поля доезжают до разрешённого объекта",
  E.resolveEmbed(state, "человек:Настя|др,долг").fields, ["др", "долг"]);
eq("псевдоним сохраняется как написан", E.resolveEmbed(state, "person:Настя").alias, "person");
eq("обобщённый тип не подменяется на конкретный",
  E.resolveEmbed(state, "библиотека:Дюна").alias, "библиотека");

/* --- Сборка и перезапись строки --- */
eq("синтаксис с полями", E.embedSyntax("человек", "Аня", ["др", "долг"]), "![[человек:Аня|др,долг]]");
eq("пустой список полей даёт пустую черту", E.embedSyntax("человек", "Аня", []), "![[человек:Аня|]]");
eq("null полей — черты нет", E.embedSyntax("человек", "Аня", null), "![[человек:Аня]]");

const doc = "текст\n\n![[человек:Настя]]\n\nхвост";
eq("перезаписывается ровно нужная строка",
  E.replaceEmbedLine(doc, 2, "![[человек:Настя|др]]"),
  "текст\n\n![[человек:Настя|др]]\n\nхвост");
eq("соседние строки не тронуты", E.replaceEmbedLine(doc, 2, "X").split("\n")[4], "хвост");
eq("номер строки за границей текста ничего не меняет", E.replaceEmbedLine(doc, 99, "X"), doc);
eq("перезапись переживает круговой рейс разбора",
  E.parseEmbedRef(E.replaceEmbedLine(doc, 2, E.embedSyntax("человек", "Настя", ["др"])).split("\n")[2].slice(3, -2)).fields,
  ["др"]);

function ins(text, pos, snippet) {
  const r = E.insertEmbedEdit(text, pos, snippet);
  return text.slice(0, r.from) + r.insert + text.slice(r.to);
}
eq("в пустой текст вставляется как есть", ins("", 0, "![[x:y]]"), "![[x:y]]");
eq("посреди абзаца отделяется переводами строк",
  ins("до и после", 5, "![[x:y]]"), "до и \n![[x:y]]\nпосле");
eq("в начале собственной строки лишний перевод не добавляется",
  ins("абзац\n", 6, "![[x:y]]"), "абзац\n![[x:y]]");
eq("в конце текста хвостовой перевод не нужен",
  ins("абзац", 5, "![[x:y]]"), "абзац\n![[x:y]]");
eq("курсор встаёт после вставленного",
  (() => { const r = E.insertEmbedEdit("абзац", 5, "![[x:y]]"); return r.selStart; })(), 14);
eq("позиция за пределами текста подрезается",
  ins("абв", 999, "![[x:y]]"), "абв\n![[x:y]]");

/* --- Разбор в разметке --- */
const blocks = E.parseMarkdown("текст\n\n![[человек:Настя]]\n\nещё");
eq("встраивание на своей строке — отдельный блок", blocks.map(b => b.type), ["p", "blank", "embed", "blank", "p"]);
eq("ссылка сохраняется целиком", blocks[2].ref, "человек:Настя");

eq("встраивание посреди абзаца остаётся строчным, а не разрывает текст",
  E.parseMarkdown("см. ![[сфера:Быт]] дальше").map(b => b.type), ["p"]);
eq("и разбирается строчно",
  E.parseInline("см. ![[сфера:Быт]] дальше").filter(p => typeof p !== "string").map(p => p.t + ":" + p.v),
  ["embed:сфера:Быт"]);

eq("обычная вики-ссылка встраиванием не становится",
  E.parseInline("[[Заметка]]")[0].t, "wiki");
eq("восклицательный знак перед обычным текстом ничего не ломает",
  E.parseInline("Ура! Текст").every(p => typeof p === "string"), true);
eq("встраивание внутри блока кода не разбирается",
  E.parseMarkdown("```\n![[человек:Настя]]\n```")[0].type, "code");

/* --- Куда ведёт клик по виджету ---
   Разделы принимают фокус по-разному, и на этом уже один раз обожглись: Библиотека — это три
   списка в одной вкладке, и от голого id она открывала тот список, что был открыт прошлый раз. */
eq("человек — фокус по id",
  E.embedNavTarget(E.resolveEmbed(state, "человек:Настя")), { tab: "people", focus: "p1" });
eq("сфера — фокус по id",
  E.embedNavTarget(E.resolveEmbed(state, "сфера:Здоровье")), { tab: "spheres", focus: "health" });
eq("книга — фокус объектом с видом записи",
  E.embedNavTarget(E.resolveEmbed(state, "книга:Дюна")), { tab: "library", focus: { kind: "book", id: "b1" } });
eq("игра ведёт в список игр",
  E.embedNavTarget(E.resolveEmbed(state, "игра:Hades")).focus, { kind: "game", id: "g1" });
eq("фильм ведёт в список фильмов",
  E.embedNavTarget(E.resolveEmbed(state, "фильм:Дюна")).focus, { kind: "movie", id: "m1" });
eq("обобщённый тип всё равно даёт конкретный список",
  E.embedNavTarget(E.resolveEmbed(state, "библиотека:Hades")).focus, { kind: "game", id: "g1" });
eq("фокус библиотеки — всегда объект, а не строка (та самая ошибка)",
  typeof E.embedNavTarget(E.resolveEmbed(state, "книга:Дюна")).focus, "object");

/* --- Два названия у записей библиотеки ---
   title подтягивается из источника и может быть на чужом языке, displayTitle задаётся руками.
   Человек пишет в заметке то название, которое видит, — значит искать надо по обоим. */
eq("отображаемое название побеждает настоящее",
  E.libraryDisplayTitle(state.books[1]), "Кафка на пляже");
eq("без отображаемого берётся настоящее", E.libraryDisplayTitle(state.books[0]), "Дюна");
eq("пустое отображаемое не считается заданным",
  E.libraryDisplayTitle({ title: "X", displayTitle: "   " }), "X");

eq("ссылка по отображаемому названию находит запись",
  E.resolveEmbed(state, "книга:Кафка на пляже").item.id, "b2");
eq("ссылка по настоящему названию находит ту же запись",
  E.resolveEmbed(state, "книга:Kafka on the Shore").item.id, "b2");
eq("регистр не важен ни для одного из названий",
  E.resolveEmbed(state, "книга:кафка на пляже").item.id, "b2");
eq("обобщённый тип тоже ищет по обоим",
  E.resolveEmbed(state, "библиотека:Kafka on the Shore").item.id, "b2");
eq("у людей и сфер второго названия нет и поиск не ломается",
  E.resolveEmbed(state, "человек:Настя").item.id, "p1");

/* Ссылка сохраняется такой, как написана: перенастройка полей не должна подменять одно название
   на другое — это была бы правка чужого текста за него. */
eq("ссылка возвращается как написана (настоящее)",
  E.resolveEmbed(state, "книга:Kafka on the Shore").ref, "Kafka on the Shore");
eq("ссылка возвращается как написана (отображаемое)",
  E.resolveEmbed(state, "книга:Кафка на пляже").ref, "Кафка на пляже");
eq("перенастройка полей сохраняет исходное название",
  E.embedSyntax("книга", E.resolveEmbed(state, "книга:Kafka on the Shore").ref, ["статус"]),
  "![[книга:Kafka on the Shore|статус]]");

eq("поле «настоящее название» есть в каталоге библиотеки",
  E.EMBED_FIELDS.library.some(f => f.key === "оригинал"), true);
eq("но по умолчанию выключено",
  E.EMBED_DEFAULT_FIELDS.library.includes("оригинал"), false);

/* --- Строка списка вставки --- */
eq("запись с двумя названиями даёт подпись и приписку",
  E.libraryPickerItem(state.books[1]), { id: "b2", name: "Кафка на пляже", alt: "Kafka on the Shore" });
eq("запись с одним названием приписки не получает",
  E.libraryPickerItem(state.books[0]), { id: "b1", name: "Дюна", alt: null });

const row = E.libraryPickerItem(state.books[1]);
eq("фильтр находит по отображаемому", E.pickerItemMatches(row, "кафка"), true);
eq("фильтр находит по настоящему", E.pickerItemMatches(row, "shore"), true);
eq("фильтр по части слова тоже срабатывает", E.pickerItemMatches(row, "пляж"), true);
eq("чужое слово не находится", E.pickerItemMatches(row, "дюна"), false);
eq("пустой запрос пропускает всё", E.pickerItemMatches(row, ""), true);
eq("строка без приписки ищется только по своему названию",
  E.pickerItemMatches(E.libraryPickerItem(state.books[0]), "shore"), false);

/* --- Фильм и сериал ---
   Вид кино хранится в самой записи, а не в разделе: LIBRARY_KINDS.movie.singular всегда «Фильм»,
   и сериал из-за этого подписывался фильмом. */
eq("сериал подписан сериалом", E.libraryItemTypeLabel("movie", { kind: "series" }), "Сериал");
eq("фильм остаётся фильмом", E.libraryItemTypeLabel("movie", { kind: "movie" }), "Фильм");
eq("запись без вида считается фильмом (старые сохранения)", E.libraryItemTypeLabel("movie", {}), "Фильм");
eq("книга берёт подпись из раздела", E.libraryItemTypeLabel("book", {}), "Книга");
eq("игра берёт подпись из раздела", E.libraryItemTypeLabel("game", {}), "Игра");
eq("вид записи на книгу не влияет", E.libraryItemTypeLabel("book", { kind: "series" }), "Книга");
eq("неизвестный раздел не роняет", E.libraryItemTypeLabel("нечто", {}), "Запись");

eq("хвост с серией у начатого сериала",
  E.librarySeriesSuffix({ kind: "series", episodeAt: 4, episodesTotal: 9 }), " · серия 4/9");
eq("без общего числа серий — только текущая",
  E.librarySeriesSuffix({ kind: "series", episodeAt: 4, episodesTotal: 0 }), " · серия 4");
eq("непочатый сериал хвоста не получает",
  E.librarySeriesSuffix({ kind: "series", episodeAt: 0, episodesTotal: 9 }), "");
eq("у фильма хвоста нет", E.librarySeriesSuffix({ kind: "movie", episodeAt: 4 }), "");

eq("сериал в состоянии подписывается верно",
  E.libraryItemTypeLabel("movie", state.movies.find(m => m.id === "m2")), "Сериал");

/* «сериал» как псевдоним в синтаксисе: писать «фильм» про сериал неестественно */
eq("псевдоним «сериал» ведёт в кино", E.parseEmbedRef("сериал:Разделение").kind, "movie");
eq("и находит запись", E.resolveEmbed(state, "сериал:Разделение").item.id, "m2");
eq("псевдонимом «фильм» сериал тоже находится (список общий)",
  E.resolveEmbed(state, "фильм:Разделение").item.id, "m2");
eq("псевдоним сохраняется как написан", E.resolveEmbed(state, "сериал:Разделение").alias, "сериал");
eq("переход ведёт в список кино",
  E.embedNavTarget(E.resolveEmbed(state, "сериал:Разделение")).focus, { kind: "movie", id: "m2" });

done();
