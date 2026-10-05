// Привязанные привычки: те, что отмечаются не рукой, а числом — доля набранной цели по питанию,
// воде и чтению. День делится на четверти, и раз выданный уровень дня назад не понижается.

import {
  addDaysStr, addDaysToDateStr, clamp, daysBetween, toDateStr, todayStr, uid,
} from "../core/basics.js";
import { BIRTHDAY_QUEST_LEAD_DAYS, DIFFICULTY } from "../core/rules.js";
import { nutritionDayTotals } from "../nutrition/model.js";
import { nextBirthdayDateStr } from "../people/birthday.js";
import {
  isSportGoalActive, workoutDayFraction, workoutLogOnDate, workoutSetStats,
} from "../sport/model.js";

// Автоматические привычки, синхронизируемые с целью по питанию (state.nutritionGoal) и целями
// чтения отдельных книг (book.readingGoal). В отличие от обычных привычек (ручная отметка "сделано"
// за день), день оценивается ЧИСЛОМ — какая доля цели набрана — и делится на 4 четверти:
// <2/4 — не выполнено (без стрика), 2/4 — частично (стрик сохраняется, без опыта),
// 3/4 — хорошо (половина опыта), 4/4 — отлично (полная награда). Раз выданный уровень дня никогда
// не понижается назад (правки задним числом не отбирают уже полученную награду — тот же принцип
// "не переписывать историю", что и у остального в этом файле), но может ДОРАСТИ, если в тот же
// день добавили ещё данных — тогда доначисляется только разница.
// Награда за ВЕДЕНИЕ раздела — не за результат, а за сам факт записи. Намеренно вдвое меньше,
// чем за выполнение цели: дневник не должен приносить больше, чем цель, ради которой он ведётся.
export const LOG_HABIT_BASE_XP = 4;
export const LOG_HABIT_BASE_CURRENCY = 2;
// Окно начисления. Без него заполненный задним числом месяц высыпал бы награду за 30 дней разом,
// а это ровно тот случай, когда механику проще накрутить, чем выполнить.
export const LOG_HABIT_WINDOW_DAYS = 14;
// Порог осмысленности: пустая строка «для галочки» день не оплачивает. Полностью накрутку это не
// лечит (никакая проверка не отличит настоящую операцию от выдуманной), но снимает самый простой
// способ — запись-пустышку.
export const LOG_HABIT_KINDS = {
  logFinance:   { title:"Веду финансы",   sphereId:"finance" },
  logNutrition: { title:"Веду дневник питания", sphereId:"health" },
  logSport:     { title:"Веду журнал тренировок", sphereId:"health" },
};
function logHabitDayFraction(kind, state, date) {
  if (kind === "logFinance") {
    return (state.transactions||[]).some(t => t.date===date && Math.abs(Number(t.amount)||0) > 0) ? 1 : null;
  }
  if (kind === "logNutrition") {
    return (state.nutritionLog||[]).some(e => e.date===date && ((Number(e.calories)||0) > 0 || (Number(e.water)||0) > 0)) ? 1 : null;
  }
  if (kind === "logSport") {
    return (state.workoutLog||[]).some(w => w.date===date && (w.status==="done" || (w.entries||[]).some(en => (en.sets||[]).some(st => st.done)))) ? 1 : null;
  }
  return null;
}

// Поощрение за ведение — не привычка, а бонус: у него нет ни цепочки, ни требования делать
// что-то каждый день. Поэтому оно живёт в настройках отдельным переключателем, по умолчанию
// выключенным, и не засоряет список привычек. Начисление идёт только с момента включения:
// платить задним числом за месяц, который человек вёл до появления бонуса, значило бы выдать
// разом кучу опыта ни за что.
export function defaultLogRewards() {
  return { enabled:false, enabledAt:null, claimed:{ logFinance:{}, logNutrition:{}, logSport:{} } };
}
// Чистый расчёт: сколько начислить за неурегулированные дни. Дни, за которые уже платили,
// хранятся в claimed по видам — тот же принцип идемпотентности, что у claimedTiers у привычек.
export function computeLogRewardSettlement(state, today) {
  const cfg = { ...defaultLogRewards(), ...(state.logRewards||{}) };
  if (!cfg.enabled) return { changed:false };
  const from = [cfg.enabledAt || today, addDaysToDateStr(today, -(LOG_HABIT_WINDOW_DAYS-1))].sort()[1];
  const claimed = { ...cfg.claimed };
  let xpBySphere = {}, currency = 0, changed = false, days = 0;
  Object.keys(LOG_HABIT_KINDS).forEach(kind => {
    const already = { ...(claimed[kind]||{}) };
    for (let d = from; d <= today; d = addDaysToDateStr(d, 1)) {
      if (already[d]) continue;
      if (!logHabitDayFraction(kind, state, d)) continue;
      already[d] = 1;
      const sphereId = LOG_HABIT_KINDS[kind].sphereId;
      xpBySphere[sphereId] = (xpBySphere[sphereId]||0) + LOG_HABIT_BASE_XP;
      currency += LOG_HABIT_BASE_CURRENCY;
      changed = true;
      days++;
    }
    claimed[kind] = already;
  });
  if (!changed) return { changed:false };
  return { changed:true, claimed, xpBySphere, currency, days };
}
// Сколько дней раздела было записано за последние N дней — счётчик вместо серии: траты и
// тренировки случаются не каждый день, и цепочка «подряд» тут ничего не измеряет.
export function logRewardDayCount(kind, state, days) {
  const today = todayStr();
  let n = 0;
  for (let i = 0; i < days; i++) if (logHabitDayFraction(kind, state, addDaysToDateStr(today, -i))) n++;
  return n;
}
// Страховка для сохранений, созданных версией, где поощрения были привычками: такие привычки
// вычищаются при синхронизации, а этот признак нужен, чтобы они не попадали в «лучшую серию».
export function isLogHabit(habit) { return !!(habit && LOG_HABIT_KINDS[habit.linkedKind]); }

const LINKED_HABIT_BASE_XP = 8;
const LINKED_HABIT_BASE_CURRENCY = 3;
// Индекс — четверть (0..4), значение — доля от полной награды за эту четверть.
const TIER_REWARD_MULTIPLIER = [0, 0, 0, 0.5, 1];
export function tierFromFraction(fraction) {
  if (fraction==null) return null;
  return Math.min(4, Math.floor(clamp(fraction,0,1)*4 + 1e-9));
}
export function tierLabel(tier) {
  if (tier>=4) return { text:"Отлично",  cls:"text-emerald-400" };
  if (tier>=3) return { text:"Хорошо",   cls:"text-amber-400" };
  if (tier>=2) return { text:"Частично", cls:"text-zinc-400" };
  return null;
}
// Сколько ещё нужно набрать (в тех же единицах, что actual/target), чтобы дотянуть до следующей
// четверти. 0, если уже 4/4 или цель не задана.
export function amountToNextTier(actual, target, tier) {
  if (!target || tier>=4) return 0;
  return Math.max(0, Math.ceil(target*((tier+1)/4) - actual));
}
// Средняя доля выполнения по всем ЗАДАННЫМ целям БЖУ/калорий за день (каждая доля не выше 1).
// null, если целей по БЖУ/калориям вообще нет (тогда и привычки такой быть не должно).
export function nutritionMacrosDayFraction(goal, log, date) {
  const totals = nutritionDayTotals(log, date);
  const parts = [];
  if (goal.calories) parts.push(clamp(totals.calories/goal.calories,0,1));
  if (goal.protein)  parts.push(clamp(totals.protein/goal.protein,0,1));
  if (goal.fat)      parts.push(clamp(totals.fat/goal.fat,0,1));
  if (goal.carbs)    parts.push(clamp(totals.carbs/goal.carbs,0,1));
  if (parts.length===0) return null;
  return parts.reduce((a,b)=>a+b,0)/parts.length;
}
export function nutritionWaterDayFraction(goal, log, date) {
  if (!goal.water) return null;
  return clamp(nutritionDayTotals(log, date).water/goal.water, 0, 1);
}
export function isReadingGoalActiveOn(goal, date) {
  return !!(goal && goal.startDate && goal.endDate && goal.pagesPerDay && date >= goal.startDate && date <= goal.endDate);
}
// Перенос вперёд: если за день прочитано больше плана, излишек засчитывается в счёт будущих дней
// (никогда назад). Оцениваем конкретный день так: берём накопленное с начала цели по эту дату
// включительно и вычитаем то, что уже "занято" нормой всех предыдущих дней — остаток (не больше
// одной дневной нормы) и есть вклад именно этого дня.
export function readingDayFraction(book, readingLog, date) {
  const goal = book && book.readingGoal;
  if (!isReadingGoalActiveOn(goal, date)) return null;
  const cumulativeByDate = (readingLog||[])
    .filter(e => e.bookId===book.id && e.date>=goal.startDate && e.date<=date)
    .reduce((a,e) => a+(e.pages||0), 0);
  const daysBefore = daysBetween(goal.startDate, date);
  const assigned = clamp(cumulativeByDate - goal.pagesPerDay*daysBefore, 0, goal.pagesPerDay);
  return assigned/goal.pagesPerDay;
}
// Урегулирование одной привязанной привычки за диапазон [startDate .. min(endDate, todayDate)]:
// для каждого ещё не финализированного на максимум дня доначисляет дельту XP/валюты и отмечает
// день в logs (для стрика/тепловой карты), если четверть достигла хотя бы 2/4.
function computeLinkedHabitSettlement(habit, startDate, endDate, todayDate, fractionForDate, baseXp, baseCurrency) {
  const xpRate = baseXp != null ? baseXp : LINKED_HABIT_BASE_XP;
  const currencyRate = baseCurrency != null ? baseCurrency : LINKED_HABIT_BASE_CURRENCY;
  const claimedTiers = { ...(habit.claimedTiers||{}) };
  let logs = (habit.logs||[]).slice();
  let xpDelta = 0, currencyDelta = 0, changed = false;
  if (!startDate || !endDate) return { claimedTiers, logs, xpDelta, currencyDelta, changed };
  const lastDate = endDate < todayDate ? endDate : todayDate;
  if (startDate > lastDate) return { claimedTiers, logs, xpDelta, currencyDelta, changed };
  for (let d = startDate; d <= lastDate; d = addDaysToDateStr(d, 1)) {
    const fraction = fractionForDate(d);
    if (fraction==null) continue;
    const tier = tierFromFraction(fraction);
    const prevTier = claimedTiers[d]||0;
    if (tier > prevTier) {
      xpDelta += Math.round(xpRate*(TIER_REWARD_MULTIPLIER[tier]-TIER_REWARD_MULTIPLIER[prevTier]));
      currencyDelta += Math.round(currencyRate*(TIER_REWARD_MULTIPLIER[tier]-TIER_REWARD_MULTIPLIER[prevTier]));
      claimedTiers[d] = tier;
      changed = true;
    }
    if (tier>=2 && !logs.includes(d)) { logs = [...logs, d]; changed = true; }
  }
  return { claimedTiers, logs, xpDelta, currencyDelta, changed };
}
// Полная синхронизация: заводит/убирает авто-привычки вслед за активными целями и урегулирует
// награду по каждой. Чистая функция без побочных эффектов — вызывающий код сам решает, что делать
// с итоговым xp (обычно — показать тост). Возвращает { changed:false }, если ничего не поменялось.
export function computeSyncedHabits(prev, today) {
  let habits = prev.habits.slice();
  let spheres = prev.spheres;
  let currency = prev.profile.currency;
  let totalXpDelta = 0;
  let changed = false;

  const goal = prev.nutritionGoal || {};
  const goalActive = !!(goal.startDate && goal.endDate);
  const wantMacros = goalActive && !!(goal.calories||goal.protein||goal.fat||goal.carbs);
  const wantWater = goalActive && !!goal.water;

  let macrosHabit = habits.find(h => h.linkedKind==="nutritionMacros");
  if (wantMacros && !macrosHabit) {
    habits = [{ id:uid(), title:"Цель по БЖУ/калориям", sphereId:"health", linkedKind:"nutritionMacros", logs:[], claimedDates:[], claimedTiers:{} }, ...habits];
    changed = true;
  } else if (!wantMacros && macrosHabit) {
    habits = habits.filter(h => h.id!==macrosHabit.id);
    changed = true;
  }

  // Цель по спорту работает только вместе с планом: без плана она неполная, привычка не заводится
  // и награда не идёт (см. isSportGoalActive).
  const sportGoal = prev.sportGoal || {};
  const wantSport = isSportGoalActive(prev);
  let sportHabit = habits.find(h => h.linkedKind==="sportPlan");
  if (wantSport && !sportHabit) {
    habits = [{ id:uid(), title:"Тренировки по плану", sphereId:"health", linkedKind:"sportPlan", logs:[], claimedDates:[], claimedTiers:{} }, ...habits];
    changed = true;
  } else if (!wantSport && sportHabit) {
    habits = habits.filter(h => h.id!==sportHabit.id);
    changed = true;
  }

  // Поощрения за ведение разделов сюда НЕ попадают: это бонус, а не привычка (см. defaultLogRewards).
  // Старые сохранения могли завести такие привычки прежней версией — убираем их, иначе они
  // остались бы висеть в списке навсегда.
  if (habits.some(h => LOG_HABIT_KINDS[h.linkedKind])) {
    habits = habits.filter(h => !LOG_HABIT_KINDS[h.linkedKind]);
    changed = true;
  }

  let waterHabit = habits.find(h => h.linkedKind==="nutritionWater");
  if (wantWater && !waterHabit) {
    habits = [{ id:uid(), title:"Цель по воде", sphereId:"health", linkedKind:"nutritionWater", logs:[], claimedDates:[], claimedTiers:{} }, ...habits];
    changed = true;
  } else if (!wantWater && waterHabit) {
    habits = habits.filter(h => h.id!==waterHabit.id);
    changed = true;
  }

  const bookGoals = (prev.books||[]).filter(b => isReadingGoalActiveOn(b.readingGoal, b.readingGoal && b.readingGoal.startDate));
  const bookGoalIds = new Set(bookGoals.map(b=>b.id));
  const beforeCount = habits.length;
  habits = habits.filter(h => h.linkedKind!=="reading" || bookGoalIds.has(h.linkedRefId));
  if (habits.length!==beforeCount) changed = true;
  bookGoals.forEach(b => {
    if (!habits.find(h => h.linkedKind==="reading" && h.linkedRefId===b.id)) {
      habits = [{ id:uid(), title:`Читать «${b.title}»`, sphereId:b.sphereId||"knowledge", linkedKind:"reading", linkedRefId:b.id, logs:[], claimedDates:[], claimedTiers:{} }, ...habits];
      changed = true;
    }
  });

  habits = habits.map(h => {
    let startDate, endDate, fractionForDate;
    if (h.linkedKind==="nutritionMacros") {
      startDate = goal.startDate; endDate = goal.endDate;
      fractionForDate = (d) => nutritionMacrosDayFraction(goal, prev.nutritionLog, d);
    } else if (h.linkedKind==="nutritionWater") {
      startDate = goal.startDate; endDate = goal.endDate;
      fractionForDate = (d) => nutritionWaterDayFraction(goal, prev.nutritionLog, d);
    } else if (h.linkedKind==="sportPlan") {
      startDate = sportGoal.startDate; endDate = sportGoal.endDate;
      fractionForDate = (d) => workoutDayFraction(prev.workoutLog, d, true);
    } else if (h.linkedKind==="reading") {
      const book = (prev.books||[]).find(b => b.id===h.linkedRefId);
      if (!book || !book.readingGoal) return h;
      startDate = book.readingGoal.startDate; endDate = book.readingGoal.endDate;
      fractionForDate = (d) => readingDayFraction(book, prev.readingLog, d);
    } else {
      return h;
    }
    const res = computeLinkedHabitSettlement(h, startDate, endDate, today, fractionForDate);
    if (!res.changed) return h;
    changed = true;
    if (res.xpDelta) {
      spheres = spheres.map(s => s.id===h.sphereId ? { ...s, xp:s.xp+res.xpDelta } : s);
      currency += res.currencyDelta;
      totalXpDelta += res.xpDelta;
    }
    return { ...h, claimedTiers:res.claimedTiers, logs:res.logs };
  });

  if (!changed) return { changed:false };
  return { changed:true, habits, spheres, currency, totalXpDelta };
}
// Заводит авто-квесты "Поздравить с ДР" (ТЗ «Календарь», раздел 2.1) — тот же принцип, что и
// computeSyncedHabits: чистая функция, вызывающий код сам решает, что делать с результатом.
// В отличие от привязанных привычек — это ОБЫЧНЫЕ квесты, доступные для ручного редактирования
// и удаления (linkedKind/linkedRefId только помечают происхождение, не блокируют UI). Отслеживание
// ДР — опт-ин (trackBirthday по умолчанию false, включать автоматически не нужно): квест заводится
// только людям, у которых оно явно включено, и не архивным. Идемпотентность — через
// person.birthdayQuestYears: год добавляется в момент создания и больше не даёт квесту
// "воскреснуть" в этот же год, даже если пользователь его удалил или выполнил.
export function computeSyncedBirthdayQuests(prevQuests, people, today) {
  let quests = prevQuests;
  let peopleOut = people;
  let questsChanged = false;

  (people||[]).forEach(p => {
    if (!p.birthday || p.archived || p.trackBirthday!==true) return;
    const bdayDate = nextBirthdayDateStr(p.birthday, today);
    if (!bdayDate) return;
    const year = Number(bdayDate.slice(0,4));
    const years = p.birthdayQuestYears || [];
    if (years.includes(year)) return;
    const leadStart = addDaysToDateStr(bdayDate, -BIRTHDAY_QUEST_LEAD_DAYS);
    if (today < leadStart || today > bdayDate) return;
    quests = [{
      id:uid(), title:`Поздравить ${p.name} с днём рождения`,
      sphereId:"social", priority:"medium", difficulty:"easy",
      rewardXp:DIFFICULTY.easy.xp, rewardGold:DIFFICULTY.easy.gold,
      status:"active", deadline:bdayDate,
      personId:p.id, personName:p.name,
      linkedKind:"birthdayGreeting", linkedRefId:p.id,
      subtasks:[], createdAt:today,
    }, ...quests];
    questsChanged = true;
    peopleOut = peopleOut.map(x => x.id===p.id ? { ...x, birthdayQuestYears:[...years, year] } : x);
  });

  if (!questsChanged) return { changed:false };
  return { changed:true, quests, people:peopleOut };
}
// Общий кусок для трёх мест (удаление человека / выключение отслеживания ДР / архивация) — убирает
// ещё невыполненный (status==="active") квест-поздравление этого человека, если он есть. Выполненный
// не трогаем нигде (он остаётся историей, см. ТЗ «Календарь», раздел 2.1). Возвращает и
// отфильтрованный список квестов, и сам снятый квест — второе нужно для восстановления через
// "Отменить" в тосте.
export function extractActiveBirthdayQuest(quests, personId) {
  const found = quests.find(q => q.linkedKind==="birthdayGreeting" && q.linkedRefId===personId && q.status==="active");
  if (!found) return { quests, removed:null };
  return { quests: quests.filter(q => q.id!==found.id), removed:found };
}

export function computeStreak(logDates) {
  const set = new Set(logDates||[]);
  let streak = 0;
  let d = new Date();
  if (!set.has(toDateStr(d))) d.setDate(d.getDate()-1);
  while (set.has(toDateStr(d))) { streak++; d.setDate(d.getDate()-1); }
  return streak;
}

// Период, на который заведена привязанная привычка: она живёт ровно столько, сколько живёт цель,
// и знаменатель «за 30 дней» у цели на две недели был бы неправдой.
function linkedHabitPeriod(habit, state) {
  if (habit.linkedKind==="nutritionMacros" || habit.linkedKind==="nutritionWater") {
    const g = state.nutritionGoal || {};
    return { startDate:g.startDate || null, endDate:g.endDate || null };
  }
  if (habit.linkedKind==="sportPlan") {
    const g = state.sportGoal || {};
    return { startDate:g.startDate || null, endDate:g.endDate || null };
  }
  if (habit.linkedKind==="reading") {
    const book = (state.books||[]).find(b => b.id===habit.linkedRefId);
    const g = book && book.readingGoal;
    return { startDate:(g && g.startDate) || null, endDate:(g && g.endDate) || null };
  }
  return { startDate:null, endDate:null };
}
// Сколько дней периода уже прошло (но не больше самого периода) и сколько из них засчитано.
export function linkedHabitPeriodStats(habit, state) {
  const { startDate, endDate } = linkedHabitPeriod(habit, state);
  const today = todayStr();
  if (!startDate || !endDate) {
    const logs = (habit.logs||[]).filter(d => d >= addDaysStr(-29));
    return { days: 30, done: logs.length, elapsed: 30 };
  }
  const days = Math.max(1, daysBetween(startDate, endDate) + 1);
  const lastDay = today < endDate ? today : endDate;
  const elapsed = today < startDate ? 0 : clamp(daysBetween(startDate, lastDay) + 1, 0, days);
  const done = (habit.logs||[]).filter(d => d >= startDate && d <= endDate).length;
  return { days, done, elapsed };
}

// Единое вычисление сегодняшнего прогресса привязанной привычки — используется и в компактной
// карточке (Хаб), и в полной (Привычки). null, если данных для расчёта нет (например, цель уже
// сняли, а привычка ещё не успела исчезнуть из списка на этом рендере).
export function linkedHabitProgress(habit, state) {
  const today = todayStr();
  if (habit.linkedKind==="nutritionMacros") {
    const goal = state.nutritionGoal||{};
    const fraction = nutritionMacrosDayFraction(goal, state.nutritionLog, today);
    if (fraction==null) return null;
    const totals = nutritionDayTotals(state.nutritionLog, today);
    const parts = [];
    if (goal.calories) parts.push({ key:"calories", label:"Калории", actual:Math.round(totals.calories), target:goal.calories, unit:"ккал", colorClass:"bg-amber-500" });
    if (goal.protein)  parts.push({ key:"protein",  label:"Б", actual:Math.round(totals.protein*10)/10, target:goal.protein, unit:"г", colorClass:"bg-sky-500" });
    if (goal.fat)      parts.push({ key:"fat",      label:"Ж", actual:Math.round(totals.fat*10)/10, target:goal.fat, unit:"г", colorClass:"bg-rose-500" });
    if (goal.carbs)    parts.push({ key:"carbs",    label:"У", actual:Math.round(totals.carbs*10)/10, target:goal.carbs, unit:"г", colorClass:"bg-violet-500" });
    return { kind:"nutritionMacros", fraction, tier:tierFromFraction(fraction), parts };
  }
  if (habit.linkedKind==="nutritionWater") {
    const goal = state.nutritionGoal||{};
    const fraction = nutritionWaterDayFraction(goal, state.nutritionLog, today);
    if (fraction==null) return null;
    const actual = nutritionDayTotals(state.nutritionLog, today).water;
    return { kind:"nutritionWater", fraction, tier:tierFromFraction(fraction), actual, target:goal.water, unit:"мл" };
  }
  if (habit.linkedKind==="sportPlan") {
    // Своя карточка у тренировок (см. ТЗ, решение 6): показываем не абстрактную долю, а сегодняшнюю
    // сессию плана с её подходами — отмечать их удобнее там же, где отмечаются остальные привычки.
    const fraction = workoutDayFraction(state.workoutLog, today, true);
    if (fraction==null) return null;
    const sessions = workoutLogOnDate(state.workoutLog, today).filter(w => w.planId && w.status!=="skipped");
    const stats = sessions.reduce((acc,w) => { const st = workoutSetStats(w); return { total:acc.total+st.total, done:acc.done+st.done }; }, { total:0, done:0 });
    return { kind:"sportPlan", fraction, tier:tierFromFraction(fraction), actual:stats.done, target:stats.total, unit:"подх", sessions };
  }
  if (habit.linkedKind==="reading") {
    const book = (state.books||[]).find(b => b.id===habit.linkedRefId);
    if (!book || !book.readingGoal) return null;
    const fraction = readingDayFraction(book, state.readingLog, today); // для оценки/тира — с переносом, капается на 100%
    if (fraction==null) return null;
    // Для отображения — реально прочитанное сегодня, БЕЗ капа (чтобы был виден перебор, 25/20),
    // в отличие от fraction, который для системы наград не может превышать дневную норму.
    const actual = (state.readingLog||[]).filter(e => e.bookId===book.id && e.date===today).reduce((a,e) => a+(e.pages||0), 0);
    return { kind:"reading", fraction, tier:tierFromFraction(fraction), actual, target:book.readingGoal.pagesPerDay, unit:"стр", book };
  }
  return null;
}
