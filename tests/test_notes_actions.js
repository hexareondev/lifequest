const E = require("./notes_env.js");
const { eq, done } = E;

/* Модель действия deleteNoteFolder: та же логика, что в actions, но без React — проверяем
   каскад и полноту отката. Настоящие folderBranchIds/insertAt вырезаны из исходника. */
function deleteFolderModel(state, id) {
  const folders = state.noteFolders;
  const branch = E.folderBranchIds(folders, id);
  const removedFolders = folders.map((f, i) => ({ f, i })).filter(x => branch.includes(x.f.id));
  const removedNotes = state.notes.map((n, i) => ({ n, i })).filter(x => branch.includes(x.n.folderId || null));
  const after = {
    noteFolders: folders.filter(f => !branch.includes(f.id)),
    notes: state.notes.filter(n => !branch.includes(n.folderId || null)),
  };
  const undo = (cur) => {
    let nf = cur.noteFolders;
    removedFolders.forEach(({ f, i }) => { nf = E.insertAt(nf, i, f); });
    let nn = cur.notes;
    removedNotes.forEach(({ n, i }) => { nn = E.insertAt(nn, i, n); });
    return { noteFolders: nf, notes: nn };
  };
  return { after, undo, removedNotes: removedNotes.length };
}

const state = {
  noteFolders: [
    { id: "a", name: "Работа", parentId: null, order: 0 },
    { id: "b", name: "Проекты", parentId: "a", order: 0 },
    { id: "c", name: "Архив", parentId: "b", order: 0 },
    { id: "d", name: "Личное", parentId: null, order: 1 },
  ],
  notes: [
    { id: "n1", folderId: "a", title: "1", body: "" },
    { id: "n2", folderId: "d", title: "2", body: "" },
    { id: "n3", folderId: "c", title: "3", body: "" },
    { id: "n4", folderId: null, title: "4", body: "" },
    { id: "n5", folderId: "b", title: "5", body: "" },
  ],
};

const del = deleteFolderModel(state, "a");
eq("удаляется вся ветка папок", del.after.noteFolders.map(f => f.id), ["d"]);
eq("удаляются заметки всей ветки, чужие остаются", del.after.notes.map(n => n.id), ["n2", "n4"]);
eq("в тосте честное число удалённых заметок", del.removedNotes, 3);

const restored = del.undo(del.after);
eq("откат возвращает папки на прежние позиции", restored.noteFolders.map(f => f.id), ["a", "b", "c", "d"]);
eq("откат возвращает заметки на прежние позиции", restored.notes.map(n => n.id), ["n1", "n2", "n3", "n4", "n5"]);

/* Наивный откат «в конец списка» ломал бы ручной порядок — подтверждаем, что разница реальна */
const naive = { noteFolders: [...del.after.noteFolders, { id: "a" }, { id: "b" }, { id: "c" }] };
eq("наивный откот ставит папки не туда", naive.noteFolders.map(f => f.id), ["d", "a", "b", "c"]);

/* Удаление листа не задевает соседей */
const leaf = deleteFolderModel(state, "c");
eq("удаление листа снимает только его", leaf.after.noteFolders.map(f => f.id), ["a", "b", "d"]);
eq("и только его заметки", leaf.after.notes.map(n => n.id), ["n1", "n2", "n4", "n5"]);

/* Удаление несуществующего id ничего не портит */
const ghost = deleteFolderModel(state, "нет-такого");
eq("несуществующая папка — не трогаем папки", ghost.after.noteFolders.length, 4);
eq("несуществующая папка — не трогаем заметки", ghost.after.notes.length, 5);

/* --- Раздельное хранение: та же схема, что в App (два ключа localStorage) --- */
function saveSplit(state, store) {
  const { notes, noteFolders, ...rest } = state;
  store.main = JSON.stringify(rest);
  store.notes = JSON.stringify({ notes: notes || [], noteFolders: noteFolders || [] });
}
function loadSplit(store) {
  const parsed = JSON.parse(store.main);
  const np = store.notes ? JSON.parse(store.notes) : null;
  if (np) { parsed.notes = np.notes; parsed.noteFolders = np.noteFolders; }
  return parsed;
}

const full = { quests: [{ id: "q" }], profile: { currency: 5 }, notes: state.notes, noteFolders: state.noteFolders };
const store = {};
saveSplit(full, store);
eq("основное сохранение не содержит текста заметок", store.main.includes('"notes"'), false);
eq("ключ заметок содержит и заметки, и папки",
  JSON.parse(store.notes).notes.length + JSON.parse(store.notes).noteFolders.length, 9);
eq("круговой рейс без потерь", loadSplit(store), full);

/* Импортированный полный бэкап: заметки лежат внутри основного ключа, отдельного ещё нет */
const legacyStore = { main: JSON.stringify(full), notes: null };
eq("заметки из старого одиночного файла подхватываются", loadSplit(legacyStore).notes.length, 5);

/* Заметки правились, остальное — нет: ключ заметок обновился, основной остался тем же */
const store2 = {};
saveSplit({ ...full, notes: [...state.notes, { id: "n6", folderId: null, title: "6", body: "" }] }, store2);
eq("правка заметок не меняет основное сохранение", store2.main, store.main);
eq("а ключ заметок меняется", store2.notes !== store.notes, true);

done();
