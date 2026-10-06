/* Импорт части чужого сохранения и оставшиеся мелкие действия (календарь, вкладки, резервная копия).
   Проверяется: импорт только добавляет, каждой записи — свой новый id, чужой прогресс не переносится,
   продукты блюд сопоставляются по названию, коллекции восстанавливаются по индексам из файла. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const { shareActions } = load("share/actions.js");
const { calendarActions } = load("calendar/actions.js");
const { settingsActions } = load("settings/actions.js");
const { peopleActions } = load("people/actions.js");
const { buildSharePayload, parseSharePayload } = load("share/model.js");
const { todayStr } = load("core/basics.js");
const { fullTabOrder } = load("core/tabs.js");
const { defaultCalendarPrefs } = load("core/prefs.js");

const T = todayStr();
function fresh() {
  const store = makeStore({
    people: [{ id: "p1", name: "Аня", archived: false }],
    spheres: [{ id: "health", xp: 0 }],
    books: [{ id: "b1", title: "Дюна" }], games: [], movies: [],
    libraryCollections: [{ id: "c0", name: "Старая" }],
    foods: [{ id: "f1", name: "Рис", caloriesPer100: 130 }],
    dishes: [],
    uiPrefs: {},
  });
  const act = { ...shareActions(store), ...calendarActions(store), ...settingsActions(store), ...peopleActions(store) };
  return { store, act };
}

// Люди: добавляются в конец, прогресс с нуля, новые id.
{
  const { store, act } = fresh();
  act.importShared("people", { items: [{ id: "чужой", name: "Боря", xp: 500, birthday: "1990-05-05" }, {}] });
  const [, a, b] = store.state.people;
  eq("люди добавлены после имеющихся", store.state.people.map(p => p.name), ["Аня", "Боря", "Без имени"]);
  eq("чужой id не переносится", a.id !== "чужой", true);
  eq("id у записей разные", a.id !== b.id, true);
  eq("прогресс — с нуля, порядок — после активных", [a.xp, a.order, b.order, a.createdAt], [0, 1, 2, T]);
  eq("день рождения перенесён", a.birthday, "1990-05-05");
  eq("тост с числом записей", store.lastToast().text, "Добавлено записей: 2");
}

// Блюда: туда и обратно через файл; продукт с тем же названием переиспользуется.
{
  const src = {
    foods: [{ id: "x1", name: " рис ", caloriesPer100: 999 }, { id: "x2", name: "Курица", caloriesPer100: 200 }],
    dishes: [{ id: "d1", name: "Плов", emoji: "🍛", ingredients: [{ foodId: "x1", grams: 100 }, { foodId: "x2", grams: 150 }, { foodId: "__water__", grams: 50 }] }],
  };
  const payload = buildSharePayload("dishes", src.dishes, ["name", "emoji", "ingredients"], src);
  const parsed = parseSharePayload(JSON.stringify(payload), "dishes");
  eq("файл блюд читается", parsed.ok, true);
  const { store, act } = fresh();
  act.importShared("dishes", parsed);
  eq("продукт «рис» не задублирован, «Курица» создана", store.state.foods.map(f => f.name), ["Рис", "Курица"]);
  eq("свой продукт не перезаписан чужими цифрами", store.state.foods[0].caloriesPer100, 130);
  const dish = store.state.dishes[0];
  const chicken = store.state.foods[1];
  eq("состав блюда ссылается на локальные продукты и воду", dish.ingredients, [{ foodId: "f1", grams: 100 }, { foodId: chicken.id, grams: 150 }, { foodId: "__water__", grams: 50 }]);
  eq("у блюда и нового продукта разные id", dish.id !== chicken.id, true);
}

// Библиотека: новые записи, коллекция с веткой, «использовать имеющуюся».
{
  const { store, act } = fresh();
  act.importShared("library", {
    items: [
      { libKind: "book", title: "Дюна", collection: 0 },
      { libKind: "book", title: "Мессия Дюны", collection: 0 },
      { libKind: "movie", title: "Дюна (фильм)", collection: 0, branch: 0, sphereId: "нет-такой" },
    ],
    collections: [{ name: "Дюна", branches: [{ name: "Экранизации", anchor: 0 }, { name: "Битая", anchor: 99 }] }],
  }, { 0: "b1" });
  eq("переиспользованная книга не задублирована", store.state.books.map(b => b.title), ["Дюна", "Мессия Дюны"]);
  eq("фильм добавлен", store.state.movies.map(m => m.title), ["Дюна (фильм)"]);
  eq("несуществующая сфера не привязана", store.state.movies[0].sphereId, null);
  const coll = store.state.libraryCollections[1];
  eq("коллекция добавлена после имеющихся", [store.state.libraryCollections.length, coll.name, coll.order], [2, "Дюна", 1]);
  eq("ветка привязана к имеющейся книге", coll.branches[0].anchorId, "b1");
  eq("битая привязка — ветка без привязки", coll.branches[1].anchorId, null);
  eq("имеющаяся книга вошла в коллекцию", store.state.books[0].collectionId, coll.id);
  eq("фильм — в ветке", [store.state.movies[0].collectionId, store.state.movies[0].branchId], [coll.id, coll.branches[0].id]);
  const allIds = [coll.id, ...coll.branches.map(b => b.id), store.state.books[1].id, store.state.movies[0].id];
  eq("все новые id разные", new Set(allIds).size, allIds.length);
}

// Календарь: настройки вида поверх значений по умолчанию.
{
  const { store, act } = fresh();
  act.setCalendarView("week");
  act.setCalendarFilters({ quests: false });
  const cal = store.state.uiPrefs.calendar;
  eq("вид записан", cal.view, "week");
  eq("фильтр записан, остальные по умолчанию", cal.filters, { ...defaultCalendarPrefs().filters, quests: false });
  act.toggleKanbanColumn("done");
  act.toggleKanbanColumn("later");
  act.toggleKanbanColumn("done");
  eq("колонки канбана сворачиваются и разворачиваются", store.state.uiPrefs.calendar.kanbanCollapsed, ["later"]);
  act.setCalendarMonthPanel({ width: 300 });
  eq("ширина панели месяца записана", store.state.uiPrefs.calendar.monthPanel.width, 300);
}

// Вкладки: «Хаб» не двигается и не скрывается.
{
  const { store, act } = fresh();
  const order = fullTabOrder(store.state);
  const [, first, second] = order;
  act.reorderTab(second, first);
  eq("вкладки переставлены, «Хаб» первый", fullTabOrder(store.state).slice(0, 3), ["hub", second, first]);
  act.reorderTab("hub", first);
  eq("«Хаб» не двигается", fullTabOrder(store.state)[0], "hub");
  act.toggleTabHidden("hub");
  eq("«Хаб» не скрывается", (store.state.uiPrefs.tabs.hidden || []).includes("hub"), false);
  act.toggleTabHidden(first);
  eq("вкладка скрыта", store.state.uiPrefs.tabs.hidden, [first]);
}

// Резервная копия, свёрнутые секции карточки человека.
{
  const { store, act } = fresh();
  act.markBackupDone();
  eq("дата резервной копии — сегодня", store.state.lastBackupAt, T);
  act.toggleCollapsedSection("debts");
  eq("секция свёрнута", store.state.uiPrefs.peopleDetail.collapsedSections, ["debts"]);
  act.toggleCollapsedSection("debts");
  eq("секция развёрнута", store.state.uiPrefs.peopleDetail.collapsedSections, []);
}

done();
