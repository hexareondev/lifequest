// Форматирование чисел и дат для показа человеку. Отдельный файл, потому что на него смотрят
// все разделы разом: рубли в финансах, короткая дата в квестах, месяц в отчётах.

export function fmtMoney(n) {
  const s = Math.round(Math.abs(n||0)).toLocaleString("ru-RU");
  return (n<0?"-":"") + s + " ₽";
}
const MONTHS_SHORT = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
const MONTHS_CAP = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
export function fmtDateShort(dateStr) {
  if (!dateStr) return "";
  const [y,m,d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m-1]}`;
}
export function fmtDateWithYear(dateStr) {
  if (!dateStr) return "";
  const [y,m,d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m-1]} ${y}`;
}
export function monthKey(dateStr) { return dateStr.slice(0,7); }
// Названия месяцев словом: «сентябрь» (бюджет на сентябрь, отчёт за сентябрь) и «сентября»
// (с 1 сентября, с сентября и дальше). Ключ — "2026-09".
const MONTHS_NAME = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
const MONTHS_NAME_GEN = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
export function monthName(key) { return MONTHS_NAME[Number(key.slice(5,7))-1]; }
export function monthNameGen(key) { return MONTHS_NAME_GEN[Number(key.slice(5,7))-1]; }
export function monthLabel(key) {
  const [y,m] = key.split("-").map(Number);
  return `${MONTHS_CAP[m-1]} ${String(y).slice(2)}`;
}

// Склонение русских числительных: pluralRu(21,"год","года","лет") -> "год".
export function pluralRu(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10===1 && mod100!==11) return one;
  if (mod10>=2 && mod10<=4 && (mod100<10 || mod100>=20)) return few;
  return many;
}
