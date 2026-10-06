// Действия профиля: сам профиль, его настройки и достижения.
// Устроены как действия финансов — см. finance/actions.js.

import { uid } from "../core/basics.js";
import { insertAt } from "../core/lists.js";
import { Award, Trash2 } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function profileActions({ setState, commit, pushToast }) {
  return {
    updateProfile(patch) { setState(prev => ({ ...prev, profile: { ...prev.profile, ...patch } })); },

    updateProfilePrefs(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), profile: { statsCollapsed:false, ...(prev.uiPrefs && prev.uiPrefs.profile), ...patch } } }));
    },

    addAchievement(a) {
      const id = uid();
      setState(prev => ({ ...prev, achievements: [{ id, unlockedAt:null, ...a }, ...(prev.achievements||[])] }));
      pushToast("Достижение создано", toastIcon(Award, "text-amber-400"));
    },

    deleteAchievement(id) {
      commit((prev, defer) => {
        const removedIdx = (prev.achievements||[]).findIndex(a => a.id===id);
        const removed = (prev.achievements||[])[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Достижение удалено", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, achievements: insertAt(p2.achievements, removedIdx, removed) }));
        }));
        return { ...prev, achievements: (prev.achievements||[]).filter(a => a.id!==id) };
      });
    },
  };
}
