/* Действия раздела «Привычки». Проверяется: награда за отметку — не чаще раза в день, даже если чекбокс
   щёлкали туда-обратно; откат забирает награду; привязанная привычка ручной отметкой не меняется. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const { habitActions } = load("habits/actions.js");
const { todayStr } = load("core/basics.js");
const { levelFromXp } = load("core/xp.js");

const T = todayStr();
const toNext = levelFromXp(0).xpForNext;
function fresh() {
  const store = makeStore({
    profile: { currency: 10 },
    spheres: [{ id: "s1", xp: toNext - 3 }, { id: "s2", xp: 0 }],
    people: [{ id: "p1", xp: 0 }],
    habits: [
      { id: "h1", sphereId: "s1", personId: "p1", logs: [], claimedDates: [] },
      { id: "h2", sphereId: "s2", logs: [], claimedDates: [] },
      { id: "h3", sphereId: "s2", linkedKind: "water", logs: [], claimedDates: [] },
    ],
  });
  const levels = [];
  return { store, levels, act: habitActions({ ...store, setLevelUp: l => levels.push(l) }) };
}
const habit = (s, id) => s.state.habits.find(h => h.id === id);

{
  const { store, act, levels } = fresh();
  act.toggleHabitToday("h1");
  eq("отмечено за сегодня", habit(store, "h1").logs, [T]);
  eq("награда: XP в сферу и человеку, золото", [store.state.spheres[0].xp, store.state.people[0].xp, store.state.profile.currency], [toNext + 5, 8, 13]);
  eq("окно нового уровня", levels, [2]);
  eq("тост с откатом", store.lastToast().text, "Привычка отмечена: +8 XP");
  act.toggleHabitToday("h1");
  eq("снятие отметки", habit(store, "h1").logs, []);
  eq("снятие отметки награду не забирает", store.state.profile.currency, 13);
  const toasts = store.toasts.length;
  act.toggleHabitToday("h1");
  eq("повторная отметка за день — без награды", [store.state.profile.currency, store.toasts.length], [13, toasts]);
  eq("но отметка стоит", habit(store, "h1").logs, [T]);
}

{
  const { store, act, levels } = fresh();
  store.state.spheres[0].xp = 0;   // уровень считается по сумме всех сфер — уводим её от порога
  act.toggleHabitToday("h2");
  eq("без человека XP только в сферу", [store.state.spheres[1].xp, store.state.people[0].xp], [8, 0]);
  eq("уровень не поднялся — окна нет", levels, []);
  store.undoLast();
  eq("откат снял отметку и право на награду", [habit(store, "h2").logs, habit(store, "h2").claimedDates], [[], []]);
  eq("откат забрал XP и золото", [store.state.spheres[1].xp, store.state.profile.currency], [0, 10]);
  act.toggleHabitToday("h2");
  eq("после отката награда снова доступна", store.state.profile.currency, 13);
}

{
  const { store, act } = fresh();
  act.toggleHabitToday("h3");
  eq("привязанная привычка ручной отметкой не меняется", [habit(store, "h3").logs, store.state.profile.currency], [[], 10]);
}

{
  const { store, act } = fresh();
  act.deleteHabit("h2");
  eq("привычка удалена", store.state.habits.map(h => h.id), ["h1", "h3"]);
  store.undoLast();
  eq("откат вернул на место", store.state.habits.map(h => h.id), ["h1", "h2", "h3"]);
  act.addHabit({ title: "Зарядка" });
  eq("новая привычка — в начале, без отметок", [store.state.habits[0].title, store.state.habits[0].logs], ["Зарядка", []]);
  act.updateHabit("h1", { title: "Чтение" });
  eq("привычка изменена", habit(store, "h1").title, "Чтение");
}

done();
