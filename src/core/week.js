// Неделя начинается с понедельника — это касается и календарной сетки, и недельной статистики
// тренировок, поэтому границы недели считаются в одном месте.

import { toDateStr } from "./basics.js";

export const WEEKDAY_LABELS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

export function startOfWeekMonday(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const shift = (d.getDay() + 6) % 7; // 0 = понедельник
  d.setDate(d.getDate() - shift);
  return toDateStr(d);
}
export function endOfWeekSunday(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() + (6 - shift));
  return toDateStr(d);
}
