/* Действия раздела «Заметки» над папками и заметками (действия редактора текста — в test_notes_actions.js).
   Проверяется: кольцо в дереве папок не создаётся, удаление ветки забирает заметки и откатывается
   на прежние места. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const { notesActions } = load("notes/actions.js");

function fresh() {
  const store = makeStore({
    noteFolders: [
      { id: "A", parentId: null },
      { id: "B", parentId: "A" },
      { id: "C", parentId: "B" },
      { id: "X", parentId: null },
    ],
    notes: [
      { id: "n1", folderId: "X" },
      { id: "n2", folderId: "B" },
      { id: "n3", folderId: null },
      { id: "n4", folderId: "C" },
    ],
    uiPrefs: {},
  });
  return { store, act: notesActions(store) };
}
const ids = (list) => list.map(x => x.id);

// Кольцо в дереве папок.
{
  const { store, act } = fresh();
  act.moveNoteFolder("A", "C");
  eq("папку нельзя вложить в своего потомка", store.state.noteFolders.find(f => f.id === "A").parentId, null);
  eq("показано предупреждение", store.lastToast().text, "Папку нельзя вложить в саму себя");
  act.moveNoteFolder("A", "A");
  eq("и в саму себя тоже", store.state.noteFolders.find(f => f.id === "A").parentId, null);
  act.moveNoteFolder("C", "X");
  eq("обычный перенос работает", store.state.noteFolders.find(f => f.id === "C").parentId, "X");
  act.moveNoteFolder("C", null);
  eq("перенос в корень", store.state.noteFolders.find(f => f.id === "C").parentId, null);
}

// Удаление ветки вместе с заметками и откат.
{
  const { store, act } = fresh();
  act.deleteNoteFolder("B");
  eq("удалена папка и вся её ветка", ids(store.state.noteFolders), ["A", "X"]);
  eq("заметки ветки удалены", ids(store.state.notes), ["n1", "n3"]);
  eq("в тосте — число заметок", store.lastToast().text, "Папка удалена вместе с заметками (2)");
  store.undoLast();
  eq("папки вернулись на свои места", ids(store.state.noteFolders), ["A", "B", "C", "X"]);
  eq("заметки вернулись на свои места", ids(store.state.notes), ["n1", "n2", "n3", "n4"]);
}

// Порядок новой папки считается среди соседей.
{
  const { store, act } = fresh();
  act.addNoteFolder({ name: "Новая", parentId: "A" });
  const added = store.state.noteFolders[store.state.noteFolders.length - 1];
  eq("порядок — после единственного соседа", added.order, 1);
  eq("родитель сохранён", added.parentId, "A");
}

// Заметки: добавление, закрепление, удаление с откатом.
{
  const { store, act } = fresh();
  act.addNote({ title: "Новая" });
  eq("заметка добавлена в начало", store.state.notes[0].title, "Новая");
  eq("даты создания и правки совпадают", store.state.notes[0].createdAt, store.state.notes[0].updatedAt);
  act.toggleNotePinned("n3");
  eq("заметка закреплена", store.state.notes.find(n => n.id === "n3").pinned, true);
  act.deleteNote("n2");
  eq("заметка удалена", store.state.notes.some(n => n.id === "n2"), false);
  store.undoLast();
  eq("откат вернул заметку на её место", store.state.notes[2].id, "n2");
}

// Раскрытие папок в настройках раздела.
{
  const { store, act } = fresh();
  act.toggleNoteFolderExpanded("A");
  eq("папка раскрыта", store.state.uiPrefs.notes.expanded, ["A"]);
  act.toggleNoteFolderExpanded("A");
  eq("папка свёрнута", store.state.uiPrefs.notes.expanded, []);
}

done();
