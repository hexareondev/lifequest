// Общее для обоих импортов от ИИ: конверт файла, снятие обёртки ```json и даты плана. Внутри
// драфта дата — не абсолютная, а смещение в единицах плана, поэтому одна ручка «дата старта»
// пересчитывает весь план целиком, сохраняя интервалы.

import { addDaysToDateStr, daysBetween } from "../core/basics.js";

// Даты внутри драфта не абсолютные, а «смещения в единицах плана» (unitOffset): 0 — первый день.
// Единица — календарный день, а при skipWeekends — рабочий. Благодаря этому одна ручка «дата
// старта» и галочка выходных пересчитывают ВЕСЬ план целиком, сохраняя относительные интервалы.

export const CAMPAIGN_FILE_VERSION = 1;
export const CAMPAIGN_IMPORT_MAX_CHARS = 2 * 1024 * 1024;

function isWeekendStr(dateStr) { const d = new Date(dateStr+"T00:00:00").getDay(); return d===0 || d===6; }
function nextWorkdayStr(dateStr) { let d = dateStr; let guard = 0; while (isWeekendStr(d) && guard++ < 7) d = addDaysToDateStr(d,1); return d; }
// unitOffset -> абсолютная дата. Без skipWeekends это обычный календарный сдвиг; с ним — шаг
// только по будням (первый день тоже переносится с выходного на понедельник).
export function resolvePlanDate(startDate, unitOffset, skipWeekends) {
  if (unitOffset == null) return null;
  if (!skipWeekends) return addDaysToDateStr(startDate, unitOffset);
  let d = nextWorkdayStr(startDate);
  for (let i = 0; i < unitOffset; i++) d = nextWorkdayStr(addDaysToDateStr(d, 1));
  return d;
}
// Обратная операция к resolvePlanDate: по абсолютной дате получить смещение в единицах плана.
// Нужна, когда дату квеста правят руками прямо на экране предпросмотра — план должен продолжать
// двигаться целиком, поэтому хранится всё равно смещение, а не абсолютная дата.
export function planUnitOffsetOf(startDate, dateStr, skipWeekends) {
  if (!dateStr) return null;
  if (!skipWeekends) return daysBetween(startDate, dateStr);
  if (dateStr <= startDate) return 0;
  let k = 0, d = nextWorkdayStr(startDate);
  while (d < dateStr && k < 4000) { d = nextWorkdayStr(addDaysToDateStr(d, 1)); k++; }
  return k;
}
export function isDateStr(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v+"T00:00:00").getTime()); }
// Снять обёртку ```json ... ``` — люди копируют ответ прямо из чата, и требовать «убери
// форматирование» вручную было бы издевательством.
export function stripCodeFences(text) {
  const t = String(text || "").trim();
  const m = t.match(/^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/);
  return (m ? m[1] : t).trim();
}
