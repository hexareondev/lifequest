/* Квест может относиться к нескольким сферам и людям. Старые сохранения знают только одиночные
   поля, поэтому чтение обязано понимать обе формы, а запись — только новую. */
const E = require("./notes_env.js");
const { eq, done } = E;

/* --- Чтение: обе формы --- */
eq("новая форма", E.questSphereIds({ sphereIds: ["a", "b"] }), ["a", "b"]);
eq("старая форма поднимается в список", E.questSphereIds({ sphereId: "a" }), ["a"]);
eq("список важнее одиночного поля", E.questSphereIds({ sphereIds: ["b"], sphereId: "a" }), ["b"]);
eq("пустой список остаётся пустым", E.questSphereIds({ sphereIds: [] }), []);
eq("нет связей — пусто", E.questSphereIds({}), []);
eq("квеста нет — не роняет", E.questSphereIds(null), []);
eq("пустые значения отбрасываются", E.questSphereIds({ sphereIds: ["a", null, ""] }), ["a"]);
eq("то же для людей", E.questPersonIds({ personId: "p1" }), ["p1"]);
eq("и для их списка", E.questPersonIds({ personIds: ["p1", "p2"] }), ["p1", "p2"]);

/* --- Главная сфера: первая в списке --- */
eq("главная — первая", E.questMainSphereId({ sphereIds: ["b", "a"] }), "b");
eq("порядок не пересортировывается", E.questMainSphereId({ sphereIds: ["z", "a"] }), "z");
eq("без сфер главной нет", E.questMainSphereId({}), null);
const spheres = [{ id: "a", name: "Здоровье" }, { id: "b", name: "Работа" }];
eq("объект главной сферы", E.questMainSphere(spheres, { sphereIds: ["b", "a"] }).name, "Работа");
eq("ссылка на удалённую сферу не роняет", E.questMainSphere(spheres, { sphereIds: ["нет"] }), null);
eq("без сфер — null", E.questMainSphere(spheres, {}), null);

/* --- Отбор --- */
const q = { sphereIds: ["a", "b"], personIds: ["p1"] };
eq("квест попадает в отбор по любой своей сфере",
  [E.questTouchesSphere(q, "a"), E.questTouchesSphere(q, "b")], [true, true]);
eq("по чужой — нет", E.questTouchesSphere(q, "c"), false);
eq("старая форма тоже отбирается", E.questTouchesSphere({ sphereId: "a" }, "a"), true);
eq("отбор по человеку", E.questTouchesPerson(q, "p1"), true);
eq("по чужому человеку — нет", E.questTouchesPerson(q, "p2"), false);

/* --- Запись: одиночных полей после создания не остаётся --- */
const made = E.normalizeQuestLinks({ id: "q1", title: "Т", sphereId: "a", personId: "p1" });
eq("одиночные поля превращаются в списки", [made.sphereIds, made.personIds], [["a"], ["p1"]]);
eq("и сами исчезают", [made.sphereId, made.personId], [undefined, undefined]);
eq("остальные поля не теряются", [made.id, made.title], ["q1", "Т"]);
eq("уже новая форма проходит насквозь",
  E.normalizeQuestLinks({ sphereIds: ["a", "b"] }).sphereIds, ["a", "b"]);
eq("квест без связей получает пустые списки",
  E.normalizeQuestLinks({ title: "Т" }), { title: "Т", sphereIds: [], personIds: [] });

/* --- Награда: каждой сфере целиком, а не долей --- */
function grant(spheresIn, quest, xp) {
  const ids = E.questSphereIds(quest);
  return spheresIn.map(s => ids.includes(s.id) ? { ...s, xp: s.xp + xp } : s);
}
const base = [{ id: "a", xp: 0 }, { id: "b", xp: 0 }, { id: "c", xp: 0 }];
eq("обе связанные сферы получают полную награду",
  grant(base, { sphereIds: ["a", "b"] }, 50).map(s => s.xp), [50, 50, 0]);
eq("не связанная не получает ничего",
  grant(base, { sphereIds: ["a"] }, 50).map(s => s.xp), [50, 0, 0]);
eq("награда не делится между сферами",
  grant(base, { sphereIds: ["a", "b", "c"] }, 30).map(s => s.xp), [30, 30, 30]);

/* Порядок людей в формах — тот же, что в разделе «Люди»: там он задан вручную, и расхождение
   между двумя списками одних и тех же людей выглядит как случайная перестановка. */
const people = [
  { id: "c", name: "Третий", order: 2 },
  { id: "a", name: "Первый", order: 0 },
  { id: "arch", name: "В архиве", order: 1, archived: true },
  { id: "b", name: "Второй", order: 1 },
];
eq("порядок по ручной сортировке, а не по порядку в состоянии",
  E.activePeople(people).map(p => p.name), ["Первый", "Второй", "Третий"]);
eq("архивные не предлагаются", E.activePeople(people).some(p => p.archived), false);
eq("исходный список не мутируется", people.map(p => p.id), ["c", "a", "arch", "b"]);
eq("человек без порядка встаёт первым, а не теряется",
  E.activePeople([{ id: "x", name: "Без порядка" }, { id: "y", name: "С порядком", order: 5 }]).map(p => p.name),
  ["Без порядка", "С порядком"]);
eq("пустой список не роняет", E.activePeople(null), []);

done();
