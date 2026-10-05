// Редактируемые списки с особой позицией «Другое»: категории финансов, типы отношений. «Другое»
// всегда физически последнее и не переставляется — на этом держится и вид, и перенос записей.

import { PALETTE_KEYS } from "../ui/theme.js";

export function categoryMeta(categories, type, name) {
  const list = (categories && (type==="income" ? categories.income : categories.expense)) || [];
  return list.find(c => c.name===name) || list.find(c => c.name==="Другое") || { name:"Другое", color:"zinc" };
}
export function normalizeCategoryList(list) {
  let out;
  if (!Array.isArray(list) || list.length===0) out = [];
  else out = list.map((c,i) => (typeof c === "string") ? { name:c, color:PALETTE_KEYS[i % PALETTE_KEYS.length] } : { name:c.name, color:c.color || PALETTE_KEYS[i % PALETTE_KEYS.length] });
  if (!out.some(c => c.name==="Другое")) out.push({ name:"Другое", color:"zinc" });
  return out;
}
// Гарантирует наличие категории (используется только для "Люди" в категориях финансов —
// не в общем normalizeCategoryList, чтобы не подмешать её и в типы отношений людей, которые
// используют тот же нормализатор списка). Вставляет перед "Другое", если оно есть, чтобы
// "Другое" осталось последним; и на старых сохранениях без "Люди" тоже появится.
export function ensureCategory(list, name, color) {
  if (list.some(c => c.name===name)) return list;
  const other = list.find(c => c.name==="Другое");
  const rest = list.filter(c => c.name!=="Другое");
  return other ? [...rest, { name, color }, other] : [...list, { name, color }];
}
// Та же вставка "перед Другое", что у ensureCategory, но для готового объекта целиком (не только
// name+color) — нужна и при добавлении новой категории, и при восстановлении удалённой через тост
// "Отменить". moveInEditableList молча полагается на то, что "Другое" физически последняя в сыром
// массиве: если это нарушить (например, просто добавить в конец после "Другое"), у элементов после
// неё индекс в общем списке разъезжается с индексом в списке-без-"Другое", и её нельзя перетащить
// или подвинуть стрелками — ровно этот баг тут и чинится.
export function insertBeforeOther(list, item) {
  const otherIdx = list.findIndex(c => c.name==="Другое");
  return otherIdx===-1 ? [...list, item] : [...list.slice(0,otherIdx), item, ...list.slice(otherIdx)];
}
// Переставляет элемент с fromIdx на toIdx внутри редактируемого списка (категории финансов,
// типы отношений людей), где "Другое" всегда физически последняя и в перестановке не участвует.
// Общая логика на оба списка — не дублировать её по месту.
// Возврат элемента на прежнее место при отмене удаления. Без этого "Отменить" визуально
// перекладывает элемент: он всплывает в начало (или падает в конец) списка вместо своей позиции.
// Для сфер и привычек, где порядок задан вручную и осмыслен, это особенно заметно и неприятно.
// idx<0 или больше длины — вставляем в конец (список успел измениться сильнее, чем мы помним).
export function insertAt(list, idx, item) {
  const next = (list || []).slice();
  const at = (idx==null || idx<0) ? next.length : Math.min(idx, next.length);
  next.splice(at, 0, item);
  return next;
}
export function moveInEditableList(list, fromIdx, toIdx) {
  const other = list.find(x => x.name === "Другое");
  const movable = list.filter(x => x.name !== "Другое");
  if (fromIdx<0 || fromIdx>=movable.length || toIdx<0 || toIdx>=movable.length) return list;
  const copy = movable.slice();
  const [item] = copy.splice(fromIdx, 1);
  copy.splice(toIdx, 0, item);
  return other ? [...copy, other] : copy;
}
