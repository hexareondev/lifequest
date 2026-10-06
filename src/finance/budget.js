// Бюджеты по категориям расходов — с историей.
//
// Бюджет хранится не одним набором «категория → сумма» на все времена, а списком планов, каждый
// из которых действует с какого-то месяца и до следующего плана:
//   state.budgetHistory = [{ from:"2026-09", limits:{ "Еда":28000, "Жильё":33000 } }, …]
// План месяца — последний план с from ≤ месяц. Поэтому правка в октябре меняет октябрь и всё, что
// после него, но не трогает сентябрь: у сентября остаётся свой план, и итоги прошлых месяцев
// считаются по тем лимитам, что действовали тогда.
//
// Отслеживаемые категории — это ключи limits: добавить категорию в бюджет — значит завести ей лимит,
// убрать — удалить ключ (с этого месяца и дальше).

// Месяц «с самого начала»: старое сохранение, где бюджет был один на всё время, становится одним
// планом с этой отметкой — для прошлых месяцев ничего не меняется.
export const BUDGET_SINCE_START = "0000-01";

export function normalizeBudgetHistory(raw) {
  if (Array.isArray(raw.budgetHistory)) {
    return raw.budgetHistory
      .filter(p => p && typeof p.from === "string" && p.limits && typeof p.limits === "object")
      .map(p => ({ from: p.from, limits: { ...p.limits } }))
      .sort((a, b) => a.from.localeCompare(b.from));
  }
  if (raw.budgets && typeof raw.budgets === "object") return [{ from: BUDGET_SINCE_START, limits: { ...raw.budgets } }];
  return null;
}

// План, действующий в месяце ym: { from, limits }. Нет плана — пустые лимиты.
export function budgetPlanFor(history, ym) {
  let plan = null;
  (history || []).forEach(p => { if (p.from <= ym) plan = p; });
  return plan ? { from: plan.from, limits: plan.limits } : { from: null, limits: {} };
}

// Чем план месяца отличается от плана предыдущего месяца — для пометок в бюджете и в отчёте.
export function budgetChanges(history, ym, prevYm) {
  const cur = budgetPlanFor(history, ym).limits, prev = budgetPlanFor(history, prevYm).limits;
  const added = Object.keys(cur).filter(c => !(c in prev));
  const removed = Object.keys(prev).filter(c => !(c in cur));
  const changed = Object.keys(cur).filter(c => c in prev && prev[c] !== cur[c]).map(c => ({ category: c, from: prev[c], to: cur[c] }));
  return { added, removed, changed, any: added.length + removed.length + changed.length > 0 };
}

// Поставить лимит категории (amount — число) или убрать категорию из бюджета (amount === null)
// начиная с месяца ym. План ym заводится копией действующего, если его ещё нет; та же правка
// применяется ко всем более поздним планам — «с этого месяца и дальше» значит именно это, а прочие
// их отличия сохраняются. Более ранние планы не трогаются.
export function setBudgetFrom(history, ym, category, amount) {
  let list = (history || []).map(p => ({ from: p.from, limits: { ...p.limits } }));
  if (!list.some(p => p.from === ym)) {
    list.push({ from: ym, limits: { ...budgetPlanFor(list, ym).limits } });
    list.sort((a, b) => a.from.localeCompare(b.from));
  }
  list = list.map(p => {
    if (p.from < ym) return p;
    const limits = { ...p.limits };
    if (amount === null) delete limits[category]; else limits[category] = amount;
    return { ...p, limits };
  });
  // Подряд идущие одинаковые планы ничего не добавляют — схлопываем, чтобы история не росла
  // от правок туда-обратно.
  return list.filter((p, i) => i === 0 || JSON.stringify(p.limits) !== JSON.stringify(list[i - 1].limits));
}

// Итоги бюджета за месяц: по каждой отслеживаемой категории — лимит и потрачено, плюс общие суммы.
// Траты вне бюджета (категории без лимита) считаются отдельно: «потрачено в общем» — это все
// расходы месяца, а не только по отслеживаемым.
export function budgetSummary(history, transactions, ym) {
  const { limits } = budgetPlanFor(history, ym);
  const spent = {};
  let totalExpense = 0;
  (transactions || []).forEach(t => {
    if (t.type !== "expense" || typeof t.date !== "string" || t.date.slice(0, 7) !== ym) return;
    const amount = Number(t.amount) || 0;
    spent[t.category] = (spent[t.category] || 0) + amount;
    totalExpense += amount;
  });
  const rows = Object.keys(limits).map(category => ({ category, limit: Number(limits[category]) || 0, spent: spent[category] || 0 }));
  const planned = rows.reduce((a, r) => a + r.limit, 0);
  const spentInBudget = rows.reduce((a, r) => a + r.spent, 0);
  return {
    rows, planned, spentInBudget, totalExpense,
    outside: totalExpense - spentInBudget,
    over: rows.filter(r => r.limit > 0 && r.spent > r.limit).map(r => r.category),
  };
}
