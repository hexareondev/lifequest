// Дни рождения: возраст, сколько дней осталось, дата следующего и короткая подпись для карточки.
// Считается от полной даты рождения — на это опираются и карточка человека, и авто-квест
// поздравления, и Календарь, поэтому счёт должен быть один на всех.

import { toDateStr } from "../core/basics.js";
import { pluralRu } from "../core/format.js";

// birthday хранится как полная дата "YYYY-MM-DD" (выбирается календарём). Возраст считается
// честно — с учётом того, был ли уже в этом году день рождения.
function ageFromBirthday(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday + "T00:00:00");
  if (isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const hadBirthdayThisYear = (today.getMonth() > b.getMonth()) || (today.getMonth()===b.getMonth() && today.getDate() >= b.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age >= 0 ? age : null;
}
// Дней до ближайшего дня рождения (год из birthday игнорируется, берётся только число/месяц).
function daysUntilBirthday(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday + "T00:00:00");
  if (isNaN(b.getTime())) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  let next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  if (next < today) next = new Date(today.getFullYear()+1, b.getMonth(), b.getDate());
  return Math.round((next - today) / 86400000);
}
// Дата ближайшего ДР (год из birthday игнорируется, берётся число/месяц) — та же логика, что у
// daysUntilBirthday, но возвращает саму дату-строку "YYYY-MM-DD", а не число дней. Используется
// и авто-квестом поздравления (computeSyncedBirthdayQuests), и событиями Календаря.
export function nextBirthdayDateStr(birthday, today) {
  if (!birthday) return null;
  const b = new Date(birthday + "T00:00:00");
  if (isNaN(b.getTime())) return null;
  const t = new Date(today + "T00:00:00");
  let next = new Date(t.getFullYear(), b.getMonth(), b.getDate());
  if (toDateStr(next) < today) next = new Date(t.getFullYear()+1, b.getMonth(), b.getDate());
  return toDateStr(next);
}
// Готовая строка "27 лет · ДР через 14 дней" для карточек — и маленькой, и полной.
export function birthdayBlurb(birthday) {
  const age = ageFromBirthday(birthday);
  const days = daysUntilBirthday(birthday);
  if (age===null || days===null) return null;
  const daysPart = days===0 ? "ДР сегодня!" : `ДР через ${days} ${pluralRu(days,"день","дня","дней")}`;
  return `${age} ${pluralRu(age,"год","года","лет")} · ${daysPart}`;
}
