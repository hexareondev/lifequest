// Действия раздела «Привычки»: создание, правка, удаление и отметка за сегодня.
// Устроены как действия финансов — см. finance/actions.js. Дополнительно получают setLevelUp:
// отметка привычки может поднять уровень, и App показывает об этом окно.

import { todayStr, uid } from "../core/basics.js";
import { insertAt } from "../core/lists.js";
import { levelFromXp, overallOf } from "../core/xp.js";
import { CheckSquare, Flame, Trash2 } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function habitActions({ setState, commit, pushToast, setLevelUp }) {
  return {
    // id и дата считаются ДО функции обновления: React вправе прогнать её дважды.
    addHabit(h) {
      const id = uid();
      setState(prev => ({ ...prev, habits: [{ id, logs:[], claimedDates:[], ...h }, ...prev.habits] }));
      pushToast("Привычка добавлена", toastIcon(CheckSquare, "text-amber-400"));
    },

    deleteHabit(id) {
      commit((prev, defer) => {
        const removedIdx = prev.habits.findIndex(h => h.id===id);
        const removed = prev.habits[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Привычка удалена", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, habits: insertAt(p2.habits, removedIdx, removed) }));
        }));
        return { ...prev, habits: prev.habits.filter(h => h.id!==id) };
      });
    },

    updateHabit(id, patch) { setState(prev => ({ ...prev, habits: prev.habits.map(h => h.id===id ? { ...h, ...patch } : h) })); },

    toggleHabitToday(id) {
      // Награда начисляется не более одного раза в день на привычку, даже если чекбокс
      // кликнули туда-обратно несколько раз — статус "выполнено" при этом переключается свободно.
      // Полный откат (с очисткой claimedDates) доступен только через "Отменить" в тосте сразу после отметки.
      const t = todayStr();
      commit((prev, defer) => {
        // Привязанные привычки (питание/вода/чтение) урегулируются автоматически синком, а не
        // ручным чекбоксом — если сюда всё же прилетел клик по такой (UI не должен такое допускать),
        // просто игнорируем, чтобы не спутать claimedTiers с логикой claimedDates.
        const target = prev.habits.find(h => h.id===id);
        if (target && target.linkedKind) return prev;
        const prevLevel = overallOf(prev).level;
        let grantedNow = false;
        const habits = prev.habits.map(h => {
          if (h.id!==id) return h;
          const logs = h.logs || [];
          const claimed = h.claimedDates || [];
          const isDone = logs.includes(t);
          if (isDone) return { ...h, logs: logs.filter(d => d!==t) };
          const alreadyClaimed = claimed.includes(t);
          grantedNow = !alreadyClaimed;
          return { ...h, logs: [...logs, t], claimedDates: alreadyClaimed ? claimed : [...claimed, t] };
        });
        const habit = habits.find(h => h.id===id);
        let spheres = prev.spheres;
        let people = prev.people;
        let currency = prev.profile.currency;
        if (habit && grantedNow) {
          spheres = prev.spheres.map(s => s.id===habit.sphereId ? { ...s, xp: s.xp + 8 } : s);
          people = habit.personId ? (prev.people||[]).map(p => p.id===habit.personId ? { ...p, xp: p.xp + 8 } : p) : prev.people;
          currency = currency + 3;
        }
        const newLevel = levelFromXp(spheres.reduce((a,s)=>a+s.xp,0)).level;
        if (grantedNow) {
          const sphereId = habit.sphereId, personId = habit.personId;
          defer(() => {
            pushToast("Привычка отмечена: +8 XP", toastIcon(Flame, "text-orange-400"), () => {
              setState(p2 => ({
                ...p2,
                habits: p2.habits.map(h => h.id===id ? { ...h, logs:(h.logs||[]).filter(d=>d!==t), claimedDates:(h.claimedDates||[]).filter(d=>d!==t) } : h),
                spheres: p2.spheres.map(s => s.id===sphereId ? { ...s, xp: Math.max(0, s.xp-8) } : s),
                people: personId ? (p2.people||[]).map(p => p.id===personId ? { ...p, xp: Math.max(0, p.xp-8) } : p) : p2.people,
                profile: { ...p2.profile, currency: Math.max(0, p2.profile.currency-3) },
              }));
            });
            if (newLevel > prevLevel) setLevelUp(newLevel);
          });
        }
        return { ...prev, habits, spheres, people, profile: { ...prev.profile, currency } };
      });
    },
  };
}
