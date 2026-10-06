// Действия раздела «Спорт»: тело и замеры, цель, планы, упражнения, шаблоны тренировок и журнал.
// Устроены как действия финансов — см. finance/actions.js.

import { replayIds, todayStr, uid } from "../core/basics.js";
import { pluralRu } from "../core/format.js";
import { insertAt } from "../core/lists.js";
import {
  applyPlanSettlement, defaultBody, defaultSet, defaultSportGoal, latestBodyMeasure,
  revertPlanSettlement, workoutSetStats,
} from "./model.js";
import { Archive, Dumbbell, ListPlus, Rocket, Target, Trash2, TrendingUp } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function sportActions({ setState, commit, pushToast }) {
  return {
    updateBody(patch) {
      setState(prev => ({ ...prev, profile: { ...prev.profile, body: { ...defaultBody(), ...(prev.profile.body||{}), ...patch } } }));
    },

    // Замер веса и обхватов. profile.body.weight — производное от журнала: обновляем его только
    // если добавленный замер оказался САМЫМ СВЕЖИМ, иначе запись задним числом перетирала бы
    // текущий вес более старым значением.
    addBodyMeasure(data) {
      const measure = { id: uid(), waist:null, chest:null, hips:null, bodyFat:null, notes:"", ...data };
      commit((prev, defer) => {
        const bodyLog = [...prev.bodyLog, measure].sort((a,b) => a.date.localeCompare(b.date));
        const latest = latestBodyMeasure(bodyLog);
        defer(() => pushToast("Замер записан", toastIcon(TrendingUp, "text-emerald-400"), () => {
          setState(p2 => {
            const rest = p2.bodyLog.filter(m => m.id!==measure.id);
            const back = latestBodyMeasure(rest);
            return { ...p2, bodyLog: rest, profile: { ...p2.profile, body: { ...p2.profile.body, weight: back ? Number(back.weight) : null } } };
          });
        }));
        return { ...prev, bodyLog, profile: { ...prev.profile, body: { ...prev.profile.body, weight: latest ? Number(latest.weight) : null } } };
      });
    },

    deleteBodyMeasure(id) {
      commit((prev, defer) => {
        const idx = prev.bodyLog.findIndex(m => m.id===id);
        const removed = prev.bodyLog[idx];
        if (!removed) return prev;
        const bodyLog = prev.bodyLog.filter(m => m.id!==id);
        const latest = latestBodyMeasure(bodyLog);
        defer(() => pushToast("Замер удалён", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => {
            const back = insertAt(p2.bodyLog, idx, removed);
            const l = latestBodyMeasure(back);
            return { ...p2, bodyLog: back, profile: { ...p2.profile, body: { ...p2.profile.body, weight: l ? Number(l.weight) : null } } };
          });
        }));
        return { ...prev, bodyLog, profile: { ...prev.profile, body: { ...prev.profile.body, weight: latest ? Number(latest.weight) : null } } };
      });
    },

    setSportGoal(patch) {
      commit((prev, defer) => {
        const sportGoal = { ...defaultSportGoal(), ...prev.sportGoal, ...patch };
        defer(() => pushToast("Цель обновлена", toastIcon(Target, "text-emerald-400")));
        return { ...prev, sportGoal };
      });
    },

    // План создаётся вместе со своими сессиями одной операцией — и одной же откатывается.
    addTrainingPlan(data, sessionsBuilder) {
      const plan = {
        id: uid(), title: data.title, description: data.description || "",
        status: "active", startDate: data.startDate, weeks: data.weeks,
        claimedFinal: false, completedAt: null, reward: { grantedXp:null, grantedGold:null },
        source: "manual", importedAt: null, createdAt: todayStr(),
      };
      const ids = replayIds();
      commit((prev, defer) => {
        const sessions = sessionsBuilder(plan, prev, ids());
        defer(() => pushToast(
          `План создан: ${sessions.length} ${pluralRu(sessions.length,"тренировка","тренировки","тренировок")}`,
          toastIcon(Rocket, "text-emerald-400"),
          () => setState(p2 => ({
            ...p2,
            trainingPlans: p2.trainingPlans.filter(x => x.id!==plan.id),
            workoutLog: p2.workoutLog.filter(w => w.planId!==plan.id),
          }))
        ));
        return { ...prev, trainingPlans: [plan, ...prev.trainingPlans], workoutLog: [...sessions, ...prev.workoutLog] };
      });
      return plan.id;
    },

    // Импорт плана: план, его тренировки и недостающие упражнения появляются одной операцией — и
    // одной же откатываются. Undo обязателен: разгребать руками восемнадцать ошибочно
    // загруженных тренировок — худший сценарий этой функции.
    importTrainingPlan(plan, sessions, newExercises) {
      commit((prev, defer) => {
        const newIds = new Set((newExercises||[]).map(e => e.id));
        defer(() => pushToast(
          `План загружен: ${sessions.length} ${pluralRu(sessions.length,"тренировка","тренировки","тренировок")}` +
          ((newExercises||[]).length ? `, новых упражнений ${newExercises.length}` : ""),
          toastIcon(Rocket, "text-emerald-400"),
          () => setState(p2 => ({
            ...p2,
            trainingPlans: p2.trainingPlans.filter(x => x.id!==plan.id),
            workoutLog: p2.workoutLog.filter(w => w.planId!==plan.id),
            exercises: p2.exercises.filter(e => !newIds.has(e.id)),
          }))
        ));
        return {
          ...prev,
          trainingPlans: [plan, ...prev.trainingPlans],
          workoutLog: [...sessions, ...prev.workoutLog],
          exercises: [...(newExercises||[]), ...prev.exercises],
        };
      });
    },

    updateTrainingPlan(id, patch) {
      setState(prev => ({ ...prev, trainingPlans: prev.trainingPlans.map(pl => pl.id===id ? { ...pl, ...patch } : pl) }));
    },

    archiveTrainingPlan(id, archived) {
      commit((prev, defer) => {
        const plans = prev.trainingPlans.map(pl => pl.id===id ? { ...pl, status: archived ? "archived" : "active" } : pl);
        const { state: next, rewards } = applyPlanSettlement({ ...prev, trainingPlans: plans }, prev.workoutLog);
        defer(() => {
          pushToast(archived ? "План в архиве" : "План возвращён из архива", toastIcon(Archive, "text-zinc-400"));
          rewards.forEach(r => pushToast(`План пройден: ${r.title} · +${r.xp} XP`, toastIcon(Rocket, "text-emerald-400")));
        });
        return next;
      });
    },

    // Два удаления, как у кампаний: только план (сессии остаются в журнале как свободные) либо
    // вместе с сессиями. Пункт кебаба прямо называет последствие, вместо модального вопроса.
    deleteTrainingPlan(id, withSessions) {
      commit((prev, defer) => {
        const idx = prev.trainingPlans.findIndex(pl => pl.id===id);
        const removed = prev.trainingPlans[idx];
        if (!removed) return prev;
        const affected = prev.workoutLog.map((w,i) => ({ w, i })).filter(x => x.w.planId===id);
        const workoutLog = withSessions
          ? prev.workoutLog.filter(w => w.planId!==id)
          : prev.workoutLog.map(w => w.planId===id ? { ...w, planId:null, sessionId:null } : w);
        const n = affected.length;
        defer(() => pushToast(
          withSessions ? `План и ${n} ${pluralRu(n,"тренировка","тренировки","тренировок")} удалены` : "План удалён, тренировки остались",
          toastIcon(Trash2, "text-zinc-400"),
          () => setState(p2 => {
            let log = p2.workoutLog;
            if (withSessions) affected.forEach(x => { log = insertAt(log, x.i, x.w); });
            else log = log.map(w => {
              const src = affected.find(x => x.w.id===w.id);
              return src ? { ...w, planId:id, sessionId: src.w.sessionId } : w;
            });
            return { ...p2, trainingPlans: insertAt(p2.trainingPlans, idx, removed), workoutLog: log };
          })
        ));
        return { ...prev, trainingPlans: prev.trainingPlans.filter(pl => pl.id!==id), workoutLog };
      });
    },

    addExercise(data) {
      const ex = { id: uid(), kind:"strength", muscles:[], defaultLoad:{ sets:3, reps:10 }, notes:"", archived:false, createdAt: todayStr(), ...data };
      commit((prev, defer) => {
        defer(() => pushToast("Упражнение добавлено", toastIcon(Dumbbell, "text-emerald-400")));
        return { ...prev, exercises: [ex, ...prev.exercises] };
      });
      return ex.id;
    },

    updateExercise(id, patch) {
      setState(prev => ({ ...prev, exercises: prev.exercises.map(e => e.id===id ? { ...e, ...patch } : e) }));
    },

    // Упражнение удаляется только из справочника: записи журнала хранят снимок названия и состава,
    // поэтому прошлые тренировки после удаления читаются как раньше.
    deleteExercise(id) {
      commit((prev, defer) => {
        const idx = prev.exercises.findIndex(e => e.id===id);
        const removed = prev.exercises[idx];
        if (!removed) return prev;
        defer(() => pushToast("Упражнение удалено", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, exercises: insertAt(p2.exercises, idx, removed) }));
        }));
        return { ...prev, exercises: prev.exercises.filter(e => e.id!==id) };
      });
    },

    addWorkout(data) {
      const w = { id: uid(), description:"", items:[], archived:false, createdAt: todayStr(), ...data };
      commit((prev, defer) => {
        defer(() => pushToast("Тренировка сохранена", toastIcon(ListPlus, "text-emerald-400")));
        return { ...prev, workouts: [w, ...prev.workouts] };
      });
      return w.id;
    },

    updateWorkout(id, patch) {
      setState(prev => ({ ...prev, workouts: prev.workouts.map(w => w.id===id ? { ...w, ...patch } : w) }));
    },

    deleteWorkout(id) {
      commit((prev, defer) => {
        const idx = prev.workouts.findIndex(w => w.id===id);
        const removed = prev.workouts[idx];
        if (!removed) return prev;
        defer(() => pushToast("Тренировка удалена", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, workouts: insertAt(p2.workouts, idx, removed) }));
        }));
        return { ...prev, workouts: prev.workouts.filter(w => w.id!==id) };
      });
    },

    // Запись в журнал: либо по шаблону, либо свободная. Состав копируется СНИМКОМ, дальше живёт
    // сам — правка шаблона задним числом прошлые тренировки не меняет.
    addWorkoutSession({ date, workoutId, title }) {
      // Сколько id понадобится, зависит от шаблона в состоянии — поэтому генератор, а не uid() заранее.
      const ids = replayIds();
      let session = null;
      commit((prev, defer) => {
        const newId = ids();
        const template = workoutId ? prev.workouts.find(w => w.id===workoutId) : null;
        const entries = template ? (template.items||[]).map(it => {
          const ex = prev.exercises.find(e => e.id===it.exerciseId);
          const kind = ex ? ex.kind : "strength";
          return {
            id: newId(), exerciseId: it.exerciseId, name: ex ? ex.name : "Упражнение",
            sets: Array.from({ length: Math.max(1, Number(it.sets)||1) }, () => ({
              ...defaultSet(kind, newId()),
              reps: it.reps != null ? it.reps : defaultSet(kind).reps,
              weight: it.weight != null ? it.weight : null,
              minutes: it.minutes != null ? it.minutes : (kind==="strength" ? null : defaultSet(kind).minutes),
              km: it.km != null ? it.km : null,
            })),
          };
        }) : [];
        session = {
          id: newId(), date, workoutId: workoutId || null, planId:null, sessionId:null,
          title: title || (template ? template.title : "Свободная тренировка"),
          status: "planned", minutes: null, rpe: null, notes: "", entries,
        };
        defer(() => pushToast("Тренировка добавлена в журнал", toastIcon(Dumbbell, "text-emerald-400"), () => {
          setState(p2 => ({ ...p2, workoutLog: p2.workoutLog.filter(w => w.id!==session.id) }));
        }));
        return { ...prev, workoutLog: [session, ...prev.workoutLog] };
      });
      return session && session.id;
    },

    // Смена статуса сессии может закрыть план — пересчитываем в том же commit, а не эффектом.
    updateWorkoutSession(id, patch) {
      commit((prev, defer) => {
        const workoutLog = prev.workoutLog.map(w => w.id===id ? { ...w, ...patch } : w);
        const { state: next, rewards } = applyPlanSettlement(prev, workoutLog);
        if (rewards.length) defer(() => rewards.forEach(r => pushToast(
          `План пройден: ${r.title} · серия ${r.streak}${r.perfect ? " без пропусков" : ""} · +${r.xp} XP, +${r.gold} золота`,
          toastIcon(Rocket, "text-emerald-400"))));
        return next;
      });
    },

    deleteWorkoutSession(id) {
      commit((prev, defer) => {
        const idx = prev.workoutLog.findIndex(w => w.id===id);
        const removed = prev.workoutLog[idx];
        if (!removed) return prev;
        // Удаление последней невыполненной сессии закрывает план — значит undo обязан уметь
        // отобрать выданную за него награду, ровно как у кампаний.
        const { state: next, rewards } = applyPlanSettlement(prev, prev.workoutLog.filter(w => w.id!==id));
        defer(() => {
          pushToast("Запись удалена", toastIcon(Trash2, "text-zinc-400"), () => {
            setState(p2 => {
              const reverted = revertPlanSettlement(p2, rewards);
              return { ...reverted, workoutLog: insertAt(reverted.workoutLog, idx, removed) };
            });
          });
          rewards.forEach(r => pushToast(`План пройден: ${r.title} · +${r.xp} XP`, toastIcon(Rocket, "text-emerald-400")));
        });
        return next;
      });
    },

    // Отметка подхода. Когда отмечен последний — сессия сама переходит в "done": просить человека
    // дополнительно нажать «завершить» после последнего подхода незачем.
    toggleWorkoutSet(sessionId, entryId, setId) {
      commit((prev, defer) => {
        const workoutLog = prev.workoutLog.map(w => {
          if (w.id !== sessionId) return w;
          const entries = w.entries.map(e => e.id!==entryId ? e : {
            ...e, sets: e.sets.map(st => st.id===setId ? { ...st, done: !st.done } : st),
          });
          const stats = workoutSetStats({ entries });
          const status = stats.total && stats.done===stats.total ? "done" : (w.status==="skipped" ? "skipped" : (stats.done ? "planned" : w.status));
          return { ...w, entries, status };
        });
        // Последний отмеченный подход может закрыть и сессию, и весь план. Отката здесь нет
        // сознательно: снять галочку — это не отмена действия, а новое решение, и награда за
        // пройденный план не отбирается (принцип «без клавбэка», как у claimedTiers).
        const { state: next, rewards } = applyPlanSettlement(prev, workoutLog);
        if (rewards.length) defer(() => rewards.forEach(r => pushToast(
          `План пройден: ${r.title} · серия ${r.streak}${r.perfect ? " без пропусков" : ""} · +${r.xp} XP, +${r.gold} золота`,
          toastIcon(Rocket, "text-emerald-400"))));
        return next;
      });
    },

    updateWorkoutSet(sessionId, entryId, setId, patch) {
      setState(prev => ({
        ...prev,
        workoutLog: prev.workoutLog.map(w => w.id!==sessionId ? w : {
          ...w, entries: w.entries.map(e => e.id!==entryId ? e : {
            ...e, sets: e.sets.map(st => st.id===setId ? { ...st, ...patch } : st),
          }),
        }),
      }));
    },

    addWorkoutSet(sessionId, entryId) {
      const id = uid();
      setState(prev => ({
        ...prev,
        workoutLog: prev.workoutLog.map(w => w.id!==sessionId ? w : {
          ...w, entries: w.entries.map(e => {
            if (e.id!==entryId) return e;
            const ex = prev.exercises.find(x => x.id===e.exerciseId);
            const last = e.sets[e.sets.length-1];
            return { ...e, sets: [...e.sets, { ...defaultSet(ex ? ex.kind : "strength"), ...(last ? { reps:last.reps, weight:last.weight, minutes:last.minutes, km:last.km } : {}), id, done:false }] };
          }),
        }),
      }));
    },

    removeWorkoutSet(sessionId, entryId, setId) {
      setState(prev => ({
        ...prev,
        workoutLog: prev.workoutLog.map(w => w.id!==sessionId ? w : {
          ...w, entries: w.entries.map(e => e.id!==entryId ? e : { ...e, sets: e.sets.filter(st => st.id!==setId) }),
        }),
      }));
    },

    addWorkoutEntry(sessionId, exerciseId) {
      const ids = replayIds();
      setState(prev => {
        const newId = ids();
        const ex = prev.exercises.find(e => e.id===exerciseId);
        if (!ex) return prev;
        const load = ex.defaultLoad || {};
        const entry = {
          id: newId(), exerciseId, name: ex.name,
          sets: Array.from({ length: Math.max(1, Number(load.sets)||1) }, () => ({
            ...defaultSet(ex.kind, newId()),
            reps: load.reps != null ? load.reps : defaultSet(ex.kind).reps,
            weight: load.weight != null ? load.weight : null,
            minutes: load.minutes != null ? load.minutes : (ex.kind==="strength" ? null : defaultSet(ex.kind).minutes),
            km: load.km != null ? load.km : null,
          })),
        };
        return { ...prev, workoutLog: prev.workoutLog.map(w => w.id!==sessionId ? w : { ...w, entries: [...w.entries, entry] }) };
      });
    },

    removeWorkoutEntry(sessionId, entryId) {
      setState(prev => ({ ...prev, workoutLog: prev.workoutLog.map(w => w.id!==sessionId ? w : { ...w, entries: w.entries.filter(e => e.id!==entryId) }) }));
    },

    updateSportPrefs(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), sport: { view:"journal", paramsCollapsed:false, ...(prev.uiPrefs && prev.uiPrefs.sport), ...patch } } }));
    },
  };
}
