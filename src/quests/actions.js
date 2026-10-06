// Действия раздела «Квесты»: квесты, подзадачи и кампании.
// Устроены как действия финансов — см. finance/actions.js. Дополнительно получают setLevelUp и
// setCampaignDone: выполнение квеста может поднять уровень или закрыть кампанию, и App показывает
// об этом окно.

import { todayStr, uid } from "../core/basics.js";
import { pluralRu } from "../core/format.js";
import { insertAt } from "../core/lists.js";
import { defaultQuestsPrefs } from "../core/prefs.js";
import { levelFromXp, overallOf } from "../core/xp.js";
import {
  applyCampaignSettlement, campaignStats, defaultCampaignReward, revertCampaignSettlement,
  settleCampaigns,
} from "./campaigns.js";
import { SUBTASK_PERSON_XP } from "./holidays.js";
import { normalizeQuestLinks, questPersonIds, questSphereIds } from "./links.js";
import { Archive, Flag, ScrollText, Sparkles, Trash2, Trophy } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function questActions({ setState, commit, pushToast, setLevelUp, setCampaignDone }) {
  return {
    addQuest(q) {
      // Новый квест в уже завершённой кампании возвращает её в активные — появился незакрытый
      // хвост. Повторной награды при следующем закрытии не будет: claimedFinal остался стоять
      // (сбросить его можно вручную, пункт «Разрешить награду снова» в кебабе кампании).
      // id генерируется ДО updater-а: React может прогнать его несколько раз, и внутри значение
      // получалось бы разным на каждом прогоне — updater обязан быть детерминированным.
      const quest = normalizeQuestLinks({ id:uid(), status:"active", subtasks:[], createdAt:todayStr(), ...q });
      commit((prev, defer) => {
        const quests = [quest, ...prev.quests];
        const { campaigns } = settleCampaigns(prev.campaigns, quests);
        defer(() => pushToast("Квест создан", toastIcon(ScrollText, "text-amber-400")));
        return { ...prev, quests, campaigns };
      });
    },

    // Правка квеста может переставить его в другую кампанию (или вынуть из неё) — обе кампании
    // нужно пересчитать. Награду это выдать может: если квест-провал перенесли из кампании, где
    // всё остальное выполнено, она честно закрывается.
    updateQuest(id, patch) {
      commit((prev, defer) => {
        const quests = prev.quests.map(q => q.id===id ? { ...q, ...patch } : q);
        const { state: next, rewards } = applyCampaignSettlement(prev, quests);
        if (rewards.length) defer(() => rewards.forEach(r => pushToast(`Кампания завершена: ${r.title}`, toastIcon(Flag, "text-amber-400"))));
        return next;
      });
    },

    deleteQuest(id) {
      commit((prev, defer) => {
        const removedIdx = prev.quests.findIndex(q => q.id===id);
        const removed = prev.quests[removedIdx];
        if (!removed) return prev;
        const quests = prev.quests.filter(q => q.id!==id);
        // Удаление проваленного квеста может ЗАКРЫТЬ кампанию (провал завершение блокирует) —
        // поэтому пересчёт обязателен и здесь, а undo обязан отобрать ровно то, что выдано.
        const { state: next, rewards } = applyCampaignSettlement(prev, quests);
        defer(() => {
          pushToast("Квест удалён", toastIcon(Trash2, "text-zinc-400"), () => {
            setState(p2 => {
              const reverted = revertCampaignSettlement(p2, rewards);
              return { ...reverted, quests: insertAt(reverted.quests, removedIdx, removed) };
            });
          });
          rewards.forEach(r => pushToast(`Кампания завершена: ${r.title} · +${r.xp} XP, +${r.gold} золота`, toastIcon(Flag, "text-amber-400")));
        });
        return next;
      });
    },

    // Подзадачи с personId (только у мульти-праздничных квестов, см. computeSyncedHolidayQuests) —
    // отметка/снятие сразу начисляет/списывает этому человеку небольшую награду, симметрично и
    // идемпотентно (тот же принцип, что completeQuest/reopenQuest: сам toggle done — единственный
    // источник истины, отдельного "claimed"-множества не нужно). У обычных подзадач personId нет —
    // для них ветка ниже просто не срабатывает, поведение не меняется.
    toggleSubtask(questId, subId) {
      setState(prev => {
        const quest = prev.quests.find(q => q.id===questId);
        if (!quest) return prev;
        const sub = (quest.subtasks||[]).find(s => s.id===subId);
        if (!sub) return prev;
        const newDone = !sub.done;
        const quests = prev.quests.map(q => q.id!==questId ? q : { ...q, subtasks: q.subtasks.map(s => s.id!==subId ? s : { ...s, done:newDone }) });
        let people = prev.people;
        if (sub.personId) {
          const delta = newDone ? SUBTASK_PERSON_XP : -SUBTASK_PERSON_XP;
          people = (prev.people||[]).map(p => p.id===sub.personId ? { ...p, xp: Math.max(0, p.xp + delta) } : p);
        }
        return { ...prev, quests, people };
      });
    },

    completeQuest(id) {
      // Побочные эффекты — только через defer (см. commit выше): updater обязан оставаться чистым,
      // иначе повторный вызов React-ом продублирует тост, а вместе с ним и возможность отката —
      // по каждому дубликату можно было бы вернуть полную награду, суммарно больше выданной.
      const today = todayStr();
      commit((prev, defer) => {
        const quest = prev.quests.find(q => q.id===id);
        if (!quest || quest.status!=="active") return prev;
        const prevLevel = overallOf(prev).level;
        const prevTotalXp = prev.spheres.reduce((a,s)=>a+s.xp,0);
        const sphereIds = questSphereIds(quest), personIds = questPersonIds(quest);
        const rewardXp = quest.rewardXp||0, rewardGold = quest.rewardGold||0;
        const quests = prev.quests.map(q => q.id===id ? { ...q, status:"done", completedAt:today } : q);
        // Каждой связанной сфере — полная награда, а не доля: делёж превратил бы честное
        // указание всех затронутых сфер в наказание, и указывать их перестали бы.
        const spheres = prev.spheres.map(s => sphereIds.includes(s.id) ? { ...s, xp: s.xp + rewardXp } : s);
        const people = personIds.length ? (prev.people||[]).map(p => personIds.includes(p.id) ? { ...p, xp: p.xp + rewardXp } : p) : prev.people;
        const afterQuest = { ...prev, quests, spheres, people, profile: { ...prev.profile, currency: prev.profile.currency + rewardGold } };
        // Кампания могла закрыться именно этим квестом — считаем в том же чистом updater-е, а не
        // отдельным эффектом: эффект не умеет откатываться вместе с undo-тостом, а здесь это
        // обязательное требование.
        const { state: next, rewards } = applyCampaignSettlement(afterQuest, quests);
        const newTotalXp = next.spheres.reduce((a,s)=>a+s.xp,0);
        const newLevel = levelFromXp(newTotalXp).level;
        defer(() => {
          pushToast(`Квест выполнен: +${rewardXp} XP, +${rewardGold} золота`, toastIcon(Trophy, "text-amber-400"), () => {
            setState(p2 => {
              const reverted = revertCampaignSettlement(p2, rewards);
              return {
                ...reverted,
                quests: reverted.quests.map(q => q.id===id ? { ...q, status:"active", completedAt:null } : q),
                spheres: reverted.spheres.map(s => sphereIds.includes(s.id) ? { ...s, xp: Math.max(0, s.xp-rewardXp) } : s),
                people: personIds.length ? (reverted.people||[]).map(p => personIds.includes(p.id) ? { ...p, xp: Math.max(0, p.xp-rewardXp) } : p) : reverted.people,
                profile: { ...reverted.profile, currency: Math.max(0, reverted.profile.currency-rewardGold) },
              };
            });
          });
          // Празднование кампании перекрывает обычный левелап: уровень показывается внутри него,
          // иначе на одно действие вылезали бы две модалки подряд.
          if (rewards.length) {
            const r = rewards[0];
            const st = campaignStats(quests, { id: r.campaignId });
            setCampaignDone({ ...r, prevLevel, newLevel, prevTotalXp, newTotalXp, questCount: st.total, days: st.days });
          } else if (newLevel > prevLevel) setLevelUp(newLevel);
        });
        return next;
      });
    },

    // Провал завершение кампании блокирует (см. campaignIsComplete) — поэтому провалить квест
    // кампанию не закрывает, а вот УЖЕ закрытую может открыть обратно; пересчёт нужен и здесь.
    failQuest(id) {
      commit((prev) => {
        const quests = prev.quests.map(q => q.id===id ? { ...q, status:"failed" } : q);
        const { campaigns } = settleCampaigns(prev.campaigns, quests);
        return { ...prev, quests, campaigns };
      });
    },

    // «Вернуть в работу» — не откат, а новое решение: награда за квест и финальная награда
    // кампании НЕ отбираются (принцип «без клавбэка»), кампания просто снова становится активной.
    reopenQuest(id) {
      commit((prev) => {
        const quests = prev.quests.map(q => q.id===id ? { ...q, status:"active" } : q);
        const { campaigns } = settleCampaigns(prev.campaigns, quests);
        return { ...prev, quests, campaigns };
      });
    },

    addCampaign(data) {
      const campaign = {
        id: uid(), status:"active", claimedFinal:false, completedAt:null, createdAt: todayStr(),
        source:"manual", importedAt:null, description:"", color:null, personId:null, personName:null,
        stages: [], reward: defaultCampaignReward(), ...data,
      };
      commit((prev, defer) => {
        defer(() => pushToast("Кампания создана", toastIcon(Flag, "text-amber-400")));
        return { ...prev, campaigns: [campaign, ...prev.campaigns] };
      });
      return campaign.id;
    },

    updateCampaign(id, patch) {
      setState(prev => ({ ...prev, campaigns: prev.campaigns.map(c => c.id===id ? { ...c, ...patch } : c) }));
    },

    // Два разных удаления вместо модального вопроса «а квесты тоже?»: пункт в кебабе прямо
    // называет последствие. Undo восстанавливает и кампанию на прежнюю позицию, и квесты — либо
    // целиком (каскад), либо только их привязку к кампании.
    deleteCampaign(id, withQuests) {
      commit((prev, defer) => {
        const idx = prev.campaigns.findIndex(c => c.id===id);
        const removed = prev.campaigns[idx];
        if (!removed) return prev;
        const affected = prev.quests.map((q,i) => ({ q, i })).filter(x => x.q.campaignId===id);
        const quests = withQuests
          ? prev.quests.filter(q => q.campaignId!==id)
          : prev.quests.map(q => q.campaignId===id ? { ...q, campaignId:null, stageId:null } : q);
        const n = affected.length;
        defer(() => pushToast(
          withQuests ? `Кампания и ${n} ${pluralRu(n,"квест","квеста","квестов")} удалены` : "Кампания удалена, квесты остались",
          toastIcon(Trash2, "text-zinc-400"),
          () => setState(p2 => {
            let qs = p2.quests;
            if (withQuests) affected.forEach(x => { qs = insertAt(qs, x.i, x.q); });
            else qs = qs.map(q => {
              const src = affected.find(x => x.q.id===q.id);
              return src ? { ...q, campaignId:id, stageId: src.q.stageId || null } : q;
            });
            return { ...p2, campaigns: insertAt(p2.campaigns, idx, removed), quests: qs };
          })
        ));
        return { ...prev, campaigns: prev.campaigns.filter(c => c.id!==id), quests };
      });
    },

    archiveCampaign(id, archived) {
      commit((prev, defer) => {
        const campaigns = prev.campaigns.map(c => c.id===id ? { ...c, status: archived ? "archived" : "active" } : c);
        // Возврат из архива может тут же закрыть кампанию (пока лежала в архиве, её квесты
        // доделали) — пересчитываем, иначе она висела бы активной с полным прогрессом.
        const { state: next, rewards } = applyCampaignSettlement({ ...prev, campaigns }, prev.quests);
        defer(() => {
          pushToast(archived ? "Кампания в архиве" : "Кампания возвращена из архива", toastIcon(Archive, "text-zinc-400"));
          rewards.forEach(r => pushToast(`Кампания завершена: ${r.title} · +${r.xp} XP, +${r.gold} золота`, toastIcon(Flag, "text-amber-400")));
        });
        return next;
      });
    },

    // «Разрешить награду снова» — для случая, когда в уже завершённую кампанию дописали новые
    // квесты: она вернулась в активные, но claimedFinal остался стоять и повторного начисления
    // не будет. Редкий, но честный выход, чтобы механика не выглядела сломанной.
    resetCampaignClaim(id) {
      commit((prev, defer) => {
        defer(() => pushToast("Награда за завершение разрешена снова", toastIcon(Sparkles, "text-amber-400")));
        return { ...prev, campaigns: prev.campaigns.map(c => c.id===id ? { ...c, claimedFinal:false, reward:{ ...c.reward, grantedXp:null, grantedGold:null } } : c) };
      });
    },

    // Импорт плана: кампания и все её квесты появляются одной операцией — и одной же операцией
    // откатываются. Undo здесь обязателен: разгребать руками ошибочно импортированные сорок
    // квестов — худший сценарий этой функции.
    importCampaign(campaign, quests) {
      commit((prev, defer) => {
        defer(() => pushToast(
          `Кампания добавлена: ${quests.length} ${pluralRu(quests.length,"квест","квеста","квестов")}`,
          toastIcon(Flag, "text-amber-400"),
          () => setState(p2 => ({
            ...p2,
            campaigns: p2.campaigns.filter(c => c.id!==campaign.id),
            quests: p2.quests.filter(q => q.campaignId!==campaign.id),
          }))
        ));
        return { ...prev, campaigns: [campaign, ...prev.campaigns], quests: [...quests, ...prev.quests] };
      });
    },

    // Разворот кампании считается от ПРЕДЫДУЩЕГО состояния, а не от прочитанного при рендере:
    // иначе два переключения подряд в одном тике потеряли бы первое.
    toggleExpandedCampaign(id, expanded) {
      setState(prev => {
        const cur = (prev.uiPrefs && prev.uiPrefs.quests && prev.uiPrefs.quests.expandedCampaigns) || [];
        const want = expanded == null ? !cur.includes(id) : !!expanded;
        const next = want ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter(x => x!==id);
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), quests: { ...defaultQuestsPrefs(), ...(prev.uiPrefs && prev.uiPrefs.quests), expandedCampaigns: next } } };
      });
    },

    updateQuestsPrefs(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), quests: { ...defaultQuestsPrefs(), ...(prev.uiPrefs && prev.uiPrefs.quests), ...patch } } }));
    },
  };
}
