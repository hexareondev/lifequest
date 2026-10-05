// Международные праздники: встроенный каталог дат и авто-квесты подписок на них.

import { addDaysToDateStr, toDateStr, uid } from "../core/basics.js";
import { DIFFICULTY } from "../core/rules.js";

// Фиксированный встроенный каталог — даты одни и те же из года в год (без "плавающих" по дням
// недели праздников, чтобы не усложнять модель). withPhrase — уже в нужном падеже, для фразы
// "Поздравить {имя} {withPhrase}" (тот же приём, что "с днём рождения" у ДР).
export const HOLIDAYS = [
  { id:"new_year",      name:"Новый год",                 month:1,  day:1,  withPhrase:"с Новым годом" },
  { id:"valentines",    name:"День святого Валентина",     month:2,  day:14, withPhrase:"с Днём святого Валентина" },
  { id:"defender_day",  name:"День защитника Отечества",   month:2,  day:23, withPhrase:"с 23 Февраля" },
  { id:"womens_day",    name:"Международный женский день", month:3,  day:8,  withPhrase:"с 8 Марта" },
  { id:"labor_day",     name:"Праздник Весны и Труда",     month:5,  day:1,  withPhrase:"с Первомаем" },
  { id:"victory_day",   name:"День Победы",                month:5,  day:9,  withPhrase:"с Днём Победы" },
  { id:"childrens_day", name:"День защиты детей",          month:6,  day:1,  withPhrase:"с Днём защиты детей" },
  { id:"knowledge_day", name:"День знаний",                month:9,  day:1,  withPhrase:"с Днём знаний" },
  { id:"halloween",     name:"Хэллоуин",                   month:10, day:31, withPhrase:"с Хэллоуином" },
];
// За сколько дней до праздника заводится квест — тот же принцип и то же число, что у ДР.
export const HOLIDAY_QUEST_LEAD_DAYS = 7;
// Небольшая награда человеку за каждую отдельную "поздравительную" подзадачу мульти-праздничного
// квеста (см. computeSyncedHolidayQuests) — начисляется/списывается прямо в toggleSubtask,
// симметрично и идемпотентно, тем же принципом, что completeQuest/reopenQuest.
export const SUBTASK_PERSON_XP = DIFFICULTY.easy.xp;

// Дата ближайшего наступления праздника (месяц/день фиксированы, год — ближайший вперёд) — та же
// логика, что nextBirthdayDateStr, но без парсинга даты рождения, месяц/день уже числа.
function nextHolidayDateStr(month, day, today) {
  const t = new Date(today + "T00:00:00");
  let next = new Date(t.getFullYear(), month-1, day);
  if (toDateStr(next) < today) next = new Date(t.getFullYear()+1, month-1, day);
  return toDateStr(next);
}
// Общий кусок для отписки от праздника (аналог extractActiveBirthdayQuest) — убирает ещё
// невыполненный квест-поздравление этого праздника, если он есть.
export function extractActiveHolidayQuest(quests, holidayId) {
  const found = quests.find(q => q.linkedKind==="holidayGreeting" && q.linkedRefId===holidayId && q.status==="active");
  if (!found) return { quests, removed:null };
  return { quests: quests.filter(q => q.id!==found.id), removed:found };
}
// Заводит авто-квесты на праздники — тот же принцип, что computeSyncedBirthdayQuests, но источник
// не персональная дата, а подписка на пункт каталога HOLIDAYS + опционально привязанные люди
// (state.holidaySubscriptions[holidayId] = { subscribed, personIds, questYears }). Один привязанный
// человек — простой квест "Поздравить X {withPhrase}" (как у ДР). Больше одного — ОДИН квест с
// подзадачей на каждого ("Поздравить X"), у каждой подзадачи есть personId — при отметке такой
// подзадачи (toggleSubtask) человеку сразу начисляется небольшая награда, независимо от общей
// награды за квест целиком. Без привязанных людей — квест не заводится (не для кого), но и год не
// отмечается использованным: если человека привяжут позже, в пределах того же окна, квест ещё
// успеет создаться при следующем пересчёте (специально не помечаем year заранее, см. ниже).
export function computeSyncedHolidayQuests(prevQuests, holidaySubscriptions, people, today) {
  let quests = prevQuests;
  let subsOut = holidaySubscriptions || {};
  let changed = false;

  HOLIDAYS.forEach(h => {
    const sub = subsOut[h.id];
    if (!sub || !sub.subscribed) return;
    const dateStr = nextHolidayDateStr(h.month, h.day, today);
    const year = Number(dateStr.slice(0,4));
    const years = sub.questYears || [];
    if (years.includes(year)) return;
    const leadStart = addDaysToDateStr(dateStr, -HOLIDAY_QUEST_LEAD_DAYS);
    if (today < leadStart || today > dateStr) return;

    const linkedPeople = (sub.personIds||[])
      .map(pid => (people||[]).find(p => p.id===pid))
      .filter(p => p && !p.archived);
    if (linkedPeople.length === 0) return; // некого поздравлять — квест не заводим, год не трогаем

    if (linkedPeople.length === 1) {
      const p = linkedPeople[0];
      quests = [{
        id:uid(), title:`Поздравить ${p.name} ${h.withPhrase}`,
        sphereId:"social", priority:"medium", difficulty:"easy",
        rewardXp:DIFFICULTY.easy.xp, rewardGold:DIFFICULTY.easy.gold,
        status:"active", deadline:dateStr,
        personId:p.id, personName:p.name,
        linkedKind:"holidayGreeting", linkedRefId:h.id,
        subtasks:[], createdAt:today,
      }, ...quests];
    } else {
      quests = [{
        id:uid(), title:h.name,
        sphereId:"social", priority:"medium", difficulty:"medium",
        rewardXp:DIFFICULTY.medium.xp, rewardGold:DIFFICULTY.medium.gold,
        status:"active", deadline:dateStr,
        personId:null, personName:null,
        linkedKind:"holidayGreeting", linkedRefId:h.id,
        subtasks: linkedPeople.map(p => ({ id:uid(), text:`Поздравить ${p.name}`, done:false, personId:p.id })),
        createdAt:today,
      }, ...quests];
    }
    subsOut = { ...subsOut, [h.id]: { ...sub, questYears:[...years, year] } };
    changed = true;
  });

  if (!changed) return { changed:false };
  return { changed:true, quests, holidaySubscriptions:subsOut };
}
