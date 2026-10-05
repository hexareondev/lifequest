/* Базовые примитивы: даты строкой, идентификаторы, зажим числа.
   Ни от чего не зависят — поэтому и вынесены первыми: на них опирается всё остальное. */
/* ================================ HELPERS ================================ */

function uid() { return Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
function pad2(n) { return String(n).padStart(2,"0"); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayStr() { return toDateStr(new Date()); }
function addDaysStr(n) { const d = new Date(); d.setDate(d.getDate()+n); return toDateStr(d); }
// В отличие от addDaysStr (всегда от сегодня) — сдвигает произвольную дату-строку, для
// постраничной навигации по дням в Питании (тот же принцип, что MonthNav у Финансов, только
// по дням, а не по месяцам).
function shiftDateStr(dateStr, n) { const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate()+n); return toDateStr(d); }
function addDaysToDateStr(dateStr, n) {
  const d = new Date(dateStr+"T00:00:00");
  d.setDate(d.getDate()+n);
  return toDateStr(d);
}
function daysBetween(aStr, bStr) {
  return Math.round((new Date(bStr+"T00:00:00") - new Date(aStr+"T00:00:00")) / 86400000);
}
function clamp(v,min,max) { return Math.max(min, Math.min(max,v)); }

export { addDaysStr, addDaysToDateStr, clamp, daysBetween, pad2, shiftDateStr, toDateStr, todayStr, uid };
