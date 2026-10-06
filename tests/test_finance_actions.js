/* Действия раздела «Финансы» — так, как их вызывает приложение: через commit с откатом в тосте.
   Проверяется то, что легко сломать незаметно: защита счёта с историей, откат на прежнее место,
   «Другое» всегда последнее, порядок счетов. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const { financeActions } = load("finance/actions.js");
const { defaultFinanceTableFields } = load("finance/model.js");

function fresh() {
  const store = makeStore({
    accounts: [
      { id: "a1", name: "Карта",  order: 0, tracked: true },
      { id: "a2", name: "Наличные", order: 1, tracked: true },
      { id: "a3", name: "Вклад",  order: 2, tracked: true },
    ],
    transactions: [
      { id: "t1", accountId: "a1", amount: 100 },
      { id: "t2", accountId: "a1", amount: 200 },
      { id: "t3", accountId: "a1", toAccountId: "a3", amount: 50 },
    ],
    categories: {
      expense: [{ name: "Еда", color: "amber" }, { name: "Люди", color: "sky" }, { name: "Другое", color: "zinc" }],
      income:  [{ name: "Зарплата", color: "emerald" }, { name: "Другое", color: "zinc" }],
    },
    budgets: {},
    uiPrefs: {},
  });
  return { store, act: financeActions(store) };
}
const ids = (list) => list.map(x => x.id);
const names = (list) => list.map(x => x.name);

/* ---------- Счета ---------- */
{
  const { store, act } = fresh();
  act.addAccount({ name: "Копилка" });
  const added = store.state.accounts[3];
  eq("новый счёт встаёт в конец списка", added.name, "Копилка");
  eq("порядок нового счёта — следом за последним", added.order, 3);
  eq("по умолчанию обычный и учитываемый", [added.kind, added.tracked, added.archived], ["regular", true, false]);
  eq("создание подтверждается тостом", store.lastToast().text, "Счёт создан");
}
{
  const { store, act } = fresh();
  act.deleteAccount("a1");
  eq("счёт с операциями не удаляется", ids(store.state.accounts), ["a1", "a2", "a3"]);
  eq("вместо удаления — подсказка про архив", /архивировать/.test(store.lastToast().text), true);
  eq("у отказа отката нет", store.lastToast().undo, undefined);

  act.deleteAccount("a3");
  eq("счёт, на который были переводы, — тоже с историей", ids(store.state.accounts), ["a1", "a2", "a3"]);
}
{
  const { store, act } = fresh();
  act.deleteAccount("a2");
  eq("счёт без операций удаляется", ids(store.state.accounts), ["a1", "a3"]);
  store.undoLast();
  eq("откат возвращает счёт на прежнее место, а не в конец", ids(store.state.accounts), ["a1", "a2", "a3"]);
}
{
  const { store, act } = fresh();
  act.moveAccount("a1", -1);
  eq("первый счёт выше не поднимается", ids(store.state.accounts), ["a1", "a2", "a3"]);
  act.moveAccount("a3", +1);
  eq("последний ниже не опускается", store.state.accounts.map(a => a.order), [0, 1, 2]);
  act.moveAccount("a3", -1);
  const byOrder = store.state.accounts.slice().sort((a, b) => a.order - b.order);
  eq("перемещение меняет порядок с соседом", ids(byOrder), ["a1", "a3", "a2"]);
}
{
  const { store, act } = fresh();
  act.toggleAccountTracked("a2");
  eq("переключатель учёта выключает", store.state.accounts[1].tracked, false);
  act.toggleAccountTracked("a2");
  eq("и включает обратно", store.state.accounts[1].tracked, true);
}

/* ---------- Операции ---------- */
{
  const { store, act } = fresh();
  act.addTransaction({ accountId: "a2", amount: 7 });
  eq("новая операция — первой в списке", store.state.transactions[0].amount, 7);
  eq("и получает id", typeof store.state.transactions[0].id, "string");

  act.deleteTransaction("t2");
  eq("операция удаляется", ids(store.state.transactions).includes("t2"), false);
  store.undoLast();
  eq("откат возвращает операцию на её место", ids(store.state.transactions).slice(1), ["t1", "t2", "t3"]);

  act.deleteTransaction("нет-такой");
  eq("удаление несуществующей ничего не трогает", store.state.transactions.length, 4);
}

/* ---------- Категории ---------- */
{
  const { store, act } = fresh();
  act.addCategory("expense", { name: "Транспорт", color: "sky" });
  eq("новая категория встаёт перед «Другое»", names(store.state.categories.expense),
    ["Еда", "Люди", "Транспорт", "Другое"]);
  act.addCategory("expense", { name: "еДа", color: "red" });
  eq("дубль без учёта регистра не добавляется", store.state.categories.expense.length, 4);

  act.deleteCategory("expense", "Другое");
  act.deleteCategory("expense", "Люди");
  eq("«Другое» и «Люди» не удаляются", names(store.state.categories.expense),
    ["Еда", "Люди", "Транспорт", "Другое"]);

  act.deleteCategory("expense", "Еда");
  eq("обычная категория удаляется", names(store.state.categories.expense), ["Люди", "Транспорт", "Другое"]);
  store.undoLast();
  eq("откат возвращает её, «Другое» остаётся последним",
    names(store.state.categories.expense).slice(-1), ["Другое"]);
  eq("и категория снова в списке", names(store.state.categories.expense).includes("Еда"), true);
}

/* ---------- Настройки таблицы ---------- */
{
  const { store, act } = fresh();
  act.updateFinanceTableFields({ description: false });
  eq("правка колонки не теряет остальные умолчания",
    store.state.uiPrefs.financeTableFields, { ...defaultFinanceTableFields(), description: false });
}

done();
