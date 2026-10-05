/* Колесо и подбор блюда. Случайность вынесена в один аргумент, поэтому оба инструмента
   проверяются числом, а не наблюдением. */
const E = require("./notes_env.js");
const { eq, done } = E;

/* --- Какой сектор выпал --- */
eq("начало диапазона — первый сектор", E.pickWheelIndex(4, 0), 0);
eq("конец диапазона — последний, а не выход за границу", E.pickWheelIndex(4, 0.999999), 3);
eq("середина", E.pickWheelIndex(4, 0.5), 2);
eq("граница сектора принадлежит следующему", E.pickWheelIndex(4, 0.25), 1);
eq("единица не выходит за список", E.pickWheelIndex(4, 1), 3);
eq("отрицательное подрезается", E.pickWheelIndex(4, -1), 0);
eq("один вариант — он и выпадет", E.pickWheelIndex(1, 0.7), 0);
eq("пустой список — нечего выбирать", E.pickWheelIndex(0, 0.5), -1);
eq("распределение покрывает все секторы",
  [...new Set([0, 0.2, 0.4, 0.6, 0.8].map(r => E.pickWheelIndex(5, r)))].sort(), [0, 1, 2, 3, 4]);

/* --- Куда довернуть диск --- */
const rot = (cur, i, n) => E.wheelTargetRotation(cur, i, n, 4);
eq("всегда крутим вперёд", rot(0, 0, 4) > 0, true);
eq("четыре оборота плюс доводка", rot(0, 0, 4), 4 * 360 + (360 - 45));
eq("второй сектор доворачивается меньше", rot(0, 1, 4), 4 * 360 + (360 - 135));
eq("накопленный угол не сбрасывает направление", rot(1000, 0, 4) > 1000, true);
eq("пустое колесо не двигается", E.wheelTargetRotation(500, -1, 0, 4), 500);
eq("сектор всегда встаёт под стрелку",
  [0, 1, 2, 3].every(i => Math.abs((rot(0, i, 4) + (i * 90 + 45)) % 360) < 0.001), true);

/* --- Варианты --- */
eq("пустые строки и пробелы отбрасываются",
  E.wheelCustomOptions(["Пицца", "  ", "", "Суши"]).map(o => o.label), ["Пицца", "Суши"]);
eq("нет списка — нет вариантов", E.wheelCustomOptions(null), []);

const state = {
  books: [{ id: "b1", title: "Книга", status: "want" }],
  games: [{ id: "g1", title: "Игра", status: "active" }],
  movies: [
    { id: "m1", title: "Фильм", displayTitle: "Кино", status: "want" },
    { id: "m2", title: "Другой", status: "done" },
    { id: "m3", title: "Купить", status: "buy" },
    { id: "m4", title: "Брошен", status: "dropped" },
  ],
};
eq("берём только выбранные виды и статусы",
  E.wheelLibraryOptions(state, ["movie"], ["want"]).map(o => o.label), ["Кино"]);
eq("отображаемое название в приоритете",
  E.wheelLibraryOptions(state, ["movie"], ["want"])[0].label, "Кино");
eq("несколько видов складываются в порядке разделов",
  E.wheelLibraryOptions(state, ["book", "movie"], ["want"]).map(o => o.label), ["Книга", "Кино"]);
eq("несколько статусов",
  E.wheelLibraryOptions(state, ["movie"], ["want", "done"]).length, 2);
eq("ни одного вида — пусто, а не «всё подряд»", E.wheelLibraryOptions(state, [], ["want"]), []);
eq("ни одного статуса — тоже пусто", E.wheelLibraryOptions(state, ["movie"], []), []);
eq("id вариантов различают вид записи",
  E.wheelLibraryOptions(state, ["book"], ["want"])[0].id, "book:b1");

/* --- Что приготовить --- */
const dishes = [
  { id: "d1", name: "Курица с рисом", ingredients: [{ foodId: "f1" }, { foodId: "f2" }] },
  { id: "d2", name: "Омлет", ingredients: [{ foodId: "f3" }, { foodId: "f4" }] },
  { id: "d3", name: "Салат", ingredients: [{ foodId: "f1" }, { foodId: "f5" }, { foodId: "f6" }] },
  { id: "d4", name: "Пустое", ingredients: [] },
];
const res = (have) => E.cookableDishes(dishes, have);

eq("всё есть — блюдо готово", res(["f1", "f2"]).ready.map(d => d.id), ["d1"]);
eq("не хватает одного-двух — в «почти»", res(["f1", "f2", "f3"]).almost.map(a => a.dish.id), ["d2", "d3"]);
eq("и видно, чего именно", res(["f1", "f2", "f3"]).almost[0].missing, ["f4"]);
eq("не хватает троих — не показываем вовсе: подсказка перестаёт быть подсказкой",
  res([]).almost.map(a => a.dish.id), ["d1", "d2"]);
eq("блюдо без ингредиентов готовым не считается",
  res(["f1", "f2", "f3", "f4", "f5", "f6"]).ready.map(d => d.id), ["d1", "d2", "d3"]);
eq("«почти» отсортировано по нехватке",
  res(["f1", "f2", "f3", "f5"]).almost.map(a => a.missing.length), [1, 1]);
eq("пустой холодильник — ничего готового", res([]).ready, []);
eq("нет блюд — не роняет", E.cookableDishes(null, ["f1"]), { ready: [], almost: [] });

eq("нехватка перечисляется без повторов",
  E.dishMissingIngredients({ ingredients: [{ foodId: "x" }, { foodId: "x" }] }, []), ["x"]);
eq("ингредиент без продукта пропускается",
  E.dishMissingIngredients({ ingredients: [{ grams: 100 }, { foodId: "y" }] }, []), ["y"]);

/* --- Настройки по умолчанию --- */
const d = E.defaultMiscPrefs();
eq("по умолчанию ничего не отмечено", d.wheelPicked, []);
eq("холодильник пуст", d.pantry, []);
eq("фильтр статусов осмысленный, а не пустой", d.wheelStatuses.length > 0, true);

/* --- Единый список: свои варианты и отмеченные записи вперемешку --- */
const from = (p) => E.wheelOptionsFrom(state, p).map(o => o.label);
eq("только свои варианты", from({ wheelOptions: ["Погулять"] }), ["Погулять"]);
eq("только отмеченные записи", from({ wheelPicked: ["movie:m1"] }), ["Кино"]);
eq("свои идут первыми, записи следом",
  from({ wheelOptions: ["Погулять"], wheelPicked: ["movie:m1", "book:b1"] }), ["Погулять", "Книга", "Кино"]);
eq("статус отметке не мешает: отметили — значит берём",
  from({ wheelPicked: ["movie:m2"] }), ["Другой"]);
eq("отметка на удалённую запись просто отпадает", from({ wheelPicked: ["book:нет"] }), []);
/* Статусов пять, а не три: отмеченная запись «Хочу купить» или «Брошено» раньше не доезжала до
   колеса вовсе — её отбрасывал урезанный список статусов внутри сборки. */
eq("отмеченное «Хочу купить» попадает на колесо", from({ wheelPicked: ["movie:m3"] }), ["Купить"]);
eq("отмеченное «Брошено» тоже", from({ wheelPicked: ["movie:m4"] }), ["Брошен"]);
eq("все статусы доезжают",
  from({ wheelPicked: ["movie:m1", "movie:m2", "movie:m3", "movie:m4"] }).length, 4);
eq("пустые настройки — пустое колесо", from({}), []);
eq("по умолчанию открыт первый инструмент", d.tool, "wheel");
eq("режим на выбывание выключен", d.wheelKnockout, false);

/* На выбывание: колесо считается по оставшимся, а не по исходному списку — иначе доворот
   встал бы на сектор, которого уже нет. */
const pool = E.wheelCustomOptions(["А", "Б", "В", "Г"]);
const left = (out) => pool.filter(o => !out.includes(o.id));
eq("после двух выбываний остаётся половина", left([pool[0].id, pool[2].id]).map(o => o.label), ["Б", "Г"]);
eq("выбор идёт по оставшимся", E.pickWheelIndex(left([pool[0].id]).length, 0.999999), 2);
eq("последний оставшийся — победитель", left([pool[0].id, pool[1].id, pool[2].id]).map(o => o.label), ["Г"]);

/* Конец партии — это когда кто-то выбыл и остался один. Единственный вариант на колесе партией
   не является: объявлять его победителем не за что, а окно без выбывших уже не закрыть. */
function finishedState(allCount, outCount) {
  const knockout = true;
  const left = allCount - outCount;
  return knockout && outCount > 0 && left === 1;
}
eq("один вариант и никто не выбыл — партии нет", finishedState(1, 0), false);
eq("двое, никто не выбыл — партии нет", finishedState(2, 0), false);
eq("двое, один выбыл — победитель", finishedState(2, 1), true);
eq("четверо, трое выбыли — победитель", finishedState(4, 3), true);
eq("четверо, двое выбыли — ещё играем", finishedState(4, 2), false);

/* Список статусов — один на всё приложение. Расхождение тихое: фильтр просто не показывает
   часть записей, и понять это можно только пересчитав их руками. */
eq("в наборе статусов все пять",
  /const LIBRARY_STATUS_ORDER = \["buy","want","active","done","dropped"\]/.test(E.rawSource), true);
eq("урезанных списков статусов в коде не осталось",
  /\["want", "active", "done"\]/.test(E.rawSource), false);

done();
