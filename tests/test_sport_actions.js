/* Действия раздела «Спорт». Проверяется: замер задним числом не перетирает текущий вес, план и запись
   журнала создаются по шаблону снимком и с одинаковыми id при повторном прогоне обновления, последний
   отмеченный подход закрывает сессию и план с наградой, удаление откатывает и награду. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const { sportActions } = load("sport/actions.js");
const { buildPlanSessions } = load("sport/model.js");
const { replayIds } = load("core/basics.js");

function fresh() {
  const store = makeStore({
    profile: { currency: 0, body: { weight: 80 } },
    spheres: [{ id: "health", xp: 0 }],
    bodyLog: [{ id: "m1", date: "2026-09-01", weight: 80 }],
    sportGoal: {},
    exercises: [
      { id: "e1", name: "Присед", kind: "strength", defaultLoad: { sets: 2, reps: 8, weight: 60 } },
      { id: "e2", name: "Бег", kind: "cardio", defaultLoad: { sets: 1, minutes: 20 } },
    ],
    workouts: [{ id: "w1", title: "Ноги", items: [{ exerciseId: "e1", sets: 3, reps: 5, weight: 100 }, { exerciseId: "e2", sets: 1 }] }],
    workoutLog: [],
    trainingPlans: [],
    uiPrefs: {},
  });
  return { store, act: sportActions(store) };
}
const ids = (list) => list.map(x => x.id);

// Генератор id: в каждом прогоне — та же последовательность.
{
  const ids1 = replayIds();
  const a = ids1(), b = ids1();
  eq("replayIds: повторный прогон получает те же id", [a(), a(), a()], [b(), b(), b()]);
  const x = a();
  eq("replayIds: дальше последовательности — новые id", x !== a(), true);
}

// Замеры: старый замер не перетирает текущий вес; откат возвращает вес.
{
  const { store, act } = fresh();
  act.addBodyMeasure({ date: "2026-08-01", weight: 90 });
  eq("замер задним числом не меняет текущий вес", store.state.profile.body.weight, 80);
  eq("журнал замеров отсортирован по дате", store.state.bodyLog.map(m => m.date), ["2026-08-01", "2026-09-01"]);
  act.addBodyMeasure({ date: "2026-10-01", weight: 78 });
  eq("свежий замер меняет текущий вес", store.state.profile.body.weight, 78);
  store.undoLast();
  eq("откат свежего замера вернул прежний вес", store.state.profile.body.weight, 80);
  act.deleteBodyMeasure("m1");
  eq("после удаления текущий вес — из оставшегося замера", store.state.profile.body.weight, 90);
  store.undoLast();
  eq("откат удаления вернул вес", store.state.profile.body.weight, 80);
}

// Запись журнала по шаблону — снимок состава.
{
  const { store, act } = fresh();
  const id = act.addWorkoutSession({ date: "2026-10-05", workoutId: "w1" });
  const s = store.state.workoutLog[0];
  eq("вернулся id созданной записи", s.id, id);
  eq("название из шаблона", s.title, "Ноги");
  eq("подходы из шаблона", s.entries.map(e => e.sets.length), [3, 1]);
  eq("вес и повторы из шаблона", [s.entries[0].sets[0].reps, s.entries[0].sets[0].weight], [5, 100]);
  eq("кардио — минуты по умолчанию", s.entries[1].sets[0].minutes, 10);
  const all = [s.id, ...s.entries.map(e => e.id), ...s.entries.flatMap(e => e.sets.map(st => st.id))];
  eq("все id разные", new Set(all).size, all.length);
  act.updateWorkout("w1", { title: "Ноги 2" });
  eq("правка шаблона не меняет запись журнала", store.state.workoutLog[0].title, "Ноги");
  store.undoLast();
  eq("откат убрал запись", store.state.workoutLog.length, 0);
  act.addWorkoutSession({ date: "2026-10-05" });
  eq("свободная тренировка — без упражнений", [store.state.workoutLog[0].title, store.state.workoutLog[0].entries.length], ["Свободная тренировка", 0]);
}

// Подходы и упражнения внутри записи.
{
  const { store, act } = fresh();
  const sid = act.addWorkoutSession({ date: "2026-10-05" });
  act.addWorkoutEntry(sid, "e1");
  const entry = () => store.state.workoutLog[0].entries[0];
  eq("упражнение добавлено с нагрузкой по умолчанию", entry().sets.map(st => [st.reps, st.weight]), [[8, 60], [8, 60]]);
  act.updateWorkoutSet(sid, entry().id, entry().sets[1].id, { weight: 70 });
  act.addWorkoutSet(sid, entry().id);
  eq("новый подход копирует последний", entry().sets[2].weight, 70);
  eq("у нового подхода свой id", new Set(entry().sets.map(st => st.id)).size, 3);
  act.removeWorkoutSet(sid, entry().id, entry().sets[0].id);
  eq("подход удалён", entry().sets.length, 2);
  act.toggleWorkoutSet(sid, entry().id, entry().sets[0].id);
  eq("часть подходов — сессия ещё запланирована", store.state.workoutLog[0].status, "planned");
  act.toggleWorkoutSet(sid, entry().id, entry().sets[1].id);
  eq("все подходы — сессия выполнена", store.state.workoutLog[0].status, "done");
  act.removeWorkoutEntry(sid, entry().id);
  eq("упражнение убрано из записи", store.state.workoutLog[0].entries.length, 0);
  act.addWorkoutEntry(sid, "нет");
  eq("несуществующее упражнение не добавляется", store.state.workoutLog[0].entries.length, 0);
}

// План: создание по расписанию, закрытие с наградой, удаление записи отбирает награду.
{
  const { store, act } = fresh();
  const builder = (plan, prev, newId) => buildPlanSessions(plan, [{ weekday: 1, workoutId: "w1" }], 2, "2026-10-05", prev.exercises, prev.workouts, newId);
  const planId = act.addTrainingPlan({ title: "Сила", startDate: "2026-10-05", weeks: 2 }, builder);
  eq("план создан", store.state.trainingPlans[0].id, planId);
  eq("сессии плана — по одной в неделю", store.state.workoutLog.map(w => w.date), ["2026-10-05", "2026-10-12"]);
  eq("сессии привязаны к плану", store.state.workoutLog.every(w => w.planId === planId), true);
  const [s1, s2] = store.state.workoutLog;
  act.updateWorkoutSession(s1.id, { status: "done" });
  eq("план ещё не закрыт", store.state.trainingPlans[0].status, "active");
  act.updateWorkoutSession(s2.id, { status: "done" });
  eq("последняя сессия закрыла план", store.state.trainingPlans[0].status, "done");
  const gold = store.state.profile.currency, xp = store.state.spheres[0].xp;
  eq("за план выдана награда", gold > 0 && xp > 0, true);
  eq("тост о пройденном плане", store.lastToast().text.startsWith("План пройден"), true);
  act.updateWorkoutSession(s2.id, { status: "planned" });
  act.deleteWorkoutSession(s2.id);
  eq("удаление последней запланированной сессии снова закрыло план", store.state.trainingPlans[0].status, "done");
  eq("но награда повторно не выдана", store.state.profile.currency, gold);
}

// Удаление плана: вместе с сессиями или без, откат возвращает как было.
{
  const { store, act } = fresh();
  const builder = (plan, prev, newId) => buildPlanSessions(plan, [{ weekday: 1, workoutId: "w1" }], 2, "2026-10-05", prev.exercises, prev.workouts, newId);
  const planId = act.addTrainingPlan({ title: "Сила", startDate: "2026-10-05", weeks: 2 }, builder);
  const before = JSON.stringify(store.state.workoutLog);
  act.deleteTrainingPlan(planId, false);
  eq("план удалён, тренировки остались свободными", [store.state.trainingPlans.length, store.state.workoutLog.every(w => !w.planId)], [0, true]);
  store.undoLast();
  eq("откат вернул привязку тренировок", JSON.stringify(store.state.workoutLog), before);
  act.deleteTrainingPlan(planId, true);
  eq("план удалён вместе с тренировками", [store.state.trainingPlans.length, store.state.workoutLog.length], [0, 0]);
  store.undoLast();
  eq("откат вернул план и тренировки", [store.state.trainingPlans.length, JSON.stringify(store.state.workoutLog)], [1, before]);
}

// Справочник: упражнения и шаблоны с откатом на место.
{
  const { store, act } = fresh();
  act.deleteExercise("e1");
  eq("упражнение удалено", ids(store.state.exercises), ["e2"]);
  store.undoLast();
  eq("откат вернул упражнение на место", ids(store.state.exercises), ["e1", "e2"]);
  const exId = act.addExercise({ name: "Жим" });
  eq("новое упражнение — в начале", store.state.exercises[0].id, exId);
  act.deleteWorkout("w1");
  eq("шаблон удалён", store.state.workouts.length, 0);
  store.undoLast();
  eq("откат вернул шаблон", ids(store.state.workouts), ["w1"]);
}

// Цель и настройки.
{
  const { store, act } = fresh();
  act.setSportGoal({ sessionsPerWeek: 4 });
  eq("цель обновлена поверх значений по умолчанию", [store.state.sportGoal.sessionsPerWeek, store.state.sportGoal.minutesPerWeek], [4, 180]);
  act.updateBody({ height: 180 });
  eq("параметры тела обновлены, вес не тронут", [store.state.profile.body.height, store.state.profile.body.weight], [180, 80]);
  act.updateSportPrefs({ view: "plans" });
  eq("вид раздела записан", store.state.uiPrefs.sport.view, "plans");
}

done();
