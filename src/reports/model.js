// Боевые отчёты: итоги месяца, собранные из журналов, и медали за них.
//
// Отчёт нигде не хранится — он каждый раз считается заново из того, что уже записано с датами:
// выполненные квесты, отметки привычек, тренировки, страницы, дневник питания, операции. Поэтому
// отчёт за любой прошлый месяц доступен всегда, а правка задним числом сразу видна в итогах.
// Хранится только одно: какие отчёты человек уже открыл (state.reportsSeen) — чтобы уведомление
// на Хабе приходило один раз.
//
// Опыт по сферам за месяц тоже считается из журналов, а не из истории счётчика: сколько опыта у
// сферы было на 1 сентября, нигде не записано. Учитываются квесты, ручные привычки, закрытые
// кампании и завершённые записи библиотеки — то, что даёт опыт с понятной датой.

import { addDaysToDateStr, pad2 } from "../core/basics.js";
import { monthName } from "../core/format.js";
import { LIBRARY_KINDS, LIBRARY_KIND_ORDER } from "../library/constants.js";
import { questSphereIds } from "../quests/links.js";
import { workoutVolume } from "../sport/model.js";
import { nutritionDayTotals } from "../nutrition/model.js";
import { budgetChanges, budgetSummary } from "../finance/budget.js";

// Опыт за отметку обычной привычки — то же число, что начисляет toggleHabitToday.
const HABIT_XP = 8;


/* ------------------------------- Месяцы ------------------------------- */

export function monthOf(dateStr) { return dateStr.slice(0, 7); }
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad2(idx % 12 + 1)}`;
}
export function monthDays(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
export function monthStart(ym) { return `${ym}-01`; }
export function monthEnd(ym) { return `${ym}-${pad2(monthDays(ym))}`; }
// «Сентябрь 2026» — заголовок отчёта; «за сентябрь» — в уведомлении.
export function reportTitle(ym) {
  const name = monthName(ym);
  return `${name[0].toUpperCase()}${name.slice(1)} ${ym.slice(0, 4)}`;
}
export function reportMonthWord(ym) { return monthName(ym); }

/* --------------------------- Сборка отчёта --------------------------- */

// Последний учитываемый день месяца: для идущего месяца — сегодня; limitDay обрезает ещё сильнее.
// Обрезка нужна для честного сравнения: идущий месяц (7 дней) сравнивается не с целым прошлым,
// а с теми же 7 днями прошлого — иначе в начале месяца всё было бы «хуже», чем месяцем раньше.
function lastCountedDay(ym, today, limitDay) {
  let end = monthEnd(ym);
  if (limitDay) end = `${ym}-${pad2(Math.min(limitDay, monthDays(ym)))}`;
  return today && today < end ? today : end;
}

export function buildMonthReport(state, ym, today, limitDay = null) {
  const start = monthStart(ym), lastDay = lastCountedDay(ym, today, limitDay);
  // Всё, что попадает в отчёт, — с датой внутри учитываемых дней месяца.
  const inMonth = (date) => typeof date === "string" && date >= start && date <= lastDay;
  const ongoing = !!today && monthOf(today) === ym;
  const countedDays = lastDay >= start ? Number(lastDay.slice(8, 10)) : 0;
  const spheres = state.spheres || [];
  const sphereXp = Object.fromEntries(spheres.map(s => [s.id, 0]));
  const addXp = (sphereId, xp) => { if (sphereId in sphereXp) sphereXp[sphereId] += xp || 0; };
  // По дням — для «лучшего дня» и числа активных дней.
  const dayScore = {};
  const bump = (date, n = 1) => { if (inMonth(date)) dayScore[date] = (dayScore[date] || 0) + n; };

  // Квесты: выполненные — по дате выполнения, проваленные — по сроку.
  const questsDone = (state.quests || []).filter(q => q.status === "done" && inMonth(q.completedAt));
  const questsFailed = (state.quests || []).filter(q => q.status === "failed" && inMonth(q.deadline));
  let questXp = 0, questGold = 0;
  questsDone.forEach(q => {
    questSphereIds(q).forEach(id => addXp(id, q.rewardXp));
    questXp += (q.rewardXp || 0) * Math.max(1, questSphereIds(q).length);
    questGold += q.rewardGold || 0;
    bump(q.completedAt, 2);
  });

  // Кампании, закрытые в этом месяце, и их награда.
  const campaignsDone = (state.campaigns || []).filter(c => c.status === "done" && inMonth(c.completedAt));
  campaignsDone.forEach(c => addXp(c.sphereId, c.reward && c.reward.grantedXp));

  // Привычки: отметки в пределах месяца, самая длинная серия внутри месяца.
  const habits = (state.habits || []).map(h => {
    const days = [...new Set((h.logs || []).filter(d => inMonth(d)))].sort();
    let best = 0, run = 0, prev = null;
    days.forEach(d => { run = prev && addDaysToDateStr(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; });
    if (!h.linkedKind) days.forEach(d => addXp(h.sphereId, HABIT_XP));
    days.forEach(d => bump(d));
    // «Без пропусков» — только для привычки, которая существовала весь месяц: заведённая
    // 20-го числа не может быть отмечена 1-го, и ставить ей это в вину нечестно.
    const existedAllMonth = !h.createdAt || h.createdAt <= start;
    return { id: h.id, title: h.title, sphereId: h.sphereId, linked: !!h.linkedKind, days: days.length, bestStreak: best,
      perfect: existedAllMonth && countedDays > 0 && days.length >= countedDays };
  });
  const habitChecks = habits.reduce((a, h) => a + h.days, 0);

  // Спорт: выполненные тренировки, минуты, тоннаж, километры.
  const sessions = (state.workoutLog || []).filter(w => w.status === "done" && inMonth(w.date));
  const sport = {
    sessions: sessions.length,
    minutes: sessions.reduce((a, w) => a + (Number(w.minutes) || 0), 0),
    volume: Math.round(sessions.reduce((a, w) => a + workoutVolume(w), 0)),
    km: Math.round(sessions.reduce((a, w) => a + (w.entries || []).reduce((b, e) => b + (e.sets || []).reduce((c, st) => c + (st.done ? Number(st.km) || 0 : 0), 0), 0), 0) * 10) / 10,
  };
  sessions.forEach(w => bump(w.date, 2));

  // Библиотека: страницы по дневнику чтения и завершённые записи (дата завершения есть только у
  // записей, завершённых после появления отчётов, — у старых её неоткуда взять).
  const pages = (state.readingLog || []).filter(e => inMonth(e.date)).reduce((a, e) => a + (e.pages || 0), 0);
  (state.readingLog || []).forEach(e => { if (e.pages > 0) bump(e.date); });
  const finished = [];
  LIBRARY_KIND_ORDER.forEach(kind => {
    (state[LIBRARY_KINDS[kind].stateKey] || []).forEach(item => {
      if (item.status === "done" && inMonth(item.completedAt)) {
        finished.push({ kind, id: item.id, title: item.displayTitle || item.title, emoji: item.coverEmoji || LIBRARY_KINDS[kind].defaultEmoji });
        addXp(item.sphereId, item.rewardXp);
        bump(item.completedAt, 2);
      }
    });
  });

  // Питание: дни с записями еды и средние калории по ним.
  const foodDays = [...new Set((state.nutritionLog || []).filter(e => e.kind === "food" && inMonth(e.date)).map(e => e.date))];
  const nutrition = {
    daysLogged: foodDays.length,
    avgCalories: foodDays.length ? Math.round(foodDays.reduce((a, d) => a + nutritionDayTotals(state.nutritionLog, d).calories, 0) / foodDays.length) : 0,
  };
  foodDays.forEach(d => bump(d));

  // Финансы: доходы, расходы по категориям, отложено. Долги и переводы между счетами в доходы и
  // расходы не входят — это не заработанные и не потраченные деньги.
  const tx = (state.transactions || []).filter(t => inMonth(t.date));
  const byCat = {};
  let income = 0, expense = 0, saved = 0;
  tx.forEach(t => {
    const amount = Number(t.amount) || 0;
    if (t.type === "income") income += amount;
    else if (t.type === "expense") { expense += amount; byCat[t.category || "Другое"] = (byCat[t.category || "Другое"] || 0) + amount; }
    else if (t.type === "savings") saved += t.direction === "withdraw" ? -amount : amount;
  });
  // Бюджет — по плану, который действовал в этом месяце, и с пометками, что в плане изменилось
  // по сравнению с прошлым месяцем (finance/budget.js). Для идущего месяца — траты по сегодня.
  const budget = budgetSummary(state.budgetHistory, tx, ym);
  const finance = {
    income, expense, saved,
    topCategories: Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, amount]) => ({ name, amount })),
    budget: { ...budget, changes: budgetChanges(state.budgetHistory, ym, shiftMonth(ym, -1)) },
  };

  const sphereRows = spheres.map(s => ({ id: s.id, name: s.name, color: s.color, icon: s.icon, xp: sphereXp[s.id] || 0 }));
  const xpTotal = sphereRows.reduce((a, s) => a + s.xp, 0);
  const days = Object.keys(dayScore).sort();
  const bestDay = days.reduce((best, d) => (!best || dayScore[d] > dayScore[best] ? d : best), null);

  // Ключевые числа месяца — по ним считаются звёзды медалей и сравнение с прошлым месяцем.
  const metrics = {
    quests: questsDone.length,
    xp: xpTotal,
    habitChecks,
    workouts: sport.sessions,
    pages,
    activeDays: days.length,
  };
  const hasData = metrics.quests + metrics.habitChecks + metrics.workouts + metrics.pages + metrics.activeDays + tx.length + campaignsDone.length + finished.length > 0;

  return {
    ym, title: reportTitle(ym), ongoing, countedDays, partial: !!limitDay, hasData, metrics,
    quests: { done: questsDone.length, failed: questsFailed.length, xp: questXp, gold: questGold },
    campaignsDone: campaignsDone.map(c => ({ id: c.id, title: c.title, color: c.color, xp: (c.reward && c.reward.grantedXp) || 0 })),
    spheres: sphereRows,
    habits: habits.filter(h => h.days > 0 || !h.linked),
    sport, pages, finished, nutrition, finance,
    bestDay: bestDay ? { date: bestDay, score: dayScore[bestDay] } : null,
  };
}

/* ------------------------------ Медали ------------------------------ */

// Медали со звёздами меряют месяц относительно ТВОИХ прошлых месяцев, а не абсолютных чисел:
// двадцать тренировок для одного — подвиг, для другого — обычный месяц.
//   ★   — больше, чем в среднем за прошлые месяцы (до трёх),
//   ★★  — на четверть больше лучшего из них,
//   ★★★ — в полтора раза больше лучшего и личный рекорд за всё время.
// Первый месяц сравнивать не с чем — в нём звёздных медалей нет, только особые.
export const STAR_MEDALS = [
  { id: "quests",      metric: "quests",      title: "Охотник за квестами", unit: ["квест", "квеста", "квестов"],      icon: "ScrollText", color: "amber" },
  { id: "xp",          metric: "xp",          title: "Рост",                unit: ["XP", "XP", "XP"],                   icon: "TrendingUp", color: "indigo" },
  { id: "habitChecks", metric: "habitChecks", title: "Дисциплина",          unit: ["отметка", "отметки", "отметок"],    icon: "CheckSquare", color: "sky" },
  { id: "workouts",    metric: "workouts",    title: "Атлет",               unit: ["тренировка", "тренировки", "тренировок"], icon: "Dumbbell", color: "emerald" },
  { id: "pages",       metric: "pages",       title: "Книжный червь",       unit: ["страница", "страницы", "страниц"],  icon: "BookOpen", color: "violet" },
  { id: "activeDays",  metric: "activeDays",  title: "Каждый день в деле",  unit: ["день", "дня", "дней"],              icon: "Flame", color: "orange" },
];

export function starsFor(value, prior, allTimeBest) {
  if (!prior.length || !(value > 0)) return 0;
  const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const best = Math.max(...prior);
  if (value <= avg) return 0;
  if (best > 0 && value >= best * 1.5 && value > allTimeBest) return 3;
  if (best === 0 && value > allTimeBest) return 3;
  if (value >= best * 1.25 && value > best) return 2;
  return 1;
}

// Первый месяц, в котором вообще что-то происходило, — от него считается история. Месяцы до
// начала пользования приложением в сравнение не идут: иначе первый же месяц был бы «рекордом».
export function firstActiveMonth(state, today) {
  const dates = [];
  (state.quests || []).forEach(q => { if (q.status === "done" && q.completedAt) dates.push(q.completedAt); });
  (state.habits || []).forEach(h => (h.logs || []).forEach(d => dates.push(d)));
  (state.workoutLog || []).forEach(w => { if (w.status === "done") dates.push(w.date); });
  (state.readingLog || []).forEach(e => dates.push(e.date));
  (state.transactions || []).forEach(t => { if (t.date && t.source !== "opening") dates.push(t.date); });
  (state.nutritionLog || []).forEach(e => dates.push(e.date));
  const valid = dates.filter(d => typeof d === "string" && (!today || d <= today)).sort();
  return valid.length ? monthOf(valid[0]) : null;
}

export function reportMedals(state, ym, today, cache = {}) {
  const get = (m) => cache[m] || (cache[m] = buildMonthReport(state, m, today));
  const report = get(ym);
  const first = firstActiveMonth(state, today);
  const history = [];
  if (first) for (let m = shiftMonth(ym, -1); m >= first; m = shiftMonth(m, -1)) history.push(get(m));
  const prior = history.slice(0, 3);
  const medals = [];

  // Звёзды — только за завершённый месяц: идущий ещё не догнал прошлые по числу дней.
  if (!report.ongoing) STAR_MEDALS.forEach(def => {
    const value = report.metrics[def.metric];
    const stars = starsFor(value, prior.map(r => r.metrics[def.metric]), Math.max(0, ...history.map(r => r.metrics[def.metric])));
    if (stars) medals.push({ ...def, stars, value, prev: prior[0] ? prior[0].metrics[def.metric] : null });
  });

  // Особые медали — за событие, а не за рост: им не нужна история.
  report.habits.filter(h => h.perfect && !h.linked).forEach(h => medals.push({
    id: `perfect-${h.id}`, title: "Без пропусков", detail: h.title, icon: "CalendarCheck", color: "sky", special: true }));
  report.campaignsDone.forEach(c => medals.push({
    id: `campaign-${c.id}`, title: "Полководец", detail: c.title, icon: "Flag", color: "amber", special: true }));
  if (report.spheres.length && report.spheres.every(s => s.xp > 0)) medals.push({
    id: "harmony", title: "Гармония", detail: "Опыт во всех сферах", icon: "Compass", color: "cyan", special: true });
  const bestHabitStreak = Math.max(0, ...report.habits.map(h => h.bestStreak));
  if (bestHabitStreak >= 21) medals.push({
    id: "streak", title: "Железная серия", detail: `${bestHabitStreak} дней подряд`, icon: "Zap", color: "orange", special: true });
  if (report.finance.saved > 0 && report.finance.income > report.finance.expense) medals.push({
    id: "saver", title: "Копилка", detail: "Доход выше расходов, отложено", icon: "PiggyBank", color: "emerald", special: true });
  const b = report.finance.budget;
  if (!report.ongoing && b.planned > 0 && b.over.length === 0) medals.push({
    id: "budget", title: "Экономист", detail: `Все ${b.rows.length} ${b.rows.length === 1 ? "категория" : "категории"} бюджета в рамках`, icon: "Wallet", color: "emerald", special: true });
  if (report.finished.length) medals.push({
    id: "finisher", title: "Финишер", detail: report.finished.map(f => f.title).join(", "), icon: "Trophy", color: "violet", special: true });

  return medals.sort((a, b) => (b.stars || 0) - (a.stars || 0));
}

// Сферы, которые просели: опыта меньше, чем в прошлом месяце. Самая просевшая — первой.
export function sphereDrops(report, prevReport) {
  if (!prevReport) return [];
  return report.spheres
    .map(s => { const p = prevReport.spheres.find(x => x.id === s.id); return { ...s, prevXp: p ? p.xp : 0, delta: s.xp - (p ? p.xp : 0) }; })
    .filter(s => s.prevXp > 0 && s.delta < 0)
    .sort((a, b) => a.delta - b.delta);
}

/* ------------------------- Архив и уведомление ------------------------- */

// Все месяцы с первого активного по текущий — новые первыми. Текущий помечается как идущий.
export function reportMonths(state, today) {
  const first = firstActiveMonth(state, today);
  if (!first) return [];
  const out = [];
  for (let m = monthOf(today); m >= first; m = shiftMonth(m, -1)) out.push(m);
  return out;
}

// Отчёт, с которым сравнивать: прошлый месяц целиком, а для идущего — те же дни прошлого месяца.
export function comparisonReport(state, ym, today) {
  const report = buildMonthReport(state, ym, today);
  const prevYm = shiftMonth(ym, -1);
  const first = firstActiveMonth(state, today);
  if (!first || prevYm < first) return null;
  return buildMonthReport(state, prevYm, today, report.ongoing ? report.countedDays : null);
}

// Лучшие медали последнего завершённого месяца — для профиля. Пока отчёт не открыт, медали не
// раскрываются (seen:false): профиль не должен портить вскрытие отчёта.
export function profileMedals(state, today, limit = 5) {
  const ym = shiftMonth(monthOf(today), -1);
  const report = buildMonthReport(state, ym, today);
  if (!report.hasData) return null;
  const seen = (state.reportsSeen || []).includes(ym);
  const all = seen ? reportMedals(state, ym, today) : [];
  return { ym, seen, total: all.length, medals: all.slice(0, limit) };
}

// Отчёт, о котором стоит сообщить: прошлый месяц, в нём что-то было и его ещё не открывали.
export function pendingReport(state, today) {
  const ym = shiftMonth(monthOf(today), -1);
  if ((state.reportsSeen || []).includes(ym)) return null;
  const report = buildMonthReport(state, ym, today);
  if (!report.hasData) return null;
  return { ym, medals: reportMedals(state, ym, today).length };
}
