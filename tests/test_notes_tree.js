const E = require("./notes_env.js");
const { eq, done } = E;

const folders = [
  { id: "a", name: "Работа", parentId: null, order: 0 },
  { id: "b", name: "Проекты", parentId: "a", order: 0 },
  { id: "c", name: "Архив", parentId: "b", order: 0 },
  { id: "d", name: "Личное", parentId: null, order: 1 },
];
const notes = [
  { id: "n1", title: "План", folderId: "b", body: "", updatedAt: "2026-01-02" },
  { id: "n2", title: "Итоги", folderId: "c", body: "", updatedAt: "2026-01-03" },
  { id: "n3", title: "Корневая", folderId: null, body: "", updatedAt: "2026-01-01" },
];
const state = { noteFolders: folders, notes };

/* --- Пути и дети --- */
eq("дети корня в порядке order", E.childFolders(folders, null).map(f => f.id), ["a", "d"]);
eq("дети вложенной папки", E.childFolders(folders, "a").map(f => f.id), ["b"]);
eq("путь до глубокой папки", E.folderPathOf(folders, "c").map(f => f.id), ["a", "b", "c"]);
eq("подпись пути", E.folderPathLabel(folders, "c"), "Работа / Проекты / Архив");
eq("корень подписан отдельно", E.folderPathLabel(folders, null), "Корень");

/* --- Ветка --- */
eq("ветка включает саму папку и всех потомков", E.folderBranchIds(folders, "a").sort(), ["a", "b", "c"]);
eq("лист — ветка из одного элемента", E.folderBranchIds(folders, "c"), ["c"]);
eq("счётчик заметок по ветке", E.folderNoteCount(state, "a", true), 2);
eq("счётчик заметок без вложенных", E.folderNoteCount(state, "a", false), 0);
eq("заметки конкретной папки", E.notesInFolder(notes, "b").map(n => n.id), ["n1"]);
eq("заметки корня", E.notesInFolder(notes, null).map(n => n.id), ["n3"]);

/* --- Защита от цикла: главное свойство дерева --- */
eq("папку нельзя положить в саму себя", E.canMoveFolder(folders, "a", "a"), false);
eq("папку нельзя положить в своего потомка", E.canMoveFolder(folders, "a", "c"), false);
eq("папку нельзя положить в прямого ребёнка", E.canMoveFolder(folders, "a", "b"), false);
eq("в чужую ветку — можно", E.canMoveFolder(folders, "a", "d"), true);
eq("в корень — можно всегда", E.canMoveFolder(folders, "c", null), true);
eq("потомка в предка — можно (обычный подъём)", E.canMoveFolder(folders, "c", "a"), true);

/* Старая наивная проверка «не сам себе родитель» пропускала цикл через внука —
   подтверждаем, что защита не гипотетическая. */
function naiveGuard(folderId, newParentId) { return folderId !== newParentId; }
eq("наивная проверка цикл через внука пропускала", naiveGuard("a", "c"), true);

/* --- Битое дерево из руками правленного бэкапа не должно вешать обход --- */
const broken = [
  { id: "x", name: "X", parentId: "y", order: 0 },
  { id: "y", name: "Y", parentId: "x", order: 0 },
];
const path = E.folderPathOf(broken, "x");
eq("кольцевой parentId не зацикливает обход", path.length <= 64, true);

/* --- Сортировка списка --- */
const list = [
  { id: "1", title: "Бета", body: "", updatedAt: "2026-01-01", createdAt: "2026-01-01", pinned: false },
  { id: "2", title: "Альфа", body: "", updatedAt: "2026-01-05", createdAt: "2026-01-02", pinned: false },
  { id: "3", title: "Гамма", body: "", updatedAt: "2026-01-03", createdAt: "2026-01-03", pinned: true },
];
eq("по изменению — свежее сверху, закреплённое всё равно первое",
  E.sortNotesList(list, "updated").map(n => n.id), ["3", "2", "1"]);
eq("по названию — алфавит внутри групп",
  E.sortNotesList(list, "title").map(n => n.id), ["3", "2", "1"]);
eq("сортировка не мутирует исходный список", list.map(n => n.id), ["1", "2", "3"]);

done();
