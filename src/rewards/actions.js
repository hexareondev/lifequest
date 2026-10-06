// Действия раздела «Награды»: создание, удаление и покупка за золото.
// Устроены как действия финансов — см. finance/actions.js.

import { todayStr, uid } from "../core/basics.js";
import { insertAt } from "../core/lists.js";
import { LIBRARY_KINDS, libraryDisplayTitle, libraryStatusLabel } from "../library/constants.js";
import { Coins, Gem, Trash2 } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function rewardActions({ setState, commit, pushToast }) {
  return {
    // id и дата считаются ДО функции обновления: React вправе прогнать её дважды.
    addReward(r) {
      const id = uid();
      setState(prev => ({ ...prev, rewards: [{ id, purchases:[], ...r }, ...prev.rewards] }));
    },

    deleteReward(id) {
      commit((prev, defer) => {
        const removedIdx = prev.rewards.findIndex(r => r.id===id);
        const removed = prev.rewards[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Награда удалена", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, rewards: insertAt(p2.rewards, removedIdx, removed) }));
        }));
        return { ...prev, rewards: prev.rewards.filter(r => r.id!==id) };
      });
    },

    purchaseReward(id) {
      const today = todayStr();
      commit((prev, defer) => {
        const reward = prev.rewards.find(r => r.id===id);
        if (!reward || prev.profile.currency < reward.cost) { defer(() => pushToast("Недостаточно золота", toastIcon(Coins, "text-red-400"))); return prev; }
        let next = {
          ...prev,
          profile: { ...prev.profile, currency: prev.profile.currency - reward.cost },
          rewards: prev.rewards.map(r => r.id===id ? { ...r, purchases:[...(r.purchases||[]), today] } : r),
        };
        // Награда, привязанная к библиотеке: вещь куплена — значит она больше не «Хочу купить», а
        // «Хочу прочитать/поиграть/посмотреть». Статус меняем только если он всё ещё "buy": вещь
        // могли купить и руками, и тогда навязывать ей откат к «хочу» неправильно.
        const link = reward.link;
        const item = link && LIBRARY_KINDS[link.kind] ? (prev[LIBRARY_KINDS[link.kind].stateKey]||[]).find(x => x.id===link.itemId) : null;
        const movedItem = item && item.status === "buy";
        if (movedItem) {
          const key = LIBRARY_KINDS[link.kind].stateKey;
          next[key] = next[key].map(x => x.id===link.itemId ? { ...x, status:"want" } : x);
        }
        defer(() => pushToast(
          movedItem ? `Куплено: ${libraryDisplayTitle(item)} → «${libraryStatusLabel(link.kind, "want")}»` : `Награда получена: ${reward.title}`,
          toastIcon(Gem, "text-violet-400"),
          () => setState(p2 => {
            const reverted = {
              ...p2,
              profile: { ...p2.profile, currency: p2.profile.currency + reward.cost },
              rewards: p2.rewards.map(r => r.id===id ? { ...r, purchases:(r.purchases||[]).slice(0,-1) } : r),
            };
            if (movedItem) {
              const key = LIBRARY_KINDS[link.kind].stateKey;
              reverted[key] = reverted[key].map(x => x.id===link.itemId ? { ...x, status:"buy" } : x);
            }
            return reverted;
          })
        ));
        return next;
      });
    },
  };
}
