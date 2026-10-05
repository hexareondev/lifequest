// Мультидневные квесты: квест может занимать диапазон дней, а не один день.

import { addDaysToDateStr, daysBetween } from "../core/basics.js";
import { pluralRu, fmtDateShort } from "../core/format.js";

// deadline у квеста сохраняет прежний смысл — ПОСЛЕДНИЙ день. Новое поле startDate — первый день;
// null/отсутствует = однодневный квест, всё поведение в точности как раньше. Добавлен именно
// startDate, а не endDate, потому что на deadline завязаны просрочка, сортировка, Канбан,
// календарь и drag-and-drop: переименование задело бы весь этот код без всякого выигрыша.
// Инварианты (см. normalizeQuestDates): startDate только вместе с deadline и только строго
// раньше него — startDate === deadline хранится как null, чтобы у однодневного квеста не было
// двух разных представлений.
export const QUEST_MAX_SPAN_DAYS = 60;

// Первый день квеста; у однодневного совпадает с дедлайном. null — если срока нет вообще.
export function questStartOf(q) {
  if (!q || !q.deadline) return null;
  return q.startDate && q.startDate < q.deadline ? q.startDate : q.deadline;
}
// Длительность в днях: 0 — у квеста без срока, 1 — у однодневного.
export function questSpanTotal(q) {
  if (!q || !q.deadline) return 0;
  return daysBetween(questStartOf(q), q.deadline) + 1;
}
export function isMultiDayQuest(q) { return questSpanTotal(q) > 1; }
// Какой это по счёту день квеста (1-based). null, если дата вне диапазона.
export function questDayIndex(q, dateStr) {
  const start = questStartOf(q);
  if (!start || !q.deadline || dateStr < start || dateStr > q.deadline) return null;
  return daysBetween(start, dateStr) + 1;
}
// Сдвиг всего диапазона на новую дату НАЧАЛА с сохранением длительности — общее правило и для
// drag-and-drop по дням календаря, и для дропа в колонку Канбана. У однодневного квеста сводится
// к прежнему поведению (просто новый deadline).
export function shiftQuestRangeTo(q, newStartDate) {
  const total = questSpanTotal(q);
  if (total <= 1) return { startDate: null, deadline: newStartDate };
  return { startDate: newStartDate, deadline: addDaysToDateStr(newStartDate, total - 1) };
}
export function normalizeQuestDates(startDate, deadline) {
  if (!deadline) return { startDate: null, deadline: null };
  if (!startDate || startDate >= deadline) return { startDate: null, deadline };
  return { startDate, deadline };
}
// Подпись диапазона для карточек и строк: «7 сен» либо «7 сен → 11 сен · 5 дней».
export function questDateLabel(q) {
  if (!q || !q.deadline) return "";
  const total = questSpanTotal(q);
  if (total <= 1) return fmtDateShort(q.deadline);
  return `${fmtDateShort(questStartOf(q))} → ${fmtDateShort(q.deadline)} · ${total} ${pluralRu(total, "день", "дня", "дней")}`;
}
