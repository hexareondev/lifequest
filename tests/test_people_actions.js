/* Действия раздела «Люди». Проверяется: архив и удаление снимают невыполненный квест-поздравление
   и возвращают его одним откатом, выключение отслеживания ДР освобождает год, «Другое» не удаляется. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const { peopleActions } = load("people/actions.js");

function fresh() {
  const store = makeStore({
    people: [
      { id: "p1", name: "Аня", order: 0, archived: false, trackBirthday: true, birthdayQuestYears: [2026] },
      { id: "p2", name: "Боря", order: 1, archived: false, trackBirthday: false, birthdayQuestYears: [] },
      { id: "p3", name: "Вера", order: 2, archived: false },
    ],
    quests: [
      { id: "q1", linkedKind: "birthdayGreeting", linkedRefId: "p1", status: "active", deadline: "2026-11-02" },
      { id: "q0", linkedKind: "birthdayGreeting", linkedRefId: "p1", status: "done", deadline: "2025-11-02" },
      { id: "q2", status: "active" },
    ],
    peopleRelations: [{ name: "Друг", color: "sky" }, { name: "Семья", color: "rose" }, { name: "Другое", color: "zinc" }],
    holidaySubscriptions: {},
    uiPrefs: {},
  });
  return { store, act: peopleActions(store) };
}
const ids = (list) => list.map(x => x.id);
const person = (s, id) => s.state.people.find(p => p.id === id);

// Архив: снимает активный квест-поздравление и отслеживание, откат возвращает всё.
{
  const { store, act } = fresh();
  act.archivePerson("p1");
  eq("человек в архиве", person(store, "p1").archived, true);
  eq("отслеживание ДР снято", person(store, "p1").trackBirthday, false);
  eq("год квеста освобождён", person(store, "p1").birthdayQuestYears, []);
  eq("активный квест снят, выполненный остался", ids(store.state.quests), ["q0", "q2"]);
  store.undoLast();
  eq("откат вернул из архива", person(store, "p1").archived, false);
  eq("откат вернул отслеживание", person(store, "p1").trackBirthday, true);
  eq("откат вернул год", person(store, "p1").birthdayQuestYears, [2026]);
  eq("откат вернул квест", ids(store.state.quests), ["q1", "q0", "q2"]);
}

// Ручной возврат из архива — в конец активного списка.
{
  const { store, act } = fresh();
  act.archivePerson("p1");
  act.unarchivePerson("p1");
  eq("вернулся в конец списка", person(store, "p1").order, 2);
  eq("отслеживание само не включилось", person(store, "p1").trackBirthday, false);
}

// Удаление: квест-поздравление уходит вместе с человеком и возвращается одним откатом.
{
  const { store, act } = fresh();
  act.deletePerson("p1");
  eq("человек удалён", ids(store.state.people), ["p2", "p3"]);
  eq("невыполненный квест удалён вместе с ним", ids(store.state.quests), ["q0", "q2"]);
  store.undoLast();
  eq("откат вернул человека", person(store, "p1").name, "Аня");
  eq("и квест", ids(store.state.quests), ["q1", "q0", "q2"]);
}

// Выключение и включение отслеживания ДР.
{
  const { store, act } = fresh();
  act.togglePersonBirthdayTracking("p1");
  eq("отслеживание выключено", person(store, "p1").trackBirthday, false);
  eq("год освобождён — квест сможет появиться снова", person(store, "p1").birthdayQuestYears, []);
  eq("квест снят", ids(store.state.quests), ["q0", "q2"]);
  act.togglePersonBirthdayTracking("p1");
  eq("отслеживание включено", person(store, "p1").trackBirthday, true);
  const toasts = store.toasts.length;
  act.togglePersonBirthdayTracking("p2");
  act.togglePersonBirthdayTracking("p2");
  eq("без квеста выключение проходит без тоста", store.toasts.length, toasts);
}

// Перестановка активных людей.
{
  const { store, act } = fresh();
  act.reorderPerson("p3", "p1");
  const order = store.state.people.slice().sort((a, b) => a.order - b.order).map(p => p.id);
  eq("человек переставлен", order, ["p3", "p1", "p2"]);
  act.addPerson({ name: "Гоша" });
  eq("новый человек — в конец активного списка", store.state.people[0].order, 3);
}

// Типы отношений.
{
  const { store, act } = fresh();
  act.addRelation({ name: "друг", color: "amber" });
  eq("дубликат без учёта регистра не добавляется", store.state.peopleRelations.length, 3);
  act.deleteRelation("Другое");
  eq("«Другое» не удаляется", store.state.peopleRelations.length, 3);
  act.deleteRelation("Друг");
  eq("тип удалён", store.state.peopleRelations.map(r => r.name), ["Семья", "Другое"]);
  store.undoLast();
  eq("откат вернул на место", store.state.peopleRelations.map(r => r.name), ["Друг", "Семья", "Другое"]);
}

// Люди праздника.
{
  const { store, act } = fresh();
  act.setHolidayPeople("h1", ["p1", "p2"]);
  eq("состав праздника записан", store.state.holidaySubscriptions.h1.personIds, ["p1", "p2"]);
  eq("подписка по умолчанию включена", store.state.holidaySubscriptions.h1.subscribed, true);
}

// Подписка на праздник: отписка снимает невыполненный квест и освобождает год; откат возвращает.
{
  const store = makeStore({
    people: [], peopleRelations: [], uiPrefs: {},
    holidaySubscriptions: {},
    quests: [
      { id: "hq", linkedKind: "holidayGreeting", linkedRefId: "new_year", status: "active", deadline: "2027-01-01" },
      { id: "q2", status: "active" },
    ],
  });
  const act = peopleActions(store);
  act.toggleHolidaySubscription("new_year");
  eq("подписка включена", store.state.holidaySubscriptions.new_year, { personIds: [], questYears: [], subscribed: true });
  act.setHolidayPeople("new_year", ["p1"]);
  store.state.holidaySubscriptions.new_year.questYears = [2027];
  act.toggleHolidaySubscription("new_year");
  eq("отписка: флаг снят, год освобождён, люди сохранены", store.state.holidaySubscriptions.new_year, { personIds: ["p1"], questYears: [], subscribed: false });
  eq("отписка сняла квест-поздравление", ids(store.state.quests), ["q2"]);
  eq("в тосте — название праздника", store.lastToast().text, "Отписка от «Новый год», квест-поздравление снят");
  store.undoLast();
  eq("откат вернул подписку и год", [store.state.holidaySubscriptions.new_year.subscribed, store.state.holidaySubscriptions.new_year.questYears], [true, [2027]]);
  eq("откат вернул квест", ids(store.state.quests), ["hq", "q2"]);
  act.toggleHolidaySubscription("new_year");
  act.toggleHolidaySubscription("new_year");
  eq("повторная подписка после отписки работает", store.state.holidaySubscriptions.new_year.subscribed, true);
}

done();
