// Порядок квестов: сортировки для журнала и для Хаба, ручной порядок внутри кампании.

import { questStartOf } from "./spans.js";

// Для Хаба порядок другой, чем в журнале квестов: там разумно сначала важность, а на главном
// экране в четыре строки должно попасть то, что горит ПО СРОКУ. Иначе критичный квест на конец
// месяца выталкивает с экрана обычный, который сдавать сегодня. Просрочка уезжает наверх сама —
// прошедшая дата меньше любой будущей. Квесты без срока идут последними, между равными сроками
// решает важность.
export function sortByDeadlineFirst(a,b) {
  const da = questStartOf(a) || a.deadline, db = questStartOf(b) || b.deadline;
  if (da && db && da !== db) return da.localeCompare(db);
  if (da && !db) return -1;
  if (!da && db) return 1;
  return sortByUrgency(a,b);
}
// Сортировка по ценности: сначала самые дорогие квесты, при равном опыте — по золоту, дальше
// обычная важность. Нужна, когда цель — набрать уровень, а не закрыть горящее.
function sortByReward(a,b) {
  const xa = a.rewardXp||0, xb = b.rewardXp||0;
  if (xa !== xb) return xb - xa;
  const ga = a.rewardGold||0, gb = b.rewardGold||0;
  if (ga !== gb) return gb - ga;
  return sortByUrgency(a,b);
}
// Позиция квеста в ПЛАНЕ кампании: этап → дата начала → исходный порядок в сохранении (импорт
// кладёт квесты именно в порядке плана, поэтому он же и есть последний разделитель).
function campaignPlanKey(quest, campaigns, indexInState) {
  const ci = (campaigns||[]).findIndex(c => c.id===quest.campaignId);
  const stages = (ci >= 0 && campaigns[ci].stages) || [];
  const si = quest.stageId ? stages.findIndex(st => st.id===quest.stageId) : -1;
  return [ci < 0 ? 9999 : ci, si < 0 ? stages.length : si, questStartOf(quest) || "9999-99-99", indexInState];
}
export function compareCampaignPlan(a, b, campaigns, indexOf) {
  const ka = campaignPlanKey(a, campaigns, indexOf(a)), kb = campaignPlanKey(b, campaigns, indexOf(b));
  for (let i = 0; i < ka.length; i++) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; }
  return 0;
}
// Квесты одной кампании внутри списка идут в порядке плана, а не по общему правилу: обычные
// квесты имеет смысл делать по важности, а шаги кампании — по очереди.
//
// Сделано ПЕРЕСТАНОВКОЙ уже отсортированного списка, а не хитрым компаратором: выбранный порядок
// (важность/срок/награда) по-прежнему решает, ГДЕ в списке стоит группа квестов кампании, а план
// решает только их порядок внутри занятых мест. Компаратор с двумя разными правилами для «своих»
// и «чужих» пар был бы нетранзитивным — сортировка молча давала бы разный результат в зависимости
// от исходного порядка элементов.
export function reorderCampaignQuests(list, campaigns, allQuests) {
  const idx = new Map((allQuests||[]).map((q,i) => [q.id, i]));
  const indexOf = (q) => idx.has(q.id) ? idx.get(q.id) : 0;
  const slots = new Map();
  list.forEach((q,i) => {
    if (!q.campaignId) return;
    if (!slots.has(q.campaignId)) slots.set(q.campaignId, []);
    slots.get(q.campaignId).push(i);
  });
  if (!slots.size) return list;
  const out = list.slice();
  slots.forEach((positions, campaignId) => {
    const inPlan = positions.map(i => list[i]).sort((a,b) => compareCampaignPlan(a, b, campaigns, indexOf));
    positions.forEach((pos, k) => { out[pos] = inPlan[k]; });
  });
  return out;
}
// Порядок в журнале квестов выбирается человеком и запоминается (uiPrefs.quests.sort).
export const QUEST_SORTS = {
  urgency:  { label:"По важности", fn:(a,b) => sortByUrgency(a,b) },
  deadline: { label:"По сроку",    fn:(a,b) => sortByDeadlineFirst(a,b) },
  reward:   { label:"По награде",  fn:(a,b) => sortByReward(a,b) },
};
export function sortByUrgency(a,b) {
  const pr = { critical:0, high:1, medium:2, low:3 };
  const pa = pr[a.priority] ?? 2, pb = pr[b.priority] ?? 2;
  if (pa!==pb) return pa-pb;
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
  if (a.deadline) return -1;
  if (b.deadline) return 1;
  return 0;
}
