// Питание: БЖУ и калории блюд и остатков. Ничего из этого не хранится — всё считается на лету
// из состава, поэтому поправленная калорийность продукта сама расходится по блюдам и инвентарю.
// В дневнике наоборот: там снимок на момент записи, правка базы не переписывает прожитые дни.

import { todayStr } from "../core/basics.js";

// БЖУ/калории блюд и инвентаря НЕ хранятся — всегда считаются на лету из состава/источника.
// Поправили калорийность продукта в базе — все блюда и остатки в инвентаре с ним автоматически
// пересчитались, ничего вручную обновлять не нужно. А вот в дневнике (nutritionLog) — наоборот,
// снэпшот на момент записи, тот же принцип, что у rewardXp в квестах: правка базы задним числом
// не должна переписывать историю уже прожитых дней.
export function defaultNutritionGoal() {
  return { startDate:null, endDate:null, calories:null, protein:null, fat:null, carbs:null, water:null };
}
export function isNutritionGoalActiveOn(goal, date) {
  return !!(goal && goal.startDate && goal.endDate && date >= goal.startDate && date <= goal.endDate);
}
// Вода как базовый ингредиент блюда — не настоящий продукт (никогда не хранится в state.foods,
// поэтому автоматически не видна на панели «Продукты»), но выбираема в составе блюда через
// зарезервированный id. Вносит вклад только в общий вес, БЖУ/калории нулевые.
export const WATER_INGREDIENT_ID = "__water__";
export const WATER_INGREDIENT = { id: WATER_INGREDIENT_ID, name:"Вода", emoji:"💧" };
export function computeDishNutrition(dish, foods) {
  let calories=0, protein=0, fat=0, carbs=0, weight=0;
  (dish.ingredients||[]).forEach(ing => {
    weight += ing.grams||0;
    if (ing.foodId===WATER_INGREDIENT_ID) return; // вода — только вес, без вклада в БЖУ
    const f = (foods||[]).find(x => x.id===ing.foodId);
    if (!f) return; // продукт удалён из базы — просто не вносит вклад, состав всё равно виден
    const k = (ing.grams||0)/100;
    calories += (f.caloriesPer100||0)*k;
    protein  += (f.proteinPer100||0)*k;
    fat      += (f.fatPer100||0)*k;
    carbs    += (f.carbsPer100||0)*k;
  });
  return { calories, protein, fat, carbs, weight };
}
// Профиль "на 100 г" любого источника (простой продукт или блюдо) — общая точка для инвентаря
// и логирования, чтобы не считать по-разному в разных местах.
export function per100Of(sourceType, sourceId, foods, dishes) {
  if (sourceType==="food") {
    const f = (foods||[]).find(x=>x.id===sourceId);
    if (!f) return null;
    return { caloriesPer100:f.caloriesPer100||0, proteinPer100:f.proteinPer100||0, fatPer100:f.fatPer100||0, carbsPer100:f.carbsPer100||0, name:f.name, emoji:f.emoji };
  }
  if (sourceType==="dish") {
    const d = (dishes||[]).find(x=>x.id===sourceId);
    if (!d) return null;
    const n = computeDishNutrition(d, foods);
    const w = n.weight || 1;
    return { caloriesPer100:n.calories/w*100, proteinPer100:n.protein/w*100, fatPer100:n.fat/w*100, carbsPer100:n.carbs/w*100, name:d.name, emoji:d.emoji };
  }
  return null;
}
export function nutritionFromGrams(per100, grams) {
  const k = (grams||0)/100;
  return { calories:(per100.caloriesPer100||0)*k, protein:(per100.proteinPer100||0)*k, fat:(per100.fatPer100||0)*k, carbs:(per100.carbsPer100||0)*k };
}
export function nutritionDayTotals(log, date) {
  const entries = (log||[]).filter(e => e.date===date);
  const foodEntries = entries.filter(e => e.kind==="food");
  const water = entries.filter(e => e.kind==="water").reduce((a,e) => a+(e.ml||0), 0);
  const base = foodEntries.reduce((a,e) => ({ calories:a.calories+(e.calories||0), protein:a.protein+(e.protein||0), fat:a.fat+(e.fat||0), carbs:a.carbs+(e.carbs||0) }), { calories:0, protein:0, fat:0, carbs:0 });
  return { ...base, water, entries };
}
// Краткий итог БЖУ/калорий за один приём пищи — тот же формат, что nutritionDayTotals, но без воды.
export function mealTotals(entries) {
  return (entries||[]).reduce((a,e) => ({ calories:a.calories+(e.calories||0), protein:a.protein+(e.protein||0), fat:a.fat+(e.fat||0), carbs:a.carbs+(e.carbs||0) }), { calories:0, protein:0, fat:0, carbs:0 });
}
// Общие ключи сортировки для продуктов и блюд — оба сравнивают по одному и тому же набору
// показателей (просто у блюда они не хранятся, а считаются на лету через computeDishNutrition).
export const NUTRITION_SORT_OPTIONS = [
  { id:"alpha",    label:"По алфавиту" },
  { id:"calories", label:"По калориям" },
  { id:"protein",  label:"По белкам" },
  { id:"fat",       label:"По жирам" },
  { id:"carbs",     label:"По углеводам" },
];
export function sortFoodsList(items, sortKey) {
  const arr = items.slice();
  switch (sortKey) {
    case "calories": return arr.sort((a,b) => (b.caloriesPer100||0)-(a.caloriesPer100||0));
    case "protein":  return arr.sort((a,b) => (b.proteinPer100||0)-(a.proteinPer100||0));
    case "fat":       return arr.sort((a,b) => (b.fatPer100||0)-(a.fatPer100||0));
    case "carbs":     return arr.sort((a,b) => (b.carbsPer100||0)-(a.carbsPer100||0));
    case "alpha":
    default: return arr.sort((a,b) => a.name.localeCompare(b.name, "ru"));
  }
}
// Сортировка блюд по посчитанному на лету профилю { dish, n } — n это результат computeDishNutrition.
export function sortDishesByNutrition(items, sortKey) {
  const arr = items.slice();
  switch (sortKey) {
    case "calories": return arr.sort((a,b) => b.n.calories-a.n.calories);
    case "protein":  return arr.sort((a,b) => b.n.protein-a.n.protein);
    case "fat":       return arr.sort((a,b) => b.n.fat-a.n.fat);
    case "carbs":     return arr.sort((a,b) => b.n.carbs-a.n.carbs);
    case "alpha":
    default: return arr.sort((a,b) => a.dish.name.localeCompare(b.dish.name, "ru"));
  }
}
export const INVENTORY_SORT_OPTIONS = [
  { id:"alpha",    label:"По алфавиту" },
  { id:"quantity", label:"По количеству (меньше→больше)" },
  { id:"expiry",   label:"По сроку годности" },
];
export function sortInventoryList(items, sortKey) {
  const arr = items.slice();
  switch (sortKey) {
    case "quantity": return arr.sort((a,b) => (a.gramsLeft||0)-(b.gramsLeft||0));
    case "expiry":   return arr.sort((a,b) => (a.expiryDate||"9999-99-99").localeCompare(b.expiryDate||"9999-99-99"));
    case "alpha":
    default: return arr.sort((a,b) => a.name.localeCompare(b.name, "ru"));
  }
}
// Статус срока годности инвентарного предмета: valid (годен) / soon (истекает ≤3 дней) /
// expired (просрочен). Null — срок не указан, не отслеживается (ничего не показываем).
export function expiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const diffDays = Math.round((new Date(expiryDate+"T00:00:00") - new Date(todayStr()+"T00:00:00")) / 86400000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 3) return "soon";
  return "valid";
}
