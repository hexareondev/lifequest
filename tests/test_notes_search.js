const E = require("./notes_env.js");
const { eq, done } = E;

/* --- Извлечение тегов --- */
eq("тег в начале строки", E.extractTags("#идеи что-то"), ["идеи"]);
eq("тег после пробела", E.extractTags("текст #работа далее"), ["работа"]);
eq("кириллица и латиница", E.extractTags("#заметки #ideas"), ["заметки", "ideas"]);
eq("иерархический тег", E.extractTags("#работа/отчёты"), ["работа/отчёты"]);
eq("дубли схлопываются", E.extractTags("#идеи и снова #идеи"), ["идеи"]);
eq("тег в скобках находится", E.extractTags("(см. #архив)"), ["архив"]);
eq("тег в квадратных скобках находится", E.extractTags("[#важное]"), ["важное"]);

/* Классы, которые тегами быть не должны */
eq("заголовок markdown тегом не считается", E.extractTags("# Заголовок"), []);
eq("заголовок второго уровня тоже нет", E.extractTags("## Раздел"), []);
eq("чисто числовой хвост — это номер, не тег", E.extractTags("задача #12"), []);
eq("решётка внутри слова не тег", E.extractTags("C# лучше"), []);
eq("пустой текст", E.extractTags(""), []);
eq("null не роняет", E.extractTags(null), []);

/* --- Облако тегов --- */
const cloudNotes = [
  { id: "1", body: "#работа #идеи" },
  { id: "2", body: "#работа" },
  { id: "3", body: "#дом" },
];
eq("облако тегов сортируется по частоте",
  E.allNoteTags(cloudNotes).map(t => `${t.tag}:${t.count}`), ["работа:2", "дом:1", "идеи:1"]);

/* --- Фильтр по тегам --- */
const tagged = { id: "n", body: "текст #работа/отчёты и #дом" };
eq("точное совпадение тега", E.noteHasAllTags(tagged, ["дом"]), true);
eq("родительский тег ловит дочерний", E.noteHasAllTags(tagged, ["работа"]), true);
eq("дочерний тег не ловит родителя", E.noteHasAllTags({ id: "x", body: "#работа" }, ["работа/отчёты"]), false);
eq("нужны ВСЕ выбранные теги", E.noteHasAllTags(tagged, ["дом", "склад"]), false);
eq("пустой фильтр пропускает всё", E.noteHasAllTags(tagged, []), true);
eq("регистр не важен", E.noteHasAllTags({ id: "x", body: "#Работа" }, ["работа"]), true);

/* --- Заголовок --- */
eq("явный заголовок", E.noteTitleOf({ title: "Планы", body: "текст" }), "Планы");
eq("без заголовка берётся первая строка", E.noteTitleOf({ title: "", body: "\n\nПервая мысль\nвторая" }), "Первая мысль");
eq("решётка из первой строки срезается", E.noteTitleOf({ title: "", body: "# Заголовок в тексте" }), "Заголовок в тексте");
eq("совсем пустая заметка", E.noteTitleOf({ title: "", body: "" }), "Без названия");

/* --- Поиск --- */
const state = {
  noteFolders: [{ id: "f1", name: "Работа", parentId: null, order: 0 }],
  notes: [
    { id: "n1", title: "Отчёт за квартал", folderId: "f1", body: "цифры и выводы #работа", updatedAt: "2026-01-03" },
    { id: "n2", title: "Рецепт", folderId: null, body: "тесто, отчёт о вкусе", updatedAt: "2026-01-02" },
    { id: "n3", title: "Прогулка", folderId: null, body: "ничего общего", updatedAt: "2026-01-01" },
  ],
};

const r1 = E.searchNotes(state, "отчёт", []);
eq("находит и по заголовку, и по телу", r1.notes.map(h => h.note.id), ["n1", "n2"]);
eq("совпадение в заголовке весомее совпадения в теле", r1.notes[0].note.id, "n1");

const r2 = E.searchNotes(state, "квартал прогулка", []);
eq("нужны ВСЕ слова запроса — иначе выдача бессмысленна", r2.notes.length, 0);

const r3 = E.searchNotes(state, "работа", []);
eq("папка находится по названию", r3.folders.map(f => f.id), ["f1"]);
eq("заметка находится по тегу и по пути", r3.notes.map(h => h.note.id), ["n1"]);

const r4 = E.searchNotes(state, "", ["работа"]);
eq("пустой запрос с тегом отдаёт весь отфильтрованный список", r4.notes.map(h => h.note.id), ["n1"]);

const r5 = E.searchNotes(state, "", []);
eq("без запроса и тегов — всё", r5.notes.length, 3);

const r6 = E.searchNotes(state, "ОТЧЁТ", []);
eq("регистр запроса не важен", r6.notes.length, 2);

const snippet = E.searchNotes(state, "выводы", []).notes[0].snippet;
eq("сниппет содержит найденное слово", snippet.includes("выводы"), true);

done();
