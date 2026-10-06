// Действия Настроек: пулы эмодзи, поощрения за ведение, вкладки меню, резервная копия, API-ключи.
// Устроены как действия финансов — см. finance/actions.js.

import { defaultApiKeys } from "../core/prefs.js";
import { fullTabOrder } from "../core/tabs.js";
import { defaultMiscPrefs } from "../misc/model.js";
import { todayStr, uid } from "../core/basics.js";
import { defaultLogRewards } from "../habits/model.js";
import { defaultEmojiAssignments, defaultEmojiPools } from "../ui/emoji-pools.js";
import { Shield, Sparkles } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function settingsActions({ setState, commit, pushToast }) {
  return {
    // Добавление уже дедуплицировано на уровне компонента (EmojiPicker сам решает "выбрать, а
    // не дублировать"), но проверяем ещё раз и тут — на случай прямого вызова экшена.
    addPoolEmoji(poolId, emoji) {
      setState(prev => {
        const pools = (prev.uiPrefs && prev.uiPrefs.emojiPools) || defaultEmojiPools();
        const pool = pools[poolId];
        if (!pool || pool.emojis.includes(emoji)) return prev;
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiPools: { ...pools, [poolId]: { ...pool, emojis:[...pool.emojis, emoji] } } } };
      });
    },

    removePoolEmoji(poolId, emoji) {
      setState(prev => {
        const pools = (prev.uiPrefs && prev.uiPrefs.emojiPools) || defaultEmojiPools();
        const pool = pools[poolId];
        if (!pool) return prev;
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiPools: { ...pools, [poolId]: { ...pool, emojis: pool.emojis.filter(e => e!==emoji) } } } };
      });
    },

    createEmojiPool(name) {
      const id = `pool_${uid()}`;
      setState(prev => {
        const pools = (prev.uiPrefs && prev.uiPrefs.emojiPools) || defaultEmojiPools();
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiPools: { ...pools, [id]: { name: name.trim() || "Новый пул", emojis:[] } } } };
      });
    },

    renameEmojiPool(poolId, name) {
      setState(prev => {
        const pools = (prev.uiPrefs && prev.uiPrefs.emojiPools) || defaultEmojiPools();
        if (!pools[poolId] || !name.trim()) return prev;
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiPools: { ...pools, [poolId]: { ...pools[poolId], name:name.trim() } } } };
      });
    },

    // Нельзя удалить пул, пока хоть одна категория на него ссылается — сначала нужно
    // переназначить категорию на другой пул (та же логика, что блокирует удаление сферы,
    // если на неё ссылаются квесты/привычки).
    deleteEmojiPool(poolId) {
      commit((prev, defer) => {
        const pools = (prev.uiPrefs && prev.uiPrefs.emojiPools) || defaultEmojiPools();
        const assignments = (prev.uiPrefs && prev.uiPrefs.emojiAssignments) || defaultEmojiAssignments();
        const inUse = Object.values(assignments).includes(poolId);
        if (inUse || Object.keys(pools).length<=1) {
          defer(() => pushToast("Нельзя удалить: пул используется — сначала переназначь категории на другой пул", toastIcon(Shield, "text-red-400")));
          return prev;
        }
        const rest = { ...pools };
        delete rest[poolId];
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiPools: rest } };
      });
    },

    setEmojiAssignment(category, poolId) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiAssignments: { ...((prev.uiPrefs && prev.uiPrefs.emojiAssignments) || defaultEmojiAssignments()), [category]: poolId } } }));
    },

    // Включение фиксирует дату: награда идёт с этого дня, а не задним числом за всю историю.
    // Выключение дату не стирает и уже начисленное не отбирает — принцип «без клавбэка».
    setLogRewards(enabled) {
      const today = todayStr();
      commit((prev, defer) => {
        const cur = { ...defaultLogRewards(), ...(prev.logRewards||{}) };
        defer(() => pushToast(enabled ? "Поощрения за ведение включены" : "Поощрения за ведение выключены",
          toastIcon(Sparkles, "text-amber-400")));
        return { ...prev, logRewards: { ...cur, enabled, enabledAt: enabled ? today : cur.enabledAt } };
      });
    },

    markBackupDone() {
      const today = todayStr();
      setState(prev => ({ ...prev, lastBackupAt: today }));
    },

    updateMiscPrefs(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), misc: { ...defaultMiscPrefs(), ...(prev.uiPrefs && prev.uiPrefs.misc), ...patch } } }));
    },

    updateApiKeys(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), apiKeys: { ...defaultApiKeys(), ...(prev.uiPrefs && prev.uiPrefs.apiKeys), ...patch } } }));
    },

    // Единый экшен на перетаскивание и на стрелки вверх/вниз в списке вкладок меню — тот же
    // паттерн, что у категорий/типов отношений/людей. "hub" — как "Другое" у категорий, только
    // закреплён первым, а не последним: никогда не двигается и не скрывается.
    reorderTab(fromId, toId) {
      if (fromId==="hub" || toId==="hub") return;
      setState(prev => {
        const order = fullTabOrder(prev);
        const movable = order.filter(id => id!=="hub");
        const fromIdx = movable.indexOf(fromId);
        const toIdx = movable.indexOf(toId);
        if (fromIdx<0 || toIdx<0 || fromIdx===toIdx) return prev;
        const copy = movable.slice();
        const [item] = copy.splice(fromIdx, 1);
        copy.splice(toIdx, 0, item);
        const tabsPref = (prev.uiPrefs && prev.uiPrefs.tabs) || { hidden: [] };
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), tabs: { ...tabsPref, order: ["hub", ...copy] } } };
      });
    },

    toggleTabHidden(id) {
      if (id === "hub") return;
      setState(prev => {
        const tabsPref = (prev.uiPrefs && prev.uiPrefs.tabs) || { order: fullTabOrder(prev), hidden: [] };
        const hidden = tabsPref.hidden.includes(id) ? tabsPref.hidden.filter(x => x!==id) : [...tabsPref.hidden, id];
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), tabs: { ...tabsPref, hidden } } };
      });
    },
  };
}
