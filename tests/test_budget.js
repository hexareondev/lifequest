/* Бюджет с историей планов. Проверяется: правка в месяце меняет его и следующие, но не прошлые;
   прошлый месяц не редактируется; выбор категорий; итоги месяца; пометки об изменениях; старое
   сохранение с единым бюджетом переезжает без изменений для прошлых месяцев. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const B = load("finance/budget.js");
const { financeActions } = load("finance/actions.js");
const { normalizeState } = load("state/model.js");
const { todayStr } = load("core/basics.js");
const R = load("reports/model.js");

const cur = todayStr().slice(0, 7);
const next = R.shiftMonth(cur, 1), prev = R.shiftMonth(cur, -1), prev2 = R.shiftMonth(cur, -2);

// План месяца — последний план с from ≤ месяц.
const H = [{ from: B.BUDGET_SINCE_START, limits: { "Еда": 100 } }, { from: "2026-09", limits: { "Еда": 200, "Кафе": 50 } }];
eq("план до изменения — старый", B.budgetPlanFor(H, "2026-08").limits, { "Еда": 100 });
eq("план с месяца изменения — новый", B.budgetPlanFor(H, "2026-12").limits, { "Еда": 200, "Кафе": 50 });
eq("без истории — пусто", B.budgetPlanFor([], "2026-09"), { from: null, limits: {} });

// Изменения относительно прошлого месяца.
eq("изменения в месяце смены плана", B.budgetChanges(H, "2026-09", "2026-08"),
  { added: ["Кафе"], removed: [], changed: [{ category: "Еда", from: 100, to: 200 }], any: true });
eq("в следующем месяце изменений нет", B.budgetChanges(H, "2026-10", "2026-09").any, false);

// Правка с месяца: заводит план, тянется в более поздние, ранние не трогает.
const H2 = B.setBudgetFrom(H, "2026-08", "Транспорт", 30);
eq("правка в августе: август и сентябрь получили категорию", [B.budgetPlanFor(H2, "2026-08").limits, B.budgetPlanFor(H2, "2026-09").limits],
  [{ "Еда": 100, "Транспорт": 30 }, { "Еда": 200, "Кафе": 50, "Транспорт": 30 }]);
eq("июль не тронут", B.budgetPlanFor(H2, "2026-07").limits, { "Еда": 100 });
const H3 = B.setBudgetFrom(H2, "2026-09", "Кафе", null);
eq("снять категорию с сентября", [B.budgetPlanFor(H3, "2026-09").limits, B.budgetPlanFor(H3, "2026-08").limits],
  [{ "Еда": 200, "Транспорт": 30 }, { "Еда": 100, "Транспорт": 30 }]);
const H4 = B.setBudgetFrom(H, "2026-09", "Еда", 100);
const H5 = B.setBudgetFrom(H4, "2026-09", "Кафе", null);
eq("правка обратно к прежнему — лишний план схлопывается", H5, [{ from: B.BUDGET_SINCE_START, limits: { "Еда": 100 } }]);
eq("исходная история не изменилась", H[1].limits, { "Еда": 200, "Кафе": 50 });

// Итоги месяца.
const tx = [
  { type: "expense", amount: 150, category: "Еда", date: "2026-09-02" },
  { type: "expense", amount: 80, category: "Кафе", date: "2026-09-03" },
  { type: "expense", amount: 40, category: "Такси", date: "2026-09-04" },
  { type: "expense", amount: 999, category: "Еда", date: "2026-08-30" },
  { type: "income", amount: 5000, category: "Зарплата", date: "2026-09-01" },
];
const s = B.budgetSummary(H, tx, "2026-09");
eq("строки по отслеживаемым категориям", s.rows, [{ category: "Еда", limit: 200, spent: 150 }, { category: "Кафе", limit: 50, spent: 80 }]);
eq("распланировано и потрачено по бюджету", [s.planned, s.spentInBudget], [250, 230]);
eq("всего расходов и вне бюджета", [s.totalExpense, s.outside], [270, 40]);
eq("перерасход по категориям", s.over, ["Кафе"]);

// Действие: прошлый месяц не редактируется, текущий и будущий — да.
{
  const store = makeStore({ budgetHistory: [{ from: B.BUDGET_SINCE_START, limits: { "Еда": 100 } }], transactions: [] });
  const act = financeActions(store);
  act.setBudget("Еда", 500, prev);
  eq("прошлый месяц не меняется", store.state.budgetHistory.length, 1);
  act.setBudget("Еда", 300, cur);
  eq("текущий месяц — новый лимит", B.budgetPlanFor(store.state.budgetHistory, cur).limits, { "Еда": 300 });
  eq("следующий тоже", B.budgetPlanFor(store.state.budgetHistory, next).limits, { "Еда": 300 });
  eq("прошлый — прежний", B.budgetPlanFor(store.state.budgetHistory, prev).limits, { "Еда": 100 });
  act.setBudget("Одежда", 0, next);
  eq("категория добавлена со следующего месяца", [cur, next].map(m => "Одежда" in B.budgetPlanFor(store.state.budgetHistory, m).limits), [false, true]);
  act.setBudget("Одежда", null, next);
  eq("снятие категории — с тостом", store.lastToast().text, "«Одежда» убрана из бюджета");
  eq("категория снята", "Одежда" in B.budgetPlanFor(store.state.budgetHistory, next).limits, false);
  store.undoLast();
  eq("откат вернул категорию с прежним лимитом", B.budgetPlanFor(store.state.budgetHistory, next).limits["Одежда"], 0);
  act.setBudget("Нет такой", null, cur);
  eq("снятие неотслеживаемой — без тоста", store.lastToast().text, "«Одежда» убрана из бюджета");
  act.setBudget("Еда", 300, undefined);
  eq("без месяца — ничего", B.budgetPlanFor(store.state.budgetHistory, cur).limits, { "Еда": 300 });
}

// Старое сохранение: единый бюджет становится планом «с начала», reportsSeen не теряется.
{
  const st = normalizeState({ budgets: { "Еда": 28000 }, reportsSeen: ["2026-09", 5] });
  eq("старый бюджет — план с самого начала", st.budgetHistory, [{ from: B.BUDGET_SINCE_START, limits: { "Еда": 28000 } }]);
  eq("старого поля больше нет", "budgets" in st, false);
  eq("открытые отчёты переживают загрузку", st.reportsSeen, ["2026-09"]);
  const again = normalizeState(JSON.parse(JSON.stringify(st)));
  eq("повторная загрузка ничего не меняет", [again.budgetHistory, again.reportsSeen], [st.budgetHistory, st.reportsSeen]);
}

// Отчёт: бюджет месяца с пометками и медаль «Экономист».
{
  const base = { spheres: [], quests: [], habits: [], workoutLog: [], readingLog: [], books: [], games: [], movies: [], nutritionLog: [], campaigns: [] };
  const state = { ...base, budgetHistory: H, transactions: tx.filter(t => t.category !== "Кафе") };
  const rep = R.buildMonthReport(state, "2026-09", "2026-10-07");
  eq("в отчёте — бюджет сентября", rep.finance.budget.rows.map(r => [r.category, r.limit, r.spent]), [["Еда", 200, 150], ["Кафе", 50, 0]]);
  eq("в отчёте — что изменилось в плане", [rep.finance.budget.changes.added, rep.finance.budget.changes.changed], [["Кафе"], [{ category: "Еда", from: 100, to: 200 }]]);
  eq("всё в рамках — медаль «Экономист»", R.reportMedals(state, "2026-09", "2026-10-07").some(m => m.id === "budget"), true);
  const overState = { ...state, transactions: tx };
  eq("перерасход — без медали", R.reportMedals(overState, "2026-09", "2026-10-07").some(m => m.id === "budget"), false);
}

done();
