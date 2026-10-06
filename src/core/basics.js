/* Базовые примитивы: даты строкой, идентификаторы, зажим числа.
   Ни от чего не зависят — поэтому и вынесены первыми: на них опирается всё остальное. */
/* ================================ HELPERS ================================ */

function uid() { return Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }

// id для записей, которые создаются ВНУТРИ функции обновления и чьё число зависит от состояния
// (по подходу на каждое упражнение шаблона) — заранее их не посчитать. React вправе прогнать
// обновление дважды, и uid() дал бы в каждом прогоне свои id. replayIds() создают до обновления;
// в начале каждого прогона зовут её результат и получают генератор, выдающий ту же
// последовательность id, что и в прошлом прогоне:
//   const ids = replayIds();
//   setState(prev => { const newId = ids(); ... newId() ... });
function replayIds() {
  const made = [];
  return () => {
    let i = 0;
    return () => { if (i === made.length) made.push(uid()); return made[i++]; };
  };
}
function pad2(n) { return String(n).padStart(2,"0"); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayStr() { return toDateStr(new Date()); }
function addDaysStr(n) { const d = new Date(); d.setDate(d.getDate()+n); return toDateStr(d); }
// В отличие от addDaysStr (всегда от сегодня) — сдвигает произвольную дату-строку. Раньше у этой
// функции был двойник addDaysToDateStr, слово в слово тот же; оставлена одна.
function addDaysToDateStr(dateStr, n) {
  const d = new Date(dateStr+"T00:00:00");
  d.setDate(d.getDate()+n);
  return toDateStr(d);
}
function daysBetween(aStr, bStr) {
  return Math.round((new Date(bStr+"T00:00:00") - new Date(aStr+"T00:00:00")) / 86400000);
}
function clamp(v,min,max) { return Math.max(min, Math.min(max,v)); }

export { addDaysStr, addDaysToDateStr, clamp, daysBetween, pad2, toDateStr, todayStr, replayIds, uid };
