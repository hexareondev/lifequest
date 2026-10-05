// Раздел «Разное»: колесо выбора и подсказка, что можно приготовить из того, что есть дома.
// Модель без разметки: что выпало и на какой угол довернуть — считается здесь, рисуется в UI.

import { clamp } from "../core/basics.js";
import { LIBRARY_KINDS, LIBRARY_KIND_ORDER, LIBRARY_STATUS_ORDER, libraryDisplayTitle } from "../library/constants.js";

export function defaultMiscPrefs() {
  return {
    tool: "wheel",                 // какой инструмент открыт: wheel | cook
    wheelKnockout: false,          // режим на выбывание
    wheelOptions: [],              // свои варианты, текстом
    wheelPicked: [],               // отмеченные записи библиотеки, "вид:id"
    wheelStatuses: ["want"],       // каким статусом ограничен список в окне выбора
    pantry: [],                    // id продуктов, которые есть под рукой
  };
}

/* --- Колесо ---
   Выбор и отрисовка разведены намеренно. Какой сектор выпал — решает pickWheelIndex по одному
   случайному числу; на какой угол довернуть колесо, чтобы стрелка встала на этот сектор, —
   отдельный расчёт. Иначе результат зависел бы от анимации, и его нельзя было бы ни повторить,
   ни проверить. */
export function pickWheelIndex(count, rnd) {
  if (!count || count < 1) return -1;
  const r = typeof rnd === "number" && isFinite(rnd) ? clamp(rnd, 0, 0.999999) : Math.random();
  return Math.min(count - 1, Math.floor(r * count));
}

// Угол доворота. Стрелка стоит сверху, секторы отсчитываются по часовой от неё, поэтому центр
// нужного сектора подводится под ноль. turns — полные обороты «для красоты», на результат они
// не влияют.
export function wheelTargetRotation(currentRotation, index, count, turns) {
  if (count < 1 || index < 0) return currentRotation;
  const step = 360 / count;
  const center = index * step + step / 2;
  const base = currentRotation - (currentRotation % 360);
  return base + (turns || 4) * 360 + (360 - center);
}

// Варианты из библиотеки. Статусы и виды приходят из настроек, поэтому пустой набор означает
// «ничего не выбрано», а не «взять всё»: молча подставлять всё — значит показать человеку не то,
// что он просил.
export function wheelLibraryOptions(state, kinds, statuses) {
  const ks = Array.isArray(kinds) ? kinds : [];
  const ss = Array.isArray(statuses) ? statuses : [];
  if (!ks.length || !ss.length) return [];
  const out = [];
  LIBRARY_KIND_ORDER.forEach(k => {
    if (!ks.includes(k)) return;
    (state[LIBRARY_KINDS[k].stateKey] || []).forEach(item => {
      if (!ss.includes(item.status)) return;
      out.push({ id: `${k}:${item.id}`, label: libraryDisplayTitle(item), libKind: k, item });
    });
  });
  return out;
}

// Колесо наполняется одним списком: свои варианты и отмеченные записи библиотеки вперемешку.
// Прежнее деление на «режимы» заставляло выбирать между ними, хотя мешать их — обычное дело:
// «Дюна, Ведьмак 3 или просто выйти погулять».
export function wheelOptionsFrom(state, prefs) {
  const picked = (prefs && prefs.wheelPicked) || [];
  const lib = picked.length
    ? wheelLibraryOptions(state, LIBRARY_KIND_ORDER, LIBRARY_STATUS_ORDER).filter(o => picked.includes(o.id))
    : [];
  return [...wheelCustomOptions(prefs && prefs.wheelOptions), ...lib];
}

export function wheelCustomOptions(list) {
  return (list || [])
    .map(v => String(v || "").trim())
    .filter(Boolean)
    .map((label, i) => ({ id: `custom:${i}`, label }));
}

/* --- Что приготовить ---
   Блюдо годится, если каждый его ингредиент есть под рукой. Отдельно считаем «почти готовые» —
   те, где не хватает одного-двух продуктов: подсказка «купи молоко и сможешь three блюда»
   полезнее, чем пустой список. */
export function dishMissingIngredients(dish, have) {
  const ids = new Set(have || []);
  const need = Array.isArray(dish.ingredients) ? dish.ingredients : [];
  const missing = [];
  need.forEach(ing => {
    if (!ing || !ing.foodId) return;
    if (!ids.has(ing.foodId) && !missing.includes(ing.foodId)) missing.push(ing.foodId);
  });
  return missing;
}

export function cookableDishes(dishes, have, almostLimit) {
  const ready = [];
  const almost = [];
  (dishes || []).forEach(dish => {
    const need = Array.isArray(dish.ingredients) ? dish.ingredients.filter(i => i && i.foodId) : [];
    // Блюдо без ингредиентов приготовить «из имеющегося» нельзя ничем: считать его готовым
    // значит советовать пустоту.
    if (!need.length) return;
    const missing = dishMissingIngredients(dish, have);
    if (!missing.length) ready.push(dish);
    else if (missing.length <= (almostLimit || 2)) almost.push({ dish, missing });
  });
  almost.sort((a, b) => a.missing.length - b.missing.length);
  return { ready, almost };
}
