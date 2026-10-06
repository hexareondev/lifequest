/* Небольшие группы действий: пулы эмодзи и поощрения (Настройки), награды, достижения, сферы.
   Проверяется защита от удаления того, на что ссылаются, покупка за золото с откатом и откаты на место. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const { settingsActions } = load("settings/actions.js");
const { rewardActions } = load("rewards/actions.js");
const { profileActions } = load("profile/actions.js");
const { sphereActions } = load("quests/sphere-actions.js");
const { defaultEmojiPools, defaultEmojiAssignments } = load("ui/emoji-pools.js");

function fresh() {
  const store = makeStore({
    profile: { name: "Danko", currency: 100 },
    rewards: [
      { id: "r1", title: "Кино", cost: 30, purchases: [] },
      { id: "r2", title: "Книга", cost: 50, purchases: [], link: { kind: "book", itemId: "b1" } },
      { id: "r3", title: "Отпуск", cost: 1000, purchases: [] },
    ],
    books: [{ id: "b1", title: "Дюна", status: "buy" }],
    achievements: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
    spheres: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
    quests: [{ id: "q1", sphereId: "s1" }],
    habits: [{ id: "h1", sphereId: "s2" }],
    uiPrefs: {},
    logRewards: {},
  });
  const act = { ...settingsActions(store), ...rewardActions(store), ...profileActions(store), ...sphereActions(store) };
  return { store, act };
}
const ids = (list) => list.map(x => x.id);
const pools = (s) => s.state.uiPrefs.emojiPools;

// Пулы эмодзи.
{
  const { store, act } = fresh();
  const [first, second] = Object.keys(defaultEmojiPools());
  act.addPoolEmoji(first, "🦊");
  act.addPoolEmoji(first, "🦊");
  eq("эмодзи в пуле не дублируется", pools(store)[first].emojis.filter(e => e === "🦊").length, 1);
  act.removePoolEmoji(first, "🦊");
  eq("эмодзи убрано из пула", pools(store)[first].emojis.includes("🦊"), false);
  act.createEmojiPool("  ");
  const created = Object.keys(pools(store)).find(k => k.startsWith("pool_"));
  eq("пустое имя нового пула заменено", pools(store)[created].name, "Новый пул");
  act.renameEmojiPool(created, "   ");
  eq("пустое переименование не проходит", pools(store)[created].name, "Новый пул");
  act.renameEmojiPool(created, " Звери ");
  eq("пул переименован, пробелы обрезаны", pools(store)[created].name, "Звери");
  const used = Object.values(defaultEmojiAssignments())[0];
  act.deleteEmojiPool(used);
  eq("используемый пул не удаляется", used in pools(store), true);
  eq("показано предупреждение", store.lastToast().text.startsWith("Нельзя удалить"), true);
  act.deleteEmojiPool(created);
  eq("свободный пул удалён", created in pools(store), false);
  const category = Object.keys(defaultEmojiAssignments())[0];
  act.setEmojiAssignment(category, second);
  eq("категория переназначена", store.state.uiPrefs.emojiAssignments[category], second);
}

// Поощрения за ведение.
{
  const { store, act } = fresh();
  act.setLogRewards(true);
  eq("поощрения включены", store.state.logRewards.enabled, true);
  const since = store.state.logRewards.enabledAt;
  eq("дата включения записана", typeof since, "string");
  act.setLogRewards(false);
  eq("выключение сохраняет дату включения", store.state.logRewards.enabledAt, since);
}

// Награды: покупка за золото и откат.
{
  const { store, act } = fresh();
  act.purchaseReward("r3");
  eq("без золота покупка не проходит", store.state.profile.currency, 100);
  eq("показано «Недостаточно золота»", store.lastToast().text, "Недостаточно золота");
  act.purchaseReward("r1");
  eq("золото списано", store.state.profile.currency, 70);
  eq("покупка записана", store.state.rewards[0].purchases.length, 1);
  store.undoLast();
  eq("откат вернул золото", store.state.profile.currency, 100);
  eq("откат убрал покупку", store.state.rewards[0].purchases.length, 0);
}

// Награда, привязанная к книге: «Хочу купить» → «Хочу прочитать», откат возвращает статус.
{
  const { store, act } = fresh();
  act.purchaseReward("r2");
  eq("книга перешла из «купить» в «хочу»", store.state.books[0].status, "want");
  eq("в тосте — название книги", store.lastToast().text.includes("Дюна"), true);
  store.undoLast();
  eq("откат вернул статус «купить»", store.state.books[0].status, "buy");
  store.state.books[0].status = "done";
  act.purchaseReward("r2");
  eq("статус, отличный от «купить», не трогается", store.state.books[0].status, "done");
}

// Награды и достижения: удаление с откатом на место.
{
  const { store, act } = fresh();
  act.deleteReward("r2");
  eq("награда удалена", ids(store.state.rewards), ["r1", "r3"]);
  store.undoLast();
  eq("откат вернул награду на место", ids(store.state.rewards), ["r1", "r2", "r3"]);
  act.addReward({ title: "Кофе", cost: 5 });
  eq("новая награда — в начале", store.state.rewards[0].title, "Кофе");
  act.deleteAchievement("a2");
  eq("достижение удалено", ids(store.state.achievements), ["a1", "a3"]);
  store.undoLast();
  eq("откат вернул достижение на место", ids(store.state.achievements), ["a1", "a2", "a3"]);
  act.addAchievement({ title: "Первый шаг" });
  eq("новое достижение не открыто", store.state.achievements[0].unlockedAt, null);
}

// Сферы: удаляется только свободная.
{
  const { store, act } = fresh();
  act.deleteSphere("s1");
  eq("сфера с квестом не удаляется", ids(store.state.spheres), ["s1", "s2", "s3"]);
  act.deleteSphere("s2");
  eq("сфера с привычкой не удаляется", ids(store.state.spheres), ["s1", "s2", "s3"]);
  act.deleteSphere("s3");
  eq("свободная сфера удалена", ids(store.state.spheres), ["s1", "s2"]);
  store.undoLast();
  eq("откат вернул сферу", ids(store.state.spheres), ["s1", "s2", "s3"]);
  const toasts = store.toasts.length;
  act.deleteSphere("нет");
  eq("несуществующая сфера — без тоста", store.toasts.length, toasts);
  act.addSphere({ name: "Здоровье" });
  eq("новая сфера — в конце, без опыта", [store.state.spheres[3].name, store.state.spheres[3].xp], ["Здоровье", 0]);
}

// Профиль.
{
  const { store, act } = fresh();
  act.updateProfile({ name: "Данко" });
  eq("профиль обновлён, золото не тронуто", [store.state.profile.name, store.state.profile.currency], ["Данко", 100]);
  act.updateProfilePrefs({ statsCollapsed: true });
  eq("настройка профиля записана", store.state.uiPrefs.profile.statsCollapsed, true);
}

done();
