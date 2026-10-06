// Спорт: физический профиль, справочник упражнений, шаблоны и журнал тренировок. Модель без
// разметки.

import { Bike, Dumbbell, Waves } from "lucide-react";
import { addDaysToDateStr, clamp, todayStr, uid } from "../core/basics.js";

// Раздел строится на двух уже работающих механизмах и НЕ копирует их: награда по ярусам берётся
// у Питания (computeLinkedHabitSettlement), импорт плана — у Кампаний. Здесь только то, чего в
// приложении ещё не было: физический профиль, справочник упражнений, шаблоны и журнал тренировок.

export const EXERCISE_KINDS = {
  strength: { label:"Силовое",  icon:Dumbbell, unit:"reps" },
  cardio:   { label:"Кардио",   icon:Bike,     unit:"time" },
  mobility: { label:"Растяжка", icon:Waves,    unit:"time" },
};
export const EXERCISE_KIND_ORDER = ["strength","cardio","mobility"];
export const MUSCLE_GROUPS = {
  chest:"Грудь", back:"Спина", legs:"Ноги", glutes:"Ягодицы", shoulders:"Плечи",
  arms:"Руки", core:"Пресс", fullbody:"Всё тело", cardio:"Кардио",
};
export const MUSCLE_GROUP_ORDER = Object.keys(MUSCLE_GROUPS);

export const BODY_SEX = { male:"Мужской", female:"Женский" };
export const BODY_LEVELS = { beginner:"Начинающий", regular:"Занимаюсь регулярно", advanced:"Продвинутый" };
export const BODY_FOCUS = {
  strength:"Сила", mass:"Набор массы", weightloss:"Похудение",
  endurance:"Выносливость", health:"Общее здоровье",
};
export const BODY_EQUIPMENT = {
  none:"Только вес тела", dumbbells:"Гантели", barbell:"Штанга", bands:"Резинки",
  pullupBar:"Турник", machines:"Тренажёры", gym:"Зал", cardioMachine:"Кардиотренажёр",
};
// Единицы только метрические: переключение на фунты и мили протекло бы в журнал, справочник и
// формат импорта, а пересчёт исторических записей всегда врёт на округлениях.
export function defaultBody() {
  return {
    sex:null, birthDate:null, height:null, weight:null,
    level:"regular", focus:"health", equipment:[], limitations:"", trainingDays:[],
  };
}
// Возраст считается из даты рождения и нигде не хранится числом — иначе он молча протухает.
export function ageFromBirthDate(birthDate, today) {
  if (!birthDate) return null;
  const t = today || todayStr();
  let age = Number(t.slice(0,4)) - Number(birthDate.slice(0,4));
  if (t.slice(5) < birthDate.slice(5)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}
export function bmiOf(heightCm, weightKg) {
  const h = Number(heightCm)||0, w = Number(weightKg)||0;
  if (h <= 0 || w <= 0) return null;
  return Math.round((w / Math.pow(h/100, 2)) * 10) / 10;
}
// Текущий вес — производное от журнала замеров: последняя по дате запись с заполненным весом.
// Поля замера намеренно необязательные: на процент жира и обхваты нужен либо инвентарь, либо
// медосмотр, и требовать их значило бы, что форму просто перестанут заполнять.
export function latestBodyMeasure(bodyLog) {
  const withWeight = (bodyLog||[]).filter(m => m.weight != null && m.weight !== "");
  if (!withWeight.length) return null;
  return withWeight.slice().sort((a,b) => a.date.localeCompare(b.date))[withWeight.length-1];
}
export function bodyWeightOf(state) {
  const last = latestBodyMeasure(state.bodyLog);
  if (last) return Number(last.weight);
  const w = state.profile && state.profile.body && state.profile.body.weight;
  return w != null && w !== "" ? Number(w) : null;
}

/* ---------------------------- Планы тренировок ---------------------------- */
// План — аналог кампании: материализуется один раз в конкретные сессии журнала и дальше за ними
// не следит. Сессия плана — это обычная запись workoutLog с planId; журнал, статистика и награда
// работают с ней без единой правки.
const PLAN_SESSION_XP = 10;
const PLAN_SESSION_GOLD = 4;
const PLAN_PERFECT_MULTIPLIER = 1.5;

export function planSessionsOf(log, planId) {
  return (log||[]).filter(w => w.planId === planId).slice().sort((a,b) => a.date.localeCompare(b.date));
}
// Награда за план считается по САМОЙ ДЛИННОЙ серии подряд выполненных сессий, а не по их общему
// числу: восемнадцать тренировок вразнобой должны стоить меньше, чем двенадцать подряд. Пропуск
// и оставшаяся невыполненной сессия серию обрывают.
export function planStats(log, planId) {
  const list = planSessionsOf(log, planId);
  let maxStreak = 0, run = 0, done = 0, planned = 0;
  list.forEach(w => {
    if (w.status === "done") { done++; run++; if (run > maxStreak) maxStreak = run; }
    else { run = 0; if (w.status === "planned") planned++; }
  });
  return {
    total: list.length, done, planned,
    skipped: list.filter(w => w.status==="skipped").length,
    maxStreak,
    perfect: list.length > 0 && maxStreak === list.length,
    startDate: list.length ? list[0].date : null,
    endDate: list.length ? list[list.length-1].date : null,
  };
}
export function planFinalReward(log, planId) {
  const st = planStats(log, planId);
  const mult = st.perfect ? PLAN_PERFECT_MULTIPLIER : 1;
  return {
    xp: Math.round(PLAN_SESSION_XP * st.maxStreak * mult),
    gold: Math.round(PLAN_SESSION_GOLD * st.maxStreak * mult),
    streak: st.maxStreak, perfect: st.perfect,
  };
}
// План завершён, когда не осталось сессий в статусе "planned". В отличие от кампаний пропуск
// завершению НЕ мешает: тренировочный план почти никогда не выполняется на 100 %, и блокировать
// закрытие одной пропущенной средой было бы издевательством.
function planIsComplete(log, planId) {
  const st = planStats(log, planId);
  return st.total > 0 && st.planned === 0;
}
// Чистый пересчёт статусов планов — по образцу settleCampaigns.
function settleTrainingPlans(prevPlans, log) {
  const rewards = [];
  const plans = (prevPlans||[]).map(pl => {
    if (pl.status === "archived") return pl;
    const complete = planIsComplete(log, pl.id);
    if (complete && pl.status !== "done") {
      if (pl.claimedFinal) return { ...pl, status:"done", completedAt: todayStr() };
      const rw = planFinalReward(log, pl.id);
      rewards.push({ planId:pl.id, title:pl.title, xp:rw.xp, gold:rw.gold, streak:rw.streak, perfect:rw.perfect });
      return { ...pl, status:"done", completedAt: todayStr(), claimedFinal:true, reward:{ grantedXp:rw.xp, grantedGold:rw.gold } };
    }
    if (!complete && pl.status === "done") return { ...pl, status:"active", completedAt:null };
    return pl;
  });
  return { plans, rewards };
}
export function applyPlanSettlement(state, workoutLog) {
  const { plans, rewards } = settleTrainingPlans(state.trainingPlans, workoutLog);
  if (!rewards.length) return { state: { ...state, workoutLog, trainingPlans: plans }, rewards };
  let spheres = state.spheres, currency = state.profile.currency;
  rewards.forEach(r => {
    spheres = spheres.map(sp => sp.id==="health" ? { ...sp, xp: sp.xp + r.xp } : sp);
    currency += r.gold;
  });
  return { state: { ...state, workoutLog, trainingPlans: plans, spheres, profile:{ ...state.profile, currency } }, rewards };
}
export function revertPlanSettlement(state, rewards) {
  if (!rewards || !rewards.length) return state;
  const ids = new Set(rewards.map(r => r.planId));
  let spheres = state.spheres, currency = state.profile.currency;
  rewards.forEach(r => {
    spheres = spheres.map(sp => sp.id==="health" ? { ...sp, xp: Math.max(0, sp.xp - r.xp) } : sp);
    currency = Math.max(0, currency - r.gold);
  });
  return {
    ...state, spheres, profile:{ ...state.profile, currency },
    trainingPlans: (state.trainingPlans||[]).map(pl => ids.has(pl.id)
      ? { ...pl, status:"active", completedAt:null, claimedFinal:false, reward:{ grantedXp:null, grantedGold:null } }
      : pl),
  };
}
// Цель по спорту. Без активного плана цель НЕПОЛНАЯ: когда ставится задача накачать группу мышц
// или сбросить вес, план прорабатывается — иначе цель превращается в пожелание, которое нечем
// измерить. Неполная цель видна на экране, но привычку не заводит и наград не приносит.
export function defaultSportGoal() {
  return { startDate:null, endDate:null, sessionsPerWeek:3, minutesPerWeek:180, focus:null };
}
export function isSportGoalSet(goal) { return !!(goal && goal.startDate && goal.endDate); }
function activePlansFor(plans, goal) {
  if (!isSportGoalSet(goal)) return [];
  return (plans||[]).filter(pl => pl.status !== "archived");
}
export function isSportGoalActive(state) {
  return isSportGoalSet(state.sportGoal) && activePlansFor(state.trainingPlans, state.sportGoal).length > 0;
}

// Материализация плана в сессии: по дням недели и числу недель. Никакого отдельного расписания —
// каждая сессия сразу становится записью журнала со статусом "planned".
// newId — источник id; действие передаёт генератор из replayIds, потому что зовёт это внутри обновления.
export function buildPlanSessions(plan, schedule, weeks, startDate, exercises, workouts, newId = uid) {
  const sessions = [];
  const start = weekStartOf(startDate);
  for (let w = 0; w < weeks; w++) {
    schedule.forEach(slot => {
      const date = addDaysToDateStr(start, w*7 + (slot.weekday - 1));
      if (date < startDate) return;   // первая неделя начинается не раньше даты старта
      const template = (workouts||[]).find(x => x.id===slot.workoutId);
      if (!template) return;
      const entries = (template.items||[]).map(it => {
        const ex = (exercises||[]).find(e => e.id===it.exerciseId);
        const kind = ex ? ex.kind : "strength";
        return {
          id: newId(), exerciseId: it.exerciseId, name: ex ? ex.name : "Упражнение",
          sets: Array.from({ length: Math.max(1, Number(it.sets)||1) }, () => ({
            ...defaultSet(kind, newId()),
            reps: it.reps != null ? it.reps : defaultSet(kind).reps,
            weight: it.weight != null ? it.weight : null,
            minutes: it.minutes != null ? it.minutes : (kind==="strength" ? null : defaultSet(kind).minutes),
            km: it.km != null ? it.km : null,
          })),
        };
      });
      sessions.push({
        id: newId(), date, workoutId: template.id, planId: plan.id, sessionId: newId(),
        title: template.title, status: "planned", minutes: null, rpe: null, notes: "", entries,
      });
    });
  }
  return sessions.sort((a,b) => a.date.localeCompare(b.date));
}

/* --------------------------- Журнал тренировок --------------------------- */
// Запись журнала хранит СНИМОК названий и состава: переименовали упражнение — прошлые тренировки
// не переписываются, потому что они уже случились именно в том виде (тот же принцип, что у
// записей дневника питания и rewardXp квеста).
// id можно передать готовым — так делают действия, создающие подходы внутри обновления (см. replayIds).
export function defaultSet(kind, id = uid()) {
  if (kind === "cardio" || kind === "mobility") return { id, minutes:10, km:null, reps:null, weight:null, done:false };
  return { id, reps:10, weight:null, minutes:null, km:null, done:false };
}
export function workoutLogOnDate(log, date) { return (log||[]).filter(w => w.date === date); }
// Тоннаж: сумма вес×повторы по отмеченным подходам. Кардио в тоннаж не входит.
export function workoutVolume(entryOrLog) {
  const entries = Array.isArray(entryOrLog) ? entryOrLog : (entryOrLog.entries || []);
  return entries.reduce((total, e) => total + (e.sets||[]).reduce(
    (a, st) => a + (st.done ? (Number(st.weight)||0) * (Number(st.reps)||0) : 0), 0), 0);
}
export function workoutSetStats(workout) {
  const sets = (workout.entries||[]).flatMap(e => e.sets||[]);
  return { total: sets.length, done: sets.filter(st => st.done).length };
}
// Доля выполнения дня. planOnly — считать только сессии плана: платим за следование плану, а
// свободная тренировка идёт в статистику, но дневную долю не формирует.
// null, если подходов нет вообще: пустой день не оценивается, а не считается провалом — в спорте
// день отдыха законен, и ставить за него ноль означало бы сломать и стрик, и мотивацию.
export function workoutDayFraction(log, date, planOnly) {
  const list = workoutLogOnDate(log, date).filter(w => w.status !== "skipped" && (!planOnly || w.planId));
  if (!list.length) return null;
  let total = 0, done = 0;
  list.forEach(w => { const st = workoutSetStats(w); total += st.total; done += st.done; });
  if (!total) return null;
  return clamp(done/total, 0, 1);
}
// Понедельник как начало недели — так же, как в календаре и недельных итогах питания.
export function weekStartOf(dateStr) {
  const d = new Date(dateStr+"T00:00:00");
  const shift = (d.getDay()+6) % 7;
  return addDaysToDateStr(dateStr, -shift);
}
export function workoutWeekStats(log, date) {
  const from = weekStartOf(date), to = addDaysToDateStr(from, 6);
  const list = (log||[]).filter(w => w.date>=from && w.date<=to && w.status==="done");
  return {
    from, to,
    sessions: list.length,
    minutes: list.reduce((a,w) => a + (Number(w.minutes)||0), 0),
    volume: list.reduce((a,w) => a + workoutVolume(w), 0),
    rpe: list.length ? Math.round(list.reduce((a,w) => a + (Number(w.rpe)||0), 0) / list.filter(w=>w.rpe).length * 10)/10 || null : null,
  };
}
