// Действия над сферами жизни: создание, правка, удаление (только если на сферу ничего не ссылается).
// Устроены как действия финансов — см. finance/actions.js.

import { uid } from "../core/basics.js";
import { insertAt } from "../core/lists.js";
import { questTouchesSphere } from "./links.js";
import { Shield, Trash2 } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function sphereActions({ setState, commit, pushToast }) {
  return {
    // id считается ДО функции обновления: React вправе прогнать её дважды.
    addSphere(s) {
      const id = uid();
      setState(prev => ({ ...prev, spheres: [...prev.spheres, { id, xp:0, ...s }] }));
    },

    updateSphere(id, patch) { setState(prev => ({ ...prev, spheres: prev.spheres.map(s => s.id===id ? { ...s, ...patch } : s) })); },

    deleteSphere(id) {
      commit((prev, defer) => {
        const inUse = prev.quests.some(q=>questTouchesSphere(q, id)) || prev.habits.some(h=>h.sphereId===id);
        if (inUse) { defer(() => pushToast("Нельзя удалить: есть связанные квесты или привычки", toastIcon(Shield, "text-red-400"))); return prev; }
        const removedIdx = prev.spheres.findIndex(s => s.id===id);
        const removed = prev.spheres[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Сфера удалена", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, spheres: insertAt(p2.spheres, removedIdx, removed) }));
        }));
        return { ...prev, spheres: prev.spheres.filter(s => s.id!==id) };
      });
    },
  };
}
