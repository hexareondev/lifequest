// Демо-история для отчётов: активность за два прошлых месяца, чтобы в демо-режиме сразу были
// видны оба отчёта, разница между ними и медали. Позапрошлый месяц — спокойный и первый (звёзд в
// нём нет), прошлый — заметно сильнее, но сфера «Отношения» в нём проседает.
//
// Даты строятся от сегодняшнего дня: демо всегда показывает два последних завершённых месяца.

import { pad2, uid } from "../core/basics.js";
import { monthDays, monthOf, shiftMonth } from "./model.js";
import { BUDGET_SINCE_START } from "../finance/budget.js";

const at = (ym, day) => `${ym}-${pad2(Math.min(day, monthDays(ym)))}`;
const range = (ym, from, to, step = 1) => {
  const out = [];
  for (let d = from; d <= Math.min(to, monthDays(ym)); d += step) out.push(at(ym, d));
  return out;
};

function quest(title, sphereId, difficulty, xp, gold, date, extra = {}) {
  return { id: uid(), title, description: "", sphereId, priority: "medium", difficulty, rewardXp: xp, rewardGold: gold,
    status: "done", deadline: date, subtasks: [], createdAt: date, completedAt: date, ...extra };
}

function workout(date, weight, minutes) {
  const set = (w) => ({ id: uid(), reps: 8, weight: w, done: true });
  return { id: uid(), date, workoutId: "w_full", planId: null, sessionId: null, title: "Базовая тренировка",
    status: "done", minutes, rpe: 7, notes: "",
    entries: [
      { id: uid(), exerciseId: "ex_squat", name: "Приседания со штангой", sets: [set(weight), set(weight), set(weight + 2.5)] },
      { id: uid(), exerciseId: "ex_bench", name: "Жим лёжа", sets: [set(weight - 10), set(weight - 10), set(weight - 10)] },
    ] };
}

const food = (date, calories) => ({ id: uid(), date, kind: "food", sourceType: "food", sourceId: "f1", grams: 300, meal: 1,
  calories, protein: calories * 0.08, fat: calories * 0.03, carbs: calories * 0.1 });

export function demoReportHistory(today) {
  const m1 = shiftMonth(monthOf(today), -1);   // прошлый месяц — сильный
  const m2 = shiftMonth(monthOf(today), -2);   // позапрошлый — спокойный, первый

  const quests = [
    quest("Пробежать первые 3 км", "health", "medium", 35, 15, at(m2, 4)),
    quest("Записаться к стоматологу", "health", "easy", 15, 5, at(m2, 9)),
    quest("Обновить резюме", "career", "hard", 70, 30, at(m2, 12)),
    quest("Позвать друзей на настолки", "social", "medium", 35, 15, at(m2, 16), { personId: "p1", personName: "Настя" }),
    quest("Съездить к родителям", "social", "easy", 15, 5, at(m2, 23), { personId: "p2", personName: "Мама" }),
    quest("Пройти вводный урок курса", "knowledge", "easy", 15, 5, at(m2, 27)),

    quest("Пробежать 5 км без остановок", "health", "hard", 70, 30, at(m1, 3)),
    quest("Сдать анализы", "health", "easy", 15, 5, at(m1, 6)),
    quest("Составить план тренировок", "health", "medium", 35, 15, at(m1, 8)),
    quest("Выступить на планёрке с идеей", "career", "hard", 70, 30, at(m1, 10)),
    quest("Закрыть квартальный отчёт", "career", "medium", 35, 15, at(m1, 14)),
    quest("Сдать тест A2", "knowledge", "hard", 70, 30, at(m1, 17), { campaignId: "dc_eng" }),
    quest("Пройти модуль по грамматике", "knowledge", "medium", 35, 15, at(m1, 11), { campaignId: "dc_eng" }),
    quest("Разобрать антресоль", "home", "medium", 35, 15, at(m1, 20)),
    quest("Нарисовать открытку", "creativity", "easy", 15, 5, at(m1, 22)),
    quest("Неделя без соцсетей", "mind", "hard", 70, 30, at(m1, 26)),
    quest("Завести подушку безопасности", "finance", "medium", 35, 15, at(m1, 28)),
  ];

  const campaign = {
    id: "dc_eng", title: "Английский: A2", description: "Подтянуть язык до A2 за месяц.", sphereId: "knowledge", color: "violet",
    status: "done", createdAt: at(m2, 25), completedAt: at(m1, 17), claimedFinal: true,
    reward: { mode: "auto", percent: 30, xp: null, gold: null, grantedXp: 32, grantedGold: 14 },
    stages: [], source: "manual", importedAt: null,
  };

  const habitLogs = {
    h2: [...range(m2, 2, 30, 3), ...range(m1, 1, 30, 2)],          // 30 минут спорта: реже → через день
    h4: [...range(m2, 3, 21), ...range(m1, 1, 31)],                 // Планировать день: в прошлом месяце — каждый день
    h5: [at(m2, 5), at(m2, 12), at(m2, 19), at(m2, 26), at(m1, 15)], // Позвонить родителям: просело
  };

  const workoutLog = [
    ...[3, 8, 14, 21, 27].map(d => workout(at(m2, d), 45, 45)),
    ...[2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25, 28].map((d, i) => workout(at(m1, d), 50 + (i > 6 ? 2.5 : 0), 55)),
  ];

  const readingLog = [
    ...[5, 9, 13, 18, 22, 28].map(d => ({ id: uid(), bookId: "b_mm", date: at(m2, d), pages: 20 })),
    ...range(m1, 1, 28, 2).map(d => ({ id: uid(), bookId: "b_mm", date: d, pages: 20 })),
  ];

  const book = { id: "b_mm", title: "Мастер и Маргарита", coverEmoji: "📕", coverImage: null, status: "done", pagesRead: 480, pagesTotal: 480,
    rating: 5, sphereId: "knowledge", rewardXp: 50, notes: [], createdAt: at(m2, 1), completedAt: at(m1, 28) };

  const nutritionLog = [
    ...[6, 7, 13, 14, 20, 21].map(d => food(at(m2, d), 2300)),
    ...range(m1, 1, 28, 2).map(d => food(d, 2050)),
  ];

  // Бюджет с историей: с прошлого месяца на еду заложено больше и появилась «Одежда» — в отчёте за
  // прошлый месяц это видно пометками «было» и «новая».
  const budgetHistory = [
    { from: BUDGET_SINCE_START, limits: { "Еда": 26000, "Транспорт": 6000, "Развлечения": 9000, "Подписки": 3000, "Жильё": 33000 } },
    { from: m1, limits: { "Еда": 28000, "Транспорт": 6000, "Развлечения": 9000, "Подписки": 3000, "Жильё": 33000, "Одежда": 15000 } },
  ];

  return { quests, campaign, habitLogs, workoutLog, readingLog, book, nutritionLog, budgetHistory };
}

// Дописывает историю в демо-состояние. Отдельной функцией, а не прямо в defaultState: так демо
// отчётов собрано в одном месте, а основное демо остаётся про «сегодня».
export function withDemoReportHistory(state, today) {
  const h = demoReportHistory(today);
  return {
    ...state,
    quests: [...state.quests, ...h.quests],
    campaigns: [...state.campaigns, h.campaign],
    habits: state.habits.map(x => h.habitLogs[x.id] ? { ...x, logs: [...new Set([...(x.logs || []), ...h.habitLogs[x.id]])].sort() } : x),
    workoutLog: [...state.workoutLog, ...h.workoutLog],
    readingLog: [...state.readingLog, ...h.readingLog],
    books: [...state.books, h.book],
    nutritionLog: [...state.nutritionLog, ...h.nutritionLog],
    budgetHistory: h.budgetHistory,
  };
}
