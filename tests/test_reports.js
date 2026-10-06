/* Боевые отчёты: итоги месяца из журналов и медали. Проверяется: в отчёт попадает только свой месяц,
   звёзды считаются от прошлых месяцев, первый месяц без звёзд, «без пропусков» не требует отметок
   до создания привычки и за дни, которые ещё не наступили; уведомление приходит один раз. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const R = load("reports/model.js");
const { reportActions } = load("reports/actions.js");

const TODAY = "2026-10-07";
const days = (ym, from, to) => { const out = []; for (let d = from; d <= to; d++) out.push(`${ym}-${String(d).padStart(2, "0")}`); return out; };
const quest = (id, date, xp, spheres) => ({ id, status: "done", completedAt: date, rewardXp: xp, rewardGold: 5, sphereIds: spheres, personIds: [] });
const workout = (date, kg) => ({ id: "w" + date, date, status: "done", minutes: 50, entries: [{ sets: [{ reps: 10, weight: kg, done: true }, { reps: 10, weight: kg, done: false }] }] });

function state() {
  return {
    spheres: [{ id: "health", name: "Здоровье", xp: 0 }, { id: "social", name: "Отношения", xp: 0 }],
    quests: [
      quest("a1", "2026-08-05", 10, ["health"]), quest("a2", "2026-08-20", 10, ["social"]),
      quest("s1", "2026-09-02", 10, ["health"]), quest("s2", "2026-09-10", 20, ["health", "social"]),
      quest("s3", "2026-09-11", 10, ["health"]), quest("s4", "2026-09-30", 10, ["health"]),
      { id: "f1", status: "failed", deadline: "2026-09-15", sphereIds: ["health"] },
      { id: "act", status: "active", deadline: "2026-09-20" },
    ],
    campaigns: [{ id: "c1", title: "Ремонт", status: "done", completedAt: "2026-09-30", sphereId: "health", reward: { grantedXp: 50 } }],
    habits: [
      { id: "h1", title: "Планировать день", sphereId: "health", createdAt: "2026-07-01", logs: [...days("2026-08", 1, 10), ...days("2026-09", 1, 30), ...days("2026-10", 1, 7)] },
      { id: "h2", title: "Новая", sphereId: "social", createdAt: "2026-09-20", logs: days("2026-09", 20, 30) },
      { id: "h3", title: "Вода", linkedKind: "nutritionWater", sphereId: "health", logs: ["2026-09-03"] },
    ],
    workoutLog: [workout("2026-08-03", 50), workout("2026-09-03", 60), workout("2026-09-05", 60), workout("2026-09-07", 60),
      { id: "skip", date: "2026-09-09", status: "skipped", entries: [] }],
    readingLog: [{ date: "2026-08-10", pages: 100 }, { date: "2026-09-10", pages: 40 }],
    books: [{ id: "b1", title: "Дюна", status: "done", completedAt: "2026-09-12", sphereId: "social", rewardXp: 30 }, { id: "b2", title: "Старая", status: "done" }],
    games: [], movies: [],
    nutritionLog: [{ kind: "food", date: "2026-09-01", calories: 1800 }, { kind: "food", date: "2026-09-01", calories: 200 }, { kind: "water", date: "2026-09-02", ml: 500 }],
    transactions: [
      { type: "income", amount: 100000, date: "2026-09-01" }, { type: "expense", amount: 30000, category: "Жильё", date: "2026-09-01" },
      { type: "expense", amount: 5000, category: "Еда", date: "2026-09-05" }, { type: "expense", amount: 3000, category: "Еда", date: "2026-09-15" },
      { type: "savings", direction: "deposit", amount: 10000, date: "2026-09-02" }, { type: "debt", direction: "lend", amount: 9999, date: "2026-09-03" },
      { type: "debt", direction: "lend", source: "opening", amount: 1, date: "2025-01-01" },
    ],
    reportsSeen: [],
  };
}

// Месяцы.
eq("сдвиг месяца через год", [R.shiftMonth("2026-01", -1), R.shiftMonth("2026-12", 1)], ["2025-12", "2027-01"]);
eq("дней в месяце", [R.monthDays("2026-02"), R.monthDays("2028-02"), R.monthDays("2026-09")], [28, 29, 30]);
eq("заголовки", [R.reportTitle("2026-09"), R.reportMonthWord("2026-09")], ["Сентябрь 2026", "сентябрь"]);

// Отчёт за сентябрь.
const s = state();
const sep = R.buildMonthReport(s, "2026-09", TODAY);
eq("квесты: выполненные за месяц и проваленные по сроку", [sep.quests.done, sep.quests.failed], [4, 1]);
eq("опыт по сферам: квесты + привычки + кампания + библиотека",
  sep.spheres.map(x => [x.id, x.xp]), [["health", 10 + 20 + 10 + 10 + 30 * 8 + 50], ["social", 20 + 11 * 8 + 30]]);
eq("привязанная привычка опыт не даёт, но отметки считает", sep.habits.find(h => h.id === "h3").days, 1);
eq("привычка «каждый день» — без пропусков", sep.habits.find(h => h.id === "h1").perfect, true);
eq("заведённая 20-го — не без пропусков, но и не в вину", [sep.habits.find(h => h.id === "h2").days, sep.habits.find(h => h.id === "h2").perfect], [11, false]);
eq("серия внутри месяца", sep.habits.find(h => h.id === "h1").bestStreak, 30);
eq("спорт: только выполненные, тоннаж по отмеченным подходам", [sep.sport.sessions, sep.sport.volume, sep.sport.minutes], [3, 1800, 150]);
eq("страницы и завершённое — только с датой", [sep.pages, sep.finished.map(f => f.title)], [40, ["Дюна"]]);
eq("питание: день с записями и калории за день", sep.nutrition, { daysLogged: 1, avgCalories: 2000 });
eq("финансы: долги не доход и не расход", [sep.finance.income, sep.finance.expense, sep.finance.saved], [100000, 38000, 10000]);
eq("главные траты", sep.finance.topCategories, [{ name: "Жильё", amount: 30000 }, { name: "Еда", amount: 8000 }]);
eq("кампании месяца", sep.campaignsDone.map(c => c.title), ["Ремонт"]);
eq("лучший день: 3-е (тренировка и две привычки) и 10-е (квест, привычка, страницы) равны — берётся ранний", sep.bestDay, { date: "2026-09-03", score: 4 });
eq("месяц завершён", sep.ongoing, false);

// Идущий месяц: «без пропусков» по сегодняшний день.
const oct = R.buildMonthReport(s, "2026-10", TODAY);
eq("октябрь идёт, учтено 7 дней", [oct.ongoing, oct.countedDays], [true, 7]);
eq("без пропусков по сегодня", oct.habits.find(h => h.id === "h1").perfect, true);
const cmp = R.comparisonReport(s, "2026-10", TODAY);
eq("идущий месяц сравнивается с теми же днями прошлого", [cmp.ym, cmp.partial, cmp.countedDays, cmp.metrics.quests, cmp.metrics.workouts], ["2026-09", true, 7, 1, 3]);
eq("завершённый месяц — с прошлым целиком", [R.comparisonReport(s, "2026-09", TODAY).partial, R.comparisonReport(s, "2026-09", TODAY).metrics.quests], [false, 2]);
eq("первый месяц сравнивать не с чем", R.comparisonReport(s, "2026-08", TODAY), null);
eq("в идущем месяце звёзд нет — только особые", R.reportMedals(s, "2026-10", TODAY).every(m => m.special), true);

// Звёзды.
eq("звёзды: не выше среднего — нет", R.starsFor(5, [5, 5], 5), 0);
eq("звёзды: выше среднего — одна", R.starsFor(6, [4, 6], 6), 1);
eq("звёзды: на четверть лучше лучшего — две", R.starsFor(10, [8, 4], 8), 2);
eq("звёзды: в полтора раза и рекорд — три", R.starsFor(12, [8, 4], 8), 3);
eq("звёзды: в полтора раза, но не рекорд за всё время — две", R.starsFor(12, [8, 4], 20), 2);
eq("звёзды: без истории — нет", R.starsFor(12, [], 0), 0);
eq("звёзды: ноль — нет", R.starsFor(0, [0], 0), 0);
eq("звёзды: после пустых месяцев — рекорд", R.starsFor(3, [0, 0], 0), 3);

// Медали сентября: сравнение с августом; август — первый месяц.
eq("первый активный месяц не считает долг «с начала учёта»", R.firstActiveMonth(s, TODAY), "2026-08");
const medals = R.reportMedals(s, "2026-09", TODAY);
const byId = Object.fromEntries(medals.map(m => [m.id, m]));
eq("квестов вдвое больше — три звезды", byId.quests.stars, 3);
eq("тренировок втрое больше — три звезды", byId.workouts.stars, 3);
eq("страниц меньше — медали нет", "pages" in byId, false);
eq("у звёздной медали — значение и прошлое", [byId.quests.value, byId.quests.prev], [4, 2]);
eq("особые: без пропусков, полководец, гармония, железная серия, копилка, финишер",
  ["perfect-h1", "campaign-c1", "harmony", "streak", "saver", "finisher"].map(id => id in byId), [true, true, true, true, true, true]);
eq("звёздные — первыми", medals[0].stars > 0, true);
eq("август — первый отчёт, звёзд нет", R.reportMedals(s, "2026-08", TODAY).filter(m => m.stars).length, 0);

// Просевшие сферы.
const aug = R.buildMonthReport(s, "2026-08", TODAY);
const st2 = state(); st2.quests = st2.quests.filter(q => q.id !== "s2"); st2.habits = st2.habits.filter(h => h.id !== "h2"); st2.books = [];
const sepLow = R.buildMonthReport(st2, "2026-09", TODAY);
eq("отношения просели относительно августа", R.sphereDrops(sepLow, aug).map(x => [x.id, x.delta]), [["social", -10]]);
eq("без прошлого месяца — нечего сравнивать", R.sphereDrops(sep, null), []);

// Архив и уведомление.
eq("месяцы архива — новые первыми, с текущим", R.reportMonths(s, TODAY), ["2026-10", "2026-09", "2026-08"]);
const pending = R.pendingReport(s, TODAY);
eq("уведомление о сентябре", pending.ym, "2026-09");
eq("в уведомлении — число медалей", pending.medals, medals.length);
const store = makeStore(s);
const act = reportActions(store);
act.markReportSeen("2026-09");
act.markReportSeen("2026-09");
eq("отметка открытия — один раз", store.state.reportsSeen, ["2026-09"]);
eq("после открытия уведомления нет", R.pendingReport(store.state, TODAY), null);
eq("пустой прошлый месяц — уведомления нет", R.pendingReport({ ...state(), quests: [], habits: [], workoutLog: [], readingLog: [], transactions: [], books: [], campaigns: [], nutritionLog: [] }, TODAY), null);

// Медали в профиле: пока отчёт не открыт — не раскрываются; потом — лучшие, звёздные первыми.
{
  const st = state();
  const hidden = R.profileMedals(st, TODAY);
  eq("профиль: отчёт не открыт — медалей не видно", [hidden.ym, hidden.seen, hidden.medals.length], ["2026-09", false, 0]);
  st.reportsSeen = ["2026-09"];
  const shown = R.profileMedals(st, TODAY, 3);
  eq("профиль: после открытия — не больше лимита", shown.medals.length, 3);
  eq("профиль: всего медалей — для «и ещё N»", shown.total, R.reportMedals(st, "2026-09", TODAY).length);
  eq("профиль: звёздные первыми", shown.medals.every(m => m.stars > 0), true);
  eq("профиль: пустой прошлый месяц — карточки нет", R.profileMedals({ ...state(), quests: [], habits: [], workoutLog: [], readingLog: [], transactions: [], books: [], campaigns: [], nutritionLog: [] }, TODAY), null);
}

done();
