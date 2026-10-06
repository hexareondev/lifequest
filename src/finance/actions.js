// Действия раздела «Финансы»: счета, операции, бюджеты, категории. Состояние меняется только через
// commit — обновление плюс отложенный побочный эффект (тост с откатом); почему так, а не прямой
// побочный эффект внутри setState, расписано у commit в questlife-app.jsx.
//
// Функция получает механику App и возвращает методы, которые App вливает в общий объект actions:
// компоненты по-прежнему зовут actions.addTransaction(...) и не знают, где метод живёт.

import { todayStr, uid } from "../core/basics.js";
import { insertAt, insertBeforeOther, moveInEditableList } from "../core/lists.js";
import { defaultFinanceTableFields } from "./model.js";
import { toastIcon } from "../ui/toast-icon.js";
import { Shield, Trash2, Wallet } from "lucide-react";

export function financeActions({ setState, commit, pushToast }) {
  return {
    addAccount(a) {
      // id и дата — до обновления, а не внутри: React вправе прогнать его дважды, и счёт получил бы
      // два разных id (тот же принцип, что у addQuest).
      const id = uid(), createdAt = todayStr();
      commit((prev, defer) => {
        const order = (prev.accounts||[]).length;
        defer(() => pushToast("Счёт создан", toastIcon(Wallet, "text-amber-400")));
        return { ...prev, accounts: [...(prev.accounts||[]), {
          id, kind:"regular", color:"amber", emoji:null, tracked:true, archived:false, order,
          createdAt, frozen:false, refillable:true, startDate:null, endDate:null, ...a,
        }] };
      });
    },
    updateAccount(id, patch) {
      setState(prev => ({ ...prev, accounts: (prev.accounts||[]).map(a => a.id===id ? { ...a, ...patch } : a) }));
    },
    // Порядок счетов задаётся вручную: он влияет и на списки в форме, и на разбивки, поэтому
    // держать первым тот счёт, которым пользуешься чаще, удобно. Двигаем обменом order с соседом
    // — тот же приём, что у категорий и типов отношений.
    moveAccount(id, delta) {
      setState(prev => {
        const list = (prev.accounts||[]).slice().sort((a,b) => (a.order??0)-(b.order??0));
        const idx = list.findIndex(a => a.id===id);
        const next = idx + delta;
        if (idx < 0 || next < 0 || next >= list.length) return prev;
        const reordered = list.slice();
        const [item] = reordered.splice(idx, 1);
        reordered.splice(next, 0, item);
        const orderById = {};
        reordered.forEach((a,i) => { orderById[a.id] = i; });
        return { ...prev, accounts: (prev.accounts||[]).map(a => ({ ...a, order: orderById[a.id] ?? a.order })) };
      });
    },
    toggleAccountTracked(id) {
      setState(prev => ({ ...prev, accounts: (prev.accounts||[]).map(a => a.id===id ? { ...a, tracked: a.tracked===false } : a) }));
    },
    // Счёт с историей удалять нельзя — операции остались бы висеть на несуществующем счёте, а их
    // суммы выпали бы из всех итогов. Тот же принцип, что у сфер с привязанными квестами: вместо
    // удаления предлагаем архивацию (счёт исчезает из выбора в форме, но история остаётся целой).
    deleteAccount(id) {
      commit((prev, defer) => {
        const inUse = (prev.transactions||[]).some(t => t.accountId===id || t.toAccountId===id);
        if (inUse) {
          defer(() => pushToast("Нельзя удалить: на счёте есть операции. Его можно архивировать", toastIcon(Shield, "text-red-400")));
          return prev;
        }
        const removedIdx = (prev.accounts||[]).findIndex(a => a.id===id);
        const removed = (prev.accounts||[])[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Счёт удалён", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, accounts: insertAt(p2.accounts, removedIdx, removed) }));
        }));
        return { ...prev, accounts: prev.accounts.filter(a => a.id!==id) };
      });
    },
    archiveAccount(id, archived) {
      setState(prev => ({ ...prev, accounts: (prev.accounts||[]).map(a => a.id===id ? { ...a, archived: !!archived } : a) }));
    },
    addTransaction(tx) {
      const id = uid();
      setState(prev => ({ ...prev, transactions: [{ id, ...tx }, ...prev.transactions] }));
    },
    updateTransaction(id, patch) { setState(prev => ({ ...prev, transactions: prev.transactions.map(t => t.id===id ? { ...t, ...patch } : t) })); },
    deleteTransaction(id) {
      commit((prev, defer) => {
        const removedIdx = prev.transactions.findIndex(t => t.id===id);
        const removed = prev.transactions[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Операция удалена", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, transactions: insertAt(p2.transactions, removedIdx, removed) }));
        }));
        return { ...prev, transactions: prev.transactions.filter(t => t.id!==id) };
      });
    },
    setBudget(category, amount) { setState(prev => ({ ...prev, budgets: { ...prev.budgets, [category]: amount } })); },

    addCategory(type, cat) {
      setState(prev => {
        if (prev.categories[type].some(c => c.name.toLowerCase()===cat.name.toLowerCase())) return prev;
        return { ...prev, categories: { ...prev.categories, [type]: insertBeforeOther(prev.categories[type], cat) } };
      });
    },
    deleteCategory(type, name) {
      commit((prev, defer) => {
        if (name === "Другое" || name === "Люди") return prev;
        const removed = prev.categories[type].find(c => c.name===name);
        defer(() => pushToast("Категория удалена", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => (p2.categories[type].some(c=>c.name===name) ? p2 : { ...p2, categories: { ...p2.categories, [type]: insertBeforeOther(p2.categories[type], removed) } }));
        }));
        return { ...prev, categories: { ...prev.categories, [type]: prev.categories[type].filter(c => c.name!==name) } };
      });
    },
    recolorCategory(type, name, color) {
      setState(prev => ({ ...prev, categories: { ...prev.categories, [type]: prev.categories[type].map(c => c.name===name ? { ...c, color } : c) } }));
    },
    reorderCategory(type, fromIdx, toIdx) {
      setState(prev => ({ ...prev, categories: { ...prev.categories, [type]: moveInEditableList(prev.categories[type], fromIdx, toIdx) } }));
    },

    updateFinanceTableFields(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), financeTableFields: { ...defaultFinanceTableFields(), ...(prev.uiPrefs && prev.uiPrefs.financeTableFields), ...patch } } }));
    },
  };
}
