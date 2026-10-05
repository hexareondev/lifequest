// Кампании: крупная цель, разбитая на этапы и дневные квесты. Сами квесты кампании живут в
// общем списке квестов и лишь помечены campaignId — кампания их не дублирует и не пересоздаёт.

import { clamp, daysBetween, todayStr } from "../core/basics.js";
import { sortByUrgency } from "./sorting.js";
import { questStartOf } from "./spans.js";

// Кампания — крупная цель, разбитая на этапы и дневные квесты (аналог «мирового квеста», который
// в играх раскладывается на цепочку мелких). Ключевые принципы:
//
// • Квесты кампании — ОБЫЧНЫЕ квесты в state.quests, помеченные campaignId/stageId. Календарь,
//   Хаб, Сферы, Люди, Канбан и достижения работают с ними без единой правки именно потому, что
//   новая сущность ничего не забирает себе (тот же приём, что у привязанных привычек в habits).
// • Кампания НЕ пересоздаёт свои квесты. В отличие от computeSyncedHabits/computeSyncedBirthdayQuests
//   план материализуется один раз (импортом или руками) и дальше живёт как обычные квесты: их
//   можно править, переносить и удалять, и никакой эффект не «починит» это обратно.
// • Всё производное — computed-not-stored: прогресс, даты, суммы наград считаются из quests на
//   лету. Хранится только claimedFinal (не выводим из данных) и снимок фактически выданной
//   награды grantedXp/grantedGold — чтобы откат отбирал ровно столько, сколько выдал, а не
//   пересчитанную позже сумму (тот же принцип снимка, что у rewardXp квеста).
// • Этапы наград не дают — только группировка, заголовок, порядок и собственный мини-прогресс.

export const CAMPAIGN_DEFAULT_PERCENT = 25;
export const CAMPAIGN_MAX_QUESTS = 500;
export const CAMPAIGN_MAX_STAGES = 30;
export const CAMPAIGN_MAX_SUBTASKS = 50;
export const CAMPAIGN_MAX_TITLE = 200;

export function defaultCampaignReward() {
  return { mode:"auto", percent:CAMPAIGN_DEFAULT_PERCENT, xp:null, gold:null, grantedXp:null, grantedGold:null };
}
export function campaignQuestsOf(quests, campaignId) { return (quests||[]).filter(q => q.campaignId===campaignId); }

export function campaignStats(quests, campaign) {
  const list = campaignQuestsOf(quests, campaign && campaign.id);
  const done = list.filter(q=>q.status==="done").length;
  const failed = list.filter(q=>q.status==="failed").length;
  const active = list.filter(q=>q.status==="active").length;
  const dated = list.filter(q=>q.deadline);
  const startDate = dated.length ? dated.map(questStartOf).sort()[0] : null;
  const endDate = dated.length ? dated.map(q=>q.deadline).sort()[dated.length-1] : null;
  const sumXp = list.reduce((a,q)=>a+(q.rewardXp||0), 0);
  const sumGold = list.reduce((a,q)=>a+(q.rewardGold||0), 0);
  return {
    total:list.length, done, failed, active,
    progress: list.length ? done/list.length : 0,
    startDate, endDate, sumXp, sumGold,
    days: startDate && endDate ? daysBetween(startDate, endDate)+1 : 0,
  };
}
export function campaignStageStats(quests, campaignId, stageId) {
  const list = campaignQuestsOf(quests, campaignId).filter(q => (q.stageId||null) === (stageId||null));
  return { total:list.length, done:list.filter(q=>q.status==="done").length, failed:list.filter(q=>q.status==="failed").length };
}
// Ближайший по времени активный квест кампании — строка «Дальше:» в карточке.
export function campaignNextQuest(quests, campaignId) {
  const list = campaignQuestsOf(quests, campaignId).filter(q => q.status==="active");
  if (!list.length) return null;
  return list.slice().sort((a,b) => {
    const da = questStartOf(a), db = questStartOf(b);
    if (da && db) return da.localeCompare(db);
    if (da) return -1;
    if (db) return 1;
    return sortByUrgency(a,b);
  })[0];
}
// Финальная награда: по умолчанию процент от суммы наград квестов кампании — так она сама
// масштабируется под размер плана, и балансировать нужно награды отдельных квестов, а не итог.
export function campaignFinalReward(quests, campaign) {
  const r = (campaign && campaign.reward) || defaultCampaignReward();
  if (r.mode === "manual") return { xp: Math.max(0, Math.round(Number(r.xp)||0)), gold: Math.max(0, Math.round(Number(r.gold)||0)) };
  const st = campaignStats(quests, campaign);
  const pct = clamp(Number(r.percent)||0, 0, 100);
  return { xp: Math.round(st.sumXp*pct/100), gold: Math.round(st.sumGold*pct/100) };
}
// Кампания завершена, когда ВСЕ её квесты выполнены. Провал завершение блокирует намеренно:
// незакрытый хвост не должен проходить как победа — его нужно либо вернуть в работу и выполнить,
// либо удалить из кампании (удаление последнего провала кампанию как раз закрывает, поэтому
// пересчёт обязан стоять и в deleteQuest).
export function campaignIsComplete(quests, campaign) {
  const st = campaignStats(quests, campaign);
  return st.total > 0 && st.done === st.total;
}

// Чистый пересчёт статусов кампаний после ЛЮБОГО изменения состава/статусов квестов.
// Возвращает новый список кампаний и список наград к выдаче — сам ничего не начисляет и никаких
// побочных эффектов не делает (их развешивает вызывающий через defer, см. commit).
export function settleCampaigns(prevCampaigns, quests) {
  const rewards = [];
  const campaigns = (prevCampaigns||[]).map(c => {
    if (c.status === "archived") return c;
    const complete = campaignIsComplete(quests, c);
    if (complete && c.status !== "done") {
      // claimedFinal уже стоит — кампанию закрываем, но награду второй раз не выдаём (тот же
      // принцип «без клавбэка и без повтора», что у claimedTiers у привязанных привычек).
      if (c.claimedFinal) return { ...c, status:"done", completedAt: todayStr() };
      const rw = campaignFinalReward(quests, c);
      rewards.push({ campaignId:c.id, title:c.title, color:c.color, sphereId:c.sphereId, personId:c.personId||null, xp:rw.xp, gold:rw.gold });
      return { ...c, status:"done", completedAt: todayStr(), claimedFinal:true, reward:{ ...c.reward, grantedXp:rw.xp, grantedGold:rw.gold } };
    }
    if (!complete && c.status === "done") return { ...c, status:"active", completedAt:null };
    return c;
  });
  return { campaigns, rewards };
}
// Применение результата settleCampaigns к состоянию: XP — в сферу кампании, золото — в кошелёк,
// и тот же XP человеку, если кампания к нему привязана (правило один в один с completeQuest).
export function applyCampaignSettlement(state, quests) {
  const { campaigns, rewards } = settleCampaigns(state.campaigns, quests);
  if (!rewards.length) return { state: { ...state, quests, campaigns }, rewards };
  let spheres = state.spheres, people = state.people, currency = state.profile.currency;
  rewards.forEach(r => {
    spheres = spheres.map(sp => sp.id===r.sphereId ? { ...sp, xp: sp.xp + r.xp } : sp);
    if (r.personId) people = (people||[]).map(p => p.id===r.personId ? { ...p, xp: p.xp + r.xp } : p);
    currency += r.gold;
  });
  return { state: { ...state, quests, campaigns, spheres, people, profile:{ ...state.profile, currency } }, rewards };
}
// Обратная операция для undo-тоста: отобрать ровно то, что было выдано (по снимку), сбросить
// claimedFinal и вернуть кампанию в активные. Применяется только к откату того самого действия,
// которое кампанию закрыло — «Вернуть в работу» наградой не откатывается сознательно.
export function revertCampaignSettlement(state, rewards) {
  if (!rewards || !rewards.length) return state;
  const byId = new Set(rewards.map(r => r.campaignId));
  let spheres = state.spheres, people = state.people, currency = state.profile.currency;
  rewards.forEach(r => {
    spheres = spheres.map(sp => sp.id===r.sphereId ? { ...sp, xp: Math.max(0, sp.xp - r.xp) } : sp);
    if (r.personId) people = (people||[]).map(p => p.id===r.personId ? { ...p, xp: Math.max(0, p.xp - r.xp) } : p);
    currency = Math.max(0, currency - r.gold);
  });
  const campaigns = (state.campaigns||[]).map(c => byId.has(c.id)
    ? { ...c, status:"active", completedAt:null, claimedFinal:false, reward:{ ...c.reward, grantedXp:null, grantedGold:null } }
    : c);
  return { ...state, campaigns, spheres, people, profile:{ ...state.profile, currency } };
}
