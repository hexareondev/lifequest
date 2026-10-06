/* Действия раздела «Квесты». Проверяется: награда каждой сфере и человеку полностью; последний квест
   закрывает кампанию с наградой и окном кампании вместо окна уровня; откат забирает и то и другое;
   удаление проваленного квеста может закрыть кампанию; «Вернуть в работу» награду не отбирает. */
const { eq, done } = require("./notes_env.js");
const { makeStore, load } = require("./actions_env.js");
const { questActions } = load("quests/actions.js");
const { todayStr } = load("core/basics.js");
const { levelFromXp } = load("core/xp.js");

const T = todayStr();
const toNext = levelFromXp(0).xpForNext;
function fresh() {
  const store = makeStore({
    profile: { currency: 0 },
    spheres: [{ id: "s1", xp: 0 }, { id: "s2", xp: 0 }],
    people: [{ id: "p1", xp: 0 }],
    campaigns: [{ id: "c1", title: "Ремонт", status: "active", claimedFinal: false, sphereId: "s2",
      reward: { mode: "manual", xp: 50, gold: 20 } }],
    quests: [
      { id: "q1", status: "active", sphereIds: ["s1", "s2"], personIds: ["p1"], rewardXp: 10, rewardGold: 5 },
      { id: "q2", status: "active", campaignId: "c1", sphereIds: ["s2"], personIds: [], rewardXp: 10, rewardGold: 0 },
      { id: "q3", status: "done", campaignId: "c1", sphereIds: ["s2"], personIds: [], rewardXp: 10, rewardGold: 0 },
    ],
    uiPrefs: {},
  });
  const levels = [], campaignDone = [];
  const act = questActions({ ...store, setLevelUp: l => levels.push(l), setCampaignDone: c => campaignDone.push(c) });
  return { store, act, levels, campaignDone };
}
const quest = (s, id) => s.state.quests.find(q => q.id === id);
const camp = (s) => s.state.campaigns[0];

// Выполнение обычного квеста: полная награда каждой сфере и человеку; откат.
{
  const { store, act, levels } = fresh();
  act.completeQuest("q1");
  eq("квест выполнен сегодня", [quest(store, "q1").status, quest(store, "q1").completedAt], ["done", T]);
  eq("каждой сфере — полная награда", store.state.spheres.map(s => s.xp), [10, 10]);
  eq("человеку — тоже", store.state.people[0].xp, 10);
  eq("золото начислено", store.state.profile.currency, 5);
  eq("уровень не поднялся — окна нет", levels, toNext > 20 ? [] : [2]);
  store.undoLast();
  eq("откат вернул квест в работу", [quest(store, "q1").status, quest(store, "q1").completedAt], ["active", null]);
  eq("откат забрал XP и золото", [store.state.spheres.map(s => s.xp), store.state.people[0].xp, store.state.profile.currency], [[0, 0], 0, 0]);
  act.completeQuest("q1");
  act.completeQuest("q1");
  eq("повторное выполнение ничего не начисляет", store.state.profile.currency, 5);
}

// Последний квест кампании: кампания закрыта, награда, окно кампании вместо окна уровня.
{
  const { store, act, levels, campaignDone } = fresh();
  store.state.spheres[1].xp = toNext - 20;
  act.completeQuest("q2");
  eq("кампания закрыта", [camp(store).status, camp(store).claimedFinal], ["done", true]);
  eq("награда кампании — в её сферу и в кошелёк", [store.state.spheres[1].xp, store.state.profile.currency], [toNext - 20 + 10 + 50, 20]);
  eq("показано окно кампании", campaignDone.map(c => [c.title, c.xp, c.gold, c.questCount]), [["Ремонт", 50, 20, 2]]);
  eq("уровень показан внутри окна кампании, отдельного окна нет", [levels, campaignDone[0].newLevel], [[], 2]);
  store.undoLast();
  eq("откат открыл кампанию и разрешил награду снова", [camp(store).status, camp(store).claimedFinal], ["active", false]);
  eq("откат забрал и награду кампании", [store.state.spheres[1].xp, store.state.profile.currency], [toNext - 20, 0]);
}

// Провал блокирует закрытие; удаление проваленного квеста закрывает кампанию, откат удаления — отбирает.
{
  const { store, act } = fresh();
  act.failQuest("q2");
  eq("провал кампанию не закрывает", camp(store).status, "active");
  act.deleteQuest("q2");
  eq("удаление проваленного квеста закрыло кампанию", camp(store).status, "done");
  eq("награда выдана", store.state.profile.currency, 20);
  const deleteToast = store.toasts.find(t => t.text === "Квест удалён");
  deleteToast.undo();
  eq("откат удаления вернул квест на место", store.state.quests.map(q => q.id), ["q1", "q2", "q3"]);
  eq("и отобрал награду кампании", [store.state.profile.currency, camp(store).status], [0, "active"]);
}

// «Вернуть в работу» — без отбора награды; новый квест в закрытой кампании возвращает её в активные.
{
  const { store, act } = fresh();
  act.completeQuest("q2");
  act.reopenQuest("q3");
  eq("кампания снова активна", camp(store).status, "active");
  eq("награда не отобрана", store.state.profile.currency, 20);
  act.completeQuest("q3");
  eq("повторное закрытие — без второй награды", [camp(store).status, store.state.profile.currency], ["done", 20]);
  act.addQuest({ title: "Покрасить", campaignId: "c1", sphereId: "s2" });
  eq("новый квест вернул кампанию в активные", camp(store).status, "active");
  eq("ссылки нового квеста приведены к спискам", [store.state.quests[0].sphereIds, store.state.quests[0].personIds, "sphereId" in store.state.quests[0]], [["s2"], [], false]);
  act.resetCampaignClaim("c1");
  eq("награду можно разрешить снова", [camp(store).claimedFinal, camp(store).reward.grantedXp], [false, null]);
}

// Подзадачи с человеком: отметка начисляет, снятие списывает.
{
  const { store, act } = fresh();
  store.state.quests[0].subtasks = [{ id: "st1", personId: "p1", done: false }, { id: "st2", done: false }];
  act.toggleSubtask("q1", "st1");
  const gained = store.state.people[0].xp;
  eq("подзадача отмечена, человеку начислено", [quest(store, "q1").subtasks[0].done, gained > 0], [true, true]);
  act.toggleSubtask("q1", "st1");
  eq("снятие списывает обратно", store.state.people[0].xp, 0);
  act.toggleSubtask("q1", "st2");
  eq("обычная подзадача XP не трогает", [quest(store, "q1").subtasks[1].done, store.state.people[0].xp], [true, 0]);
}

// Кампании: удаление с квестами и без, откаты.
{
  const { store, act } = fresh();
  act.deleteCampaign("c1", false);
  eq("кампания удалена, квесты отвязаны", [store.state.campaigns.length, quest(store, "q2").campaignId], [0, null]);
  store.undoLast();
  eq("откат вернул привязку", [store.state.campaigns.length, quest(store, "q2").campaignId], [1, "c1"]);
  act.deleteCampaign("c1", true);
  eq("кампания удалена вместе с квестами", store.state.quests.map(q => q.id), ["q1"]);
  eq("тост называет число квестов", store.lastToast().text, "Кампания и 2 квеста удалены");
  store.undoLast();
  eq("откат вернул квесты на места", store.state.quests.map(q => q.id), ["q1", "q2", "q3"]);
  act.archiveCampaign("c1", true);
  eq("кампания в архиве", camp(store).status, "archived");
  act.completeQuest("q2");
  eq("архивная кампания не закрывается", [camp(store).status, store.state.profile.currency], ["archived", 0]);
  act.archiveCampaign("c1", false);
  eq("возврат из архива закрыл доделанную кампанию с наградой", [camp(store).status, store.state.profile.currency], ["done", 20]);
}

// Импорт кампании и развёрнутые кампании.
{
  const { store, act } = fresh();
  act.importCampaign({ id: "c2", title: "Курс", status: "active" }, [{ id: "n1", campaignId: "c2", status: "active" }, { id: "n2", campaignId: "c2", status: "active" }]);
  eq("кампания и её квесты добавлены", [store.state.campaigns[0].id, store.state.quests.length], ["c2", 5]);
  store.undoLast();
  eq("откат убрал и кампанию, и квесты", [store.state.campaigns.length, store.state.quests.length], [1, 3]);
  act.toggleExpandedCampaign("c1");
  act.toggleExpandedCampaign("c1", true);
  eq("разворот кампании: повторное «развернуть» не дублирует", store.state.uiPrefs.quests.expandedCampaigns, ["c1"]);
  act.toggleExpandedCampaign("c1");
  eq("свёрнута", store.state.uiPrefs.quests.expandedCampaigns, []);
}

done();
