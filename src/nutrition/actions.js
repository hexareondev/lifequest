// Действия раздела «Питание»: продукты, блюда, инвентарь, дневник еды и воды, цель по питанию.
// Устроены как действия финансов — см. finance/actions.js.

import { todayStr, uid } from "../core/basics.js";
import { insertAt } from "../core/lists.js";
import { defaultNutritionGoal, nutritionFromGrams, per100Of } from "./model.js";
import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function nutritionActions({ setState, commit, pushToast }) {
  return {
    // id и дата всюду считаются ДО функции обновления, а не внутри: React вправе прогнать её
    // дважды, и запись получила бы два разных id (тот же принцип, что у addQuest).
    addFood(data) {
      const id = uid(), today = todayStr();
      setState(prev => ({ ...prev, foods: [{ id, createdAt:today, ...data }, ...prev.foods] }));
      pushToast("Продукт добавлен", toastIcon(Sparkles, "text-amber-400"));
    },

    updateFood(id, patch) {
      setState(prev => ({ ...prev, foods: prev.foods.map(f => f.id===id ? { ...f, ...patch } : f) }));
    },

    deleteFood(id) {
      commit((prev, defer) => {
        const removedIdx = prev.foods.findIndex(f => f.id===id);
        const removed = prev.foods[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Продукт удалён", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, foods: insertAt(p2.foods, removedIdx, removed) }));
        }));
        return { ...prev, foods: prev.foods.filter(f => f.id!==id) };
      });
    },

    addDish(data) {
      const id = uid(), today = todayStr();
      setState(prev => ({ ...prev, dishes: [{ id, createdAt:today, ...data }, ...prev.dishes] }));
      pushToast("Блюдо добавлено", toastIcon(Sparkles, "text-amber-400"));
    },

    updateDish(id, patch) {
      setState(prev => ({ ...prev, dishes: prev.dishes.map(d => d.id===id ? { ...d, ...patch } : d) }));
    },

    deleteDish(id) {
      commit((prev, defer) => {
        const removedIdx = prev.dishes.findIndex(d => d.id===id);
        const removed = prev.dishes[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Блюдо удалено", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, dishes: insertAt(p2.dishes, removedIdx, removed) }));
        }));
        return { ...prev, dishes: prev.dishes.filter(d => d.id!==id) };
      });
    },

    // Заводит инвентарь (приготовленное блюдо или запас продукта) от источника — БЖУ/100г
    // считается на лету от sourceId, не копируется. expiryDate — необязательный срок годности.
    addInventoryItem(sourceType, sourceId, gramsTotal, nameOverride, emojiOverride, expiryDate) {
      const id = uid(), today = todayStr();
      setState(prev => {
        const per100 = per100Of(sourceType, sourceId, prev.foods, prev.dishes);
        if (!per100) return prev;
        const item = { id, name: nameOverride || per100.name, emoji: emojiOverride || per100.emoji || "🍽️", sourceType, sourceId, gramsTotal:Number(gramsTotal)||0, gramsLeft:Number(gramsTotal)||0, expiryDate: expiryDate||null, createdAt:today };
        return { ...prev, inventory: [item, ...prev.inventory] };
      });
      pushToast("Добавлено в инвентарь", toastIcon(Sparkles, "text-amber-400"));
    },

    // Точечное редактирование записи инвентаря (сейчас нужно в первую очередь для правки срока
    // годности после создания — тот же паттерн, что updateFood/updateDish).
    updateInventoryItem(id, patch) {
      setState(prev => ({ ...prev, inventory: prev.inventory.map(x => x.id===id ? { ...x, ...patch } : x) }));
    },

    deleteInventoryItem(id) {
      commit((prev, defer) => {
        const removedIdx = prev.inventory.findIndex(x => x.id===id);
        const removed = prev.inventory[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Запись инвентаря удалена", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, inventory: insertAt(p2.inventory, removedIdx, removed) }));
        }));
        return { ...prev, inventory: prev.inventory.filter(x => x.id!==id) };
      });
    },

    // Выбросить остаток — обнуляет gramsLeft в обход дневника питания (никакой записи о приёме
    // пищи не создаётся). Мягко: как удаление, отменяемо тостом (не путать с deleteInventoryItem,
    // который убирает саму запись инвентаря целиком).
    discardInventoryItem(id) {
      commit((prev, defer) => {
        const item = prev.inventory.find(x => x.id===id);
        if (!item || item.gramsLeft<=0) return prev;
        const prevGramsLeft = item.gramsLeft;
        defer(() => pushToast("Остаток выброшен", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, inventory: p2.inventory.map(x => x.id===id ? { ...x, gramsLeft: prevGramsLeft } : x) }));
        }));
        return { ...prev, inventory: prev.inventory.map(x => x.id===id ? { ...x, gramsLeft: 0 } : x) };
      });
    },

    // Съесть/использовать из инвентаря — списывает остаток И логирует в дневник одним действием
    // (то самое "удобно вычитать" из ТЗ). Если в этом же приёме уже есть строка с тем же
    // источником — не плодим вторую, суммируем граммовку в существующую (Яйцо + Яйцо = 2 яйца).
    consumeInventory(id, grams, meal, date) {
      const entryId = uid(), d = date || todayStr(), m = meal || 1;
      setState(prev => {
        const item = prev.inventory.find(x => x.id===id);
        if (!item) return prev;
        const per100 = per100Of(item.sourceType, item.sourceId, prev.foods, prev.dishes);
        const inventory = prev.inventory.map(x => x.id===id ? { ...x, gramsLeft: Math.max(0, x.gramsLeft-(Number(grams)||0)) } : x);
        const dup = prev.nutritionLog.find(e => e.kind==="food" && e.date===d && (e.meal||1)===m && e.sourceType==="inventory" && e.sourceId===id);
        if (dup) {
          const combinedGrams = (dup.grams||0)+(Number(grams)||0);
          const n = per100 ? nutritionFromGrams(per100, combinedGrams) : { calories:0, protein:0, fat:0, carbs:0 };
          return { ...prev, inventory, nutritionLog: prev.nutritionLog.map(e => e.id===dup.id ? { ...dup, grams:combinedGrams, ...n } : e) };
        }
        const n = per100 ? nutritionFromGrams(per100, grams) : { calories:0, protein:0, fat:0, carbs:0 };
        const logEntry = { id:entryId, date: d, kind:"food", sourceType:"inventory", sourceId:id, grams:Number(grams)||0, meal: m, ...n };
        return { ...prev, inventory, nutritionLog: [logEntry, ...prev.nutritionLog] };
      });
    },

    // То же слияние для продуктов/блюд (не из инвентаря): повторное добавление того же источника
    // в тот же приём суммирует граммовку в уже существующую строку, а не создаёт новую.
    logFood(sourceType, sourceId, grams, meal, date) {
      const entryId = uid(), d = date || todayStr(), m = meal || 1;
      setState(prev => {
        const per100 = per100Of(sourceType, sourceId, prev.foods, prev.dishes);
        if (!per100) return prev;
        const dup = prev.nutritionLog.find(e => e.kind==="food" && e.date===d && (e.meal||1)===m && e.sourceType===sourceType && e.sourceId===sourceId);
        if (dup) {
          const combinedGrams = (dup.grams||0)+(Number(grams)||0);
          const n = nutritionFromGrams(per100, combinedGrams);
          return { ...prev, nutritionLog: prev.nutritionLog.map(e => e.id===dup.id ? { ...dup, grams:combinedGrams, ...n } : e) };
        }
        const n = nutritionFromGrams(per100, grams);
        const logEntry = { id:entryId, date: d, kind:"food", sourceType, sourceId, grams:Number(grams)||0, meal: m, ...n };
        return { ...prev, nutritionLog: [logEntry, ...prev.nutritionLog] };
      });
    },

    // Вода за день хранится ОДНОЙ записью (как еда — задваивать незачем): "+N мл" суммируется в
    // неё же. Заодно самостоятельно схлопывает любые старые "россыпи" записей за ту же дату, если
    // они где-то остались (не должно, но на всякий случай — не листать дневник ради этого).
    logWater(ml, date) {
      const id = uid(), d = date || todayStr();
      setState(prev => {
        const existingTotal = prev.nutritionLog.filter(e => e.kind==="water" && e.date===d).reduce((a,e) => a+(e.ml||0), 0);
        const others = prev.nutritionLog.filter(e => !(e.kind==="water" && e.date===d));
        const entry = { id, date:d, kind:"water", ml: existingTotal+(Number(ml)||0) };
        return { ...prev, nutritionLog: [entry, ...others] };
      });
    },

    // Прямая правка итога за день — так же просто, как pagesRead у книги или achievementsGot у игры.
    setWaterForDay(date, ml) {
      const id = uid(), d = date || todayStr();
      setState(prev => {
        const others = prev.nutritionLog.filter(e => !(e.kind==="water" && e.date===d));
        const entry = { id, date:d, kind:"water", ml: Math.max(0, Number(ml)||0) };
        return { ...prev, nutritionLog: [entry, ...others] };
      });
    },

    // Редактирование строки дневника (источник и/или граммовка). Если старая и/или новая запись
    // ведёт на инвентарь — корректно возвращает старое списание и применяет новое, тем же
    // способом, что и consumeInventory (per100 берётся от sourceType/sourceId самого инвентарного
    // предмета, а не от "inventory" напрямую — per100Of такого типа не понимает). Если после
    // правки источник совпал с другой строкой этого же приёма — сливаем в неё (та же логика
    // антидублирования, что при обычном добавлении), а редактируемая запись исчезает.
    updateNutritionLogEntry(id, { sourceType, sourceId, grams }) {
      setState(prev => {
        const old = prev.nutritionLog.find(e => e.id===id);
        if (!old) return prev;
        let inventory = prev.inventory;
        if (old.sourceType==="inventory") {
          inventory = inventory.map(x => x.id===old.sourceId ? { ...x, gramsLeft: x.gramsLeft + (old.grams||0) } : x);
        }
        let per100 = null;
        if (sourceType==="inventory") {
          const invItem = inventory.find(x => x.id===sourceId);
          if (!invItem) return prev;
          per100 = per100Of(invItem.sourceType, invItem.sourceId, prev.foods, prev.dishes);
        } else {
          per100 = per100Of(sourceType, sourceId, prev.foods, prev.dishes);
        }
        if (!per100) return prev;
        if (sourceType==="inventory") {
          inventory = inventory.map(x => x.id===sourceId ? { ...x, gramsLeft: Math.max(0, x.gramsLeft-(Number(grams)||0)) } : x);
        }
        const dup = prev.nutritionLog.find(e => e.id!==id && e.kind==="food" && e.date===old.date && (e.meal||1)===(old.meal||1) && e.sourceType===sourceType && e.sourceId===sourceId);
        if (dup) {
          const combinedGrams = (dup.grams||0)+(Number(grams)||0);
          const n = nutritionFromGrams(per100, combinedGrams);
          const nutritionLog = prev.nutritionLog.filter(e => e.id!==id).map(e => e.id===dup.id ? { ...dup, grams:combinedGrams, ...n } : e);
          return { ...prev, inventory, nutritionLog };
        }
        const n = nutritionFromGrams(per100, grams);
        const updated = { ...old, sourceType, sourceId, grams:Number(grams)||0, ...n };
        return { ...prev, inventory, nutritionLog: prev.nutritionLog.map(e => e.id===id ? updated : e) };
      });
      pushToast("Запись изменена", toastIcon(Pencil, "text-amber-400"));
    },

    // Переставить строку дневника на позицию выше/ниже внутри того же приёма (direction: -1/+1).
    // Порядок отображения строк приёма — это их относительный порядок в самом nutritionLog,
    // поэтому переставляем физически элементы массива, а не храним отдельное поле "order".
    moveNutritionLogEntry(id, direction) {
      setState(prev => {
        const entry = prev.nutritionLog.find(e => e.id===id);
        if (!entry) return prev;
        const siblingArrIdx = [];
        prev.nutritionLog.forEach((e,i) => { if (e.kind==="food" && e.date===entry.date && (e.meal||1)===(entry.meal||1)) siblingArrIdx.push(i); });
        const entryArrIdx = prev.nutritionLog.indexOf(entry);
        const pos = siblingArrIdx.indexOf(entryArrIdx);
        const swapPos = pos + direction;
        if (swapPos<0 || swapPos>=siblingArrIdx.length) return prev;
        const otherArrIdx = siblingArrIdx[swapPos];
        const arr = prev.nutritionLog.slice();
        [arr[entryArrIdx], arr[otherArrIdx]] = [arr[otherArrIdx], arr[entryArrIdx]];
        return { ...prev, nutritionLog: arr };
      });
    },

    // Удаление строки дневника. Если запись списана с инвентарного предмета — грамм возвращается
    // в остаток (той же логикой, что и при редактировании: sourceType/sourceId/grams самой записи
    // и есть тот "маркер", по которому знаем, куда и сколько возвращать). Undo — зеркально списывает обратно.
    deleteNutritionLogEntry(id) {
      commit((prev, defer) => {
        const removedIdx = prev.nutritionLog.findIndex(e => e.id===id);
        const removed = prev.nutritionLog[removedIdx];
        if (!removed) return prev;
        let inventory = prev.inventory;
        if (removed.sourceType==="inventory") {
          inventory = inventory.map(x => x.id===removed.sourceId ? { ...x, gramsLeft: x.gramsLeft+(removed.grams||0) } : x);
        }
        defer(() => pushToast("Запись удалена", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => {
            let inv2 = p2.inventory;
            if (removed.sourceType==="inventory") {
              inv2 = inv2.map(x => x.id===removed.sourceId ? { ...x, gramsLeft: Math.max(0, x.gramsLeft-(removed.grams||0)) } : x);
            }
            return { ...p2, inventory: inv2, nutritionLog: insertAt(p2.nutritionLog, removedIdx, removed) };
          });
        }));
        return { ...prev, inventory, nutritionLog: prev.nutritionLog.filter(e => e.id!==id) };
      });
    },

    // Убрать пустой (без единой записи) приём и сдвинуть номера последующих приёмов этой даты
    // на 1 вниз — чтобы не оставалось дырок в нумерации (1, [пусто], 3 → 1, 2). Сам пустой приём
    // нигде не хранится (это чисто локальное состояние вида), поэтому действию нечего удалять из
    // nutritionLog — только перенумеровать то, что идёт после.
    renumberMealsAfterEmptyRemoved(date, removedMeal) {
      setState(prev => ({
        ...prev,
        nutritionLog: prev.nutritionLog.map(e => (e.date===date && e.kind==="food" && (e.meal||1) > removedMeal) ? { ...e, meal:(e.meal||1)-1 } : e),
      }));
    },

    updateNutritionGoal(patch) {
      setState(prev => ({ ...prev, nutritionGoal: { ...defaultNutritionGoal(), ...prev.nutritionGoal, ...patch } }));
    },

    clearNutritionGoal() {
      setState(prev => ({ ...prev, nutritionGoal: defaultNutritionGoal() }));
    },
  };
}
