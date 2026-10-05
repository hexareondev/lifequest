// Достижения: насколько выполнено условие и открыто ли оно. Считается из состояния на лету.

import { levelFromXp, overallOf } from "../core/xp.js";
import { totalSavingsOf } from "../finance/model.js";
import { computeStreak, isLogHabit } from "../habits/model.js";

export function achievementProgress(ach, state) {
  const target = ach.target || 1;
  let current = 0;
  let unlocked = false;
  if (ach.kind === "level") {
    current = overallOf(state).level; unlocked = current >= target;
  } else if (ach.kind === "sphereLevel") {
    const sphere = state.spheres.find(s => s.id===ach.sphereId);
    current = sphere ? levelFromXp(sphere.xp).level : 0; unlocked = current >= target;
  } else if (ach.kind === "quests") {
    current = state.quests.filter(q => q.status==="done").length; unlocked = current >= target;
  } else if (ach.kind === "campaigns") {
    current = (state.campaigns||[]).filter(c => c.status==="done").length; unlocked = current >= target;
  } else if (ach.kind === "streak") {
    current = state.habits.filter(h => !isLogHabit(h)).reduce((m,h) => Math.max(m, computeStreak(h.logs||[])), 0); unlocked = current >= target;
  } else if (ach.kind === "currency") {
    current = state.profile.currency; unlocked = current >= target;
  } else if (ach.kind === "savings") {
    current = totalSavingsOf(state); unlocked = current >= target;
  } else if (ach.kind === "allSpheres") {
    current = state.spheres.length ? Math.min(...state.spheres.map(s => levelFromXp(s.xp).level)) : 0;
    unlocked = state.spheres.length>0 && current >= target;
  }
  return { current, target, unlocked };
}

export const ACH_KINDS = {
  level:       { label:"Уровень персонажа",        unit:"уровня" },
  sphereLevel: { label:"Уровень сферы",             unit:"уровня" },
  quests:      { label:"Квестов выполнено",         unit:"квестов" },
  campaigns:   { label:"Кампаний завершено",        unit:"кампаний" },
  streak:      { label:"Серия дней подряд",         unit:"дней" },
  currency:    { label:"Накоплено золота",          unit:"золота" },
  savings:     { label:"Отложено в сбережения",     unit:"₽" },
  allSpheres:  { label:"Все сферы достигли уровня", unit:"уровня (минимум по всем)" },
};
