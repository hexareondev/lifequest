/* Действия раздела «Питание» — так, как их вызывает приложение. Проверяется то, что легко сломать
   незаметно: слияние повторной еды в одну строку, списание и возврат инвентаря, одна запись воды
   на день, откат удаления на прежнее место. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const { nutritionActions } = load("nutrition/actions.js");
const { defaultNutritionGoal } = load("nutrition/model.js");

const D = "2026-10-01";
function fresh() {
  const store = makeStore({
    foods: [
      { id: "f1", name: "Яйцо", caloriesPer100: 150, proteinPer100: 13, fatPer100: 11, carbsPer100: 1 },
      { id: "f2", name: "Рис", caloriesPer100: 130, proteinPer100: 3, fatPer100: 0, carbsPer100: 28 },
      { id: "f3", name: "Сыр", caloriesPer100: 350 },
    ],
    dishes: [],
    inventory: [{ id: "i1", name: "Рис варёный", sourceType: "food", sourceId: "f2", gramsTotal: 500, gramsLeft: 500 }],
    nutritionLog: [],
    nutritionGoal: defaultNutritionGoal(),
  });
  return { store, act: nutritionActions(store) };
}
const ids = (list) => list.map(x => x.id);
const food = (s) => s.state.nutritionLog.filter(e => e.kind === "food");

// Продукты: удаление и откат на прежнее место.
{
  const { store, act } = fresh();
  act.deleteFood("f2");
  eq("продукт удалён", ids(store.state.foods), ["f1", "f3"]);
  store.undoLast();
  eq("откат вернул продукт на его место", ids(store.state.foods), ["f1", "f2", "f3"]);
  act.addFood({ name: "Хлеб" });
  eq("продукт добавлен", store.state.foods.length, 4);
  eq("новый продукт — в начале списка", store.state.foods[0].name, "Хлеб");
}

// Еда: повторная запись того же продукта в тот же приём сливается в одну строку.
{
  const { store, act } = fresh();
  act.logFood("food", "f1", 50, 1, D);
  act.logFood("food", "f1", 50, 1, D);
  eq("тот же продукт в тот же приём — одна строка", food(store).length, 1);
  eq("граммовка суммирована", food(store)[0].grams, 100);
  eq("калории пересчитаны от суммы", food(store)[0].calories, 150);
  act.logFood("food", "f1", 50, 2, D);
  eq("другой приём — отдельная строка", food(store).length, 2);
  act.logFood("food", "нет", 50, 1, D);
  eq("несуществующий продукт не записывается", food(store).length, 2);
}

// Инвентарь: съесть — списать остаток и записать в дневник; удаление записи возвращает граммы.
{
  const { store, act } = fresh();
  act.consumeInventory("i1", 200, 1, D);
  eq("остаток списан", store.state.inventory[0].gramsLeft, 300);
  eq("запись ведёт на инвентарь", food(store)[0].sourceType, "inventory");
  eq("калории — от исходного продукта", food(store)[0].calories, 260);
  act.consumeInventory("i1", 100, 1, D);
  eq("повторно из того же инвентаря — та же строка", food(store).length, 1);
  eq("граммовка суммирована", food(store)[0].grams, 300);
  const entryId = food(store)[0].id;
  act.deleteNutritionLogEntry(entryId);
  eq("удаление записи вернуло граммы в остаток", store.state.inventory[0].gramsLeft, 500);
  store.undoLast();
  eq("откат удаления снова списал граммы", store.state.inventory[0].gramsLeft, 200);
  eq("запись вернулась", food(store).length, 1);
  act.consumeInventory("i1", 1000, 1, D);
  eq("остаток не уходит в минус", store.state.inventory[0].gramsLeft, 0);
}

// Правка записи: переход с инвентаря на продукт возвращает списанное.
{
  const { store, act } = fresh();
  act.consumeInventory("i1", 100, 1, D);
  const id = food(store)[0].id;
  act.updateNutritionLogEntry(id, { sourceType: "food", sourceId: "f1", grams: 100 });
  eq("старое списание возвращено", store.state.inventory[0].gramsLeft, 500);
  eq("источник сменился", food(store)[0].sourceId, "f1");
  eq("калории пересчитаны", food(store)[0].calories, 150);
}

// Правка записи в источник, который уже есть в этом приёме, — слияние.
{
  const { store, act } = fresh();
  act.logFood("food", "f1", 50, 1, D);
  act.logFood("food", "f2", 100, 1, D);
  const riceId = food(store).find(e => e.sourceId === "f2").id;
  act.updateNutritionLogEntry(riceId, { sourceType: "food", sourceId: "f1", grams: 30 });
  eq("строки слились", food(store).length, 1);
  eq("граммовка суммирована при слиянии", food(store)[0].grams, 80);
}

// Перестановка строк внутри приёма и перенумерация приёмов.
{
  const { store, act } = fresh();
  act.logFood("food", "f1", 10, 1, D);
  act.logFood("food", "f2", 10, 1, D);
  act.logFood("food", "f3", 10, 3, D);
  const order = () => food(store).filter(e => e.meal === 1).map(e => e.sourceId);
  const before = order();
  act.moveNutritionLogEntry(food(store).find(e => e.sourceId === before[0]).id, +1);
  eq("строка сдвинулась вниз", order(), [before[1], before[0]]);
  act.moveNutritionLogEntry(food(store).find(e => e.sourceId === before[0]).id, +1);
  eq("за край приёма не уходит", order(), [before[1], before[0]]);
  act.renumberMealsAfterEmptyRemoved(D, 2);
  eq("приём после пустого сдвинулся", food(store).find(e => e.sourceId === "f3").meal, 2);
  eq("приёмы до пустого не тронуты", food(store).filter(e => e.meal === 1).length, 2);
}

// Вода: одна запись на день.
{
  const { store, act } = fresh();
  act.logWater(250, D);
  act.logWater(250, D);
  const water = () => store.state.nutritionLog.filter(e => e.kind === "water" && e.date === D);
  eq("вода за день — одна запись", water().length, 1);
  eq("объём суммирован", water()[0].ml, 500);
  act.setWaterForDay(D, 100);
  eq("прямая правка не плодит записей", water().length, 1);
  eq("итог заменён", water()[0].ml, 100);
  act.setWaterForDay(D, -50);
  eq("отрицательный итог обрезан до нуля", water()[0].ml, 0);
}

// Выбросить остаток и откатить.
{
  const { store, act } = fresh();
  act.discardInventoryItem("i1");
  eq("остаток выброшен", store.state.inventory[0].gramsLeft, 0);
  eq("в дневник ничего не записано", store.state.nutritionLog.length, 0);
  store.undoLast();
  eq("откат вернул остаток", store.state.inventory[0].gramsLeft, 500);
}

// Цель по питанию.
{
  const { store, act } = fresh();
  act.updateNutritionGoal({ calories: 1800 });
  eq("цель обновлена", store.state.nutritionGoal.calories, 1800);
  act.clearNutritionGoal();
  eq("цель сброшена", store.state.nutritionGoal, defaultNutritionGoal());
}

done();
