/* Действия раздела «Библиотека». Проверяется: завершение даёт XP и окно нового уровня, а откат забирает
   XP; отслеживание переводит «хочу» в «сейчас»; дневник страниц ведётся только при активной цели;
   удаление коллекции отвязывает записи, а не удаляет их; кольцо в ветках коллекции не создаётся. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const { libraryActions } = load("library/actions.js");
const { todayStr, addDaysToDateStr } = load("core/basics.js");
const { levelFromXp } = load("core/xp.js");

const TODAY = todayStr();
const toNext = levelFromXp(0).xpForNext;

function fresh() {
  const store = makeStore({
    spheres: [{ id: "s1", xp: toNext - 5 }],
    books: [
      { id: "b1", title: "Дюна", status: "active", tracked: true, pagesRead: 10, pagesTotal: 100, sphereId: "s1", rewardXp: 10, notes: [],
        readingGoal: { startDate: addDaysToDateStr(TODAY, -1), endDate: addDaysToDateStr(TODAY, 10), pagesPerDay: 20 },
        collectionId: "c1", branchId: null, collectionOrder: 0 },
      { id: "b2", title: "Солярис", status: "want", tracked: false, pagesRead: 0, pagesTotal: 200, notes: [], collectionId: "c1", branchId: "br1", collectionOrder: 0 },
    ],
    games: [{ id: "g1", title: "Hades", status: "buy", tracked: false, notes: [] }],
    movies: [{ id: "m1", title: "Сталкер", status: "active", tracked: true, notes: [], collectionId: "c1", branchId: null, collectionOrder: 1 }],
    readingLog: [],
    libraryCollections: [{ id: "c1", name: "Фантастика", branches: [{ id: "br1", name: "Лем", anchorId: "b1", order: 0 }] }],
    uiPrefs: {},
  });
  const levels = [];
  const act = libraryActions({ ...store, setLevelUp: (l) => levels.push(l) });
  return { store, act, levels };
}
const book = (s, id) => s.state.books.find(b => b.id === id);

// Завершение: XP, новый уровень, снятие отслеживания; откат забирает XP.
{
  const { store, act, levels } = fresh();
  act.completeLibraryItem("book", "b1");
  eq("статус — завершено", book(store, "b1").status, "done");
  eq("отслеживание снято", book(store, "b1").tracked, false);
  eq("XP начислен в сферу", store.state.spheres[0].xp, toNext + 5);
  eq("показано окно нового уровня", levels, [2]);
  eq("записана дата завершения — для отчёта за месяц", book(store, "b1").completedAt, TODAY);
  eq("в тосте — XP", store.lastToast().text, "Отмечено как завершённое: +10 XP");
  store.undoLast();
  eq("откат вернул статус и отслеживание", [book(store, "b1").status, book(store, "b1").tracked], ["active", true]);
  eq("откат снял дату завершения", book(store, "b1").completedAt, null);
  eq("откат забрал XP", store.state.spheres[0].xp, toNext - 5);
  const toasts = store.toasts.length;
  act.completeLibraryItem("book", "b1");
  act.completeLibraryItem("book", "b1");
  eq("повторное завершение ничего не начисляет", [store.toasts.length - toasts, store.state.spheres[0].xp], [1, toNext + 5]);
}

// Правка записи: «прочитано» снимает отслеживание, прогресс не выше максимума, дневник страниц.
{
  const { store, act } = fresh();
  act.updateLibraryItem("book", "b1", { pagesRead: 30 });
  eq("в дневник записана дельта за сегодня", store.state.readingLog.map(e => [e.bookId, e.date, e.pages]), [["b1", TODAY, 20]]);
  act.updateLibraryItem("book", "b1", { pagesRead: 35 });
  eq("за тот же день — одна запись", store.state.readingLog.map(e => e.pages), [25]);
  act.updateLibraryItem("book", "b1", { pagesRead: 500 });
  eq("прогресс не выше числа страниц", book(store, "b1").pagesRead, 100);
  act.updateLibraryItem("book", "b2", { pagesRead: 50 });
  eq("без цели по чтению дневник не ведётся", store.state.readingLog.length, 1);
  act.updateLibraryItem("book", "b2", { status: "done" });
  eq("смена статуса на «завершено» ставит дату", book(store, "b2").completedAt, TODAY);
  act.updateLibraryItem("book", "b2", { status: "active" });
  eq("уход из «завершено» дату снимает", book(store, "b2").completedAt, null);
  act.updateLibraryItem("book", "b2", { rating: 4 });
  eq("правка без смены статуса дату не трогает", "completedAt" in book(store, "b2") && book(store, "b2").completedAt, null);
  act.updateLibraryItem("book", "b1", { status: "dropped" });
  eq("брошенное больше не отслеживается", book(store, "b1").tracked, false);
}

// Цель по чтению.
{
  const { store, act } = fresh();
  act.setBookReadingGoal("b2", { endDate: "2099-01-01", pagesPerDay: "15" });
  eq("цель задана с сегодняшнего дня", book(store, "b2").readingGoal, { startDate: TODAY, endDate: "2099-01-01", pagesPerDay: 15 });
  act.clearBookReadingGoal("b2");
  eq("цель снята", book(store, "b2").readingGoal, null);
}

// Отслеживание.
{
  const { store, act } = fresh();
  act.setTracked("book", "b2", true);
  eq("отслеживание «хочу» переводит в «сейчас»", [book(store, "b2").tracked, book(store, "b2").status], [true, "active"]);
  act.setTracked("book", "b2", false);
  eq("снятие отслеживания статус не трогает", book(store, "b2").status, "active");
  act.swapTracked("movie", "m1", "game", "g1");
  eq("замена между видами: старое снято", store.state.movies[0].tracked, false);
  eq("замена между видами: новое отслеживается и из «купить» стало «сейчас»", [store.state.games[0].tracked, store.state.games[0].status], [true, "active"]);
}

// Добавление и удаление записи, заметки.
{
  const { store, act } = fresh();
  act.addLibraryItem("game", { title: "Celeste" });
  eq("запись добавлена в начало, «хочу»", [store.state.games[0].title, store.state.games[0].status], ["Celeste", "want"]);
  act.deleteLibraryItem("book", "b1");
  eq("запись удалена", store.state.books.map(b => b.id), ["b2"]);
  store.undoLast();
  eq("откат вернул на место", store.state.books.map(b => b.id), ["b1", "b2"]);
  act.addLibraryNote("book", "b1", "Мысль");
  const note = book(store, "b1").notes[0];
  eq("заметка добавлена с сегодняшней датой", [note.text, note.date], ["Мысль", TODAY]);
  act.updateLibraryNote("book", "b1", note.id, "Мысль 2");
  eq("заметка изменена", book(store, "b1").notes[0].text, "Мысль 2");
  act.deleteLibraryNote("book", "b1", note.id);
  eq("заметка удалена", book(store, "b1").notes.length, 0);
}

// Коллекции: удаление отвязывает записи, откат возвращает привязки.
{
  const { store, act } = fresh();
  act.deleteLibraryCollection("c1");
  eq("коллекция удалена", store.state.libraryCollections.length, 0);
  eq("записи остались, но отвязаны", [store.state.books.length, book(store, "b2").collectionId, book(store, "b2").branchId], [2, null, null]);
  eq("в тосте — число отвязанных", store.lastToast().text, "Коллекция удалена, записей отвязано: 3");
  store.undoLast();
  eq("откат вернул коллекцию и привязки", [store.state.libraryCollections.length, book(store, "b2").collectionId, book(store, "b2").branchId], [1, "c1", "br1"]);
}

// Ветки: кольцо не создаётся, удаление ветки откатывается.
{
  const { store, act } = fresh();
  act.updateCollectionBranch("c1", "br1", { anchorId: "b2" });
  eq("ветку нельзя привязать к записи внутри неё", store.state.libraryCollections[0].branches[0].anchorId, "b1");
  act.moveCollectionBranch("c1", "br1", "b2", ["br1"]);
  eq("и перенос внутрь себя не проходит", store.state.libraryCollections[0].branches[0].anchorId, "b1");
  act.updateCollectionBranch("c1", "br1", { name: "Станислав Лем" });
  eq("обычная правка ветки проходит", store.state.libraryCollections[0].branches[0].name, "Станислав Лем");
  act.addCollectionBranch("c1", "Стругацкие", "m1");
  eq("ветка добавлена в конец", store.state.libraryCollections[0].branches.map(b => [b.name, b.order]), [["Станислав Лем", 0], ["Стругацкие", 1]]);
  act.deleteCollectionBranch("c1", "br1");
  eq("ветка удалена", store.state.libraryCollections[0].branches.length, 1);
  store.undoLast();
  eq("откат вернул ветку на место", store.state.libraryCollections[0].branches[0].id, "br1");
}

// Записи в коллекции: добавление пачкой, удаление с откатом.
{
  const { store, act } = fresh();
  act.addItemsToCollection("c1", null, [{ libKind: "game", id: "g1" }]);
  eq("запись встала в конец основной линии", [store.state.games[0].collectionId, store.state.games[0].collectionOrder], ["c1", 2]);
  act.removeItemFromCollection("book", "b2");
  eq("запись убрана из коллекции", [book(store, "b2").collectionId, book(store, "b2").branchId], [null, null]);
  store.undoLast();
  eq("откат вернул коллекцию и ветку", [book(store, "b2").collectionId, book(store, "b2").branchId], ["c1", "br1"]);
  act.applyCollectionOrder([{ libKind: "movie", id: "m1", collectionOrder: 0 }, { libKind: "book", id: "b1", collectionOrder: 1 }], null);
  eq("порядок применён", [store.state.movies[0].collectionOrder, book(store, "b1").collectionOrder], [0, 1]);
}

done();
