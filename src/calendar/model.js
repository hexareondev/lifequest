// Календарь ничего не хранит: события собираются на лету из уже существующих источников —
// дедлайнов квестов, дней рождения людей и истории отметок привычек.

import { addDaysToDateStr, daysBetween, pad2, todayStr } from "../core/basics.js";
import { HOLIDAYS } from "../quests/holidays.js";
import { questMainSphereId, questPersonIds, questSphereIds } from "../quests/links.js";
import { questSpanTotal, questStartOf } from "../quests/spans.js";

// Собирает события Календаря на лету из уже существующих источников (квесты/дни рождения/
// привычки) — тот же принцип computed-not-stored, что уже применён в Питании/Инвентаре, ничего
// не хранится отдельно в state. rangeStart/rangeEnd — включительно, "YYYY-MM-DD". filters —
// state.uiPrefs.calendar.filters ({quests, birthdays, habits, spheres:[]}); без filters отдаёт всё.
export function computeCalendarEvents(state, rangeStart, rangeEnd, filters) {
  const events = [];
  const today = todayStr();
  const sphereById = Object.fromEntries((state.spheres||[]).map(s => [s.id, s]));
  const sphereFilter = filters && Array.isArray(filters.spheres) && filters.spheres.length ? new Set(filters.spheres) : null;
  // Фильтр по конкретной кампании: null — без фильтра, "none" — только квесты вне кампаний.
  const campaignFilter = (filters && filters.campaign) || null;
  const spanMode = (filters && filters.spanMode) === "edges" ? "edges" : "all";

  if (!filters || filters.quests !== false) {
    (state.quests||[]).forEach(q => {
      // Квест попадает в отбор, если ХОТЬ ОДНА его сфера прошла фильтр: иначе связь с
      // несколькими сферами прятала бы квест из всех отборов, кроме полного.
      if (sphereFilter && !questSphereIds(q).some(id => sphereFilter.has(id))) return;
      if (campaignFilter === "none" && q.campaignId) return;
      if (campaignFilter && campaignFilter !== "none" && q.campaignId !== campaignFilter) return;
      // Квест-поздравление с ДР концептуально относится и к "Квестам" (это обычный квест), и к
      // "Дням рождения" (это порождение ДР) одновременно — раньше выключение именно фильтра
      // "Дни рождения" на него не действовало (только фильтр "Квесты"), хотя по смыслу названия
      // должно было прятать и его тоже. Прячем, если выключен любой из двух фильтров.
      if (q.linkedKind==="birthdayGreeting" && filters && filters.birthdays===false) return;
      // Тот же приём для праздничного квеста-поздравления и фильтра "Праздники".
      if (q.linkedKind==="holidayGreeting" && filters && filters.holidays===false) return;
      const sphere = sphereById[questMainSphereId(q)];
      // Квест без дедлайна не привязан ни к какому диапазону вообще — раньше он просто не попадал
      // ни в одно событие и от этого "пропадал" из Канбана (колонка "Без даты" оставалась пустой,
      // а квест, перетащенный в неё, буквально исчезал). Добавляем его безусловно, с date:null —
      // Месяц/Неделя/Повестка такие события у себя не используют (группируют строго по датам),
      // Канбан — наоборот, только на них и держится колонка "Без даты".
      const base = {
        kind:"quest", title:q.title, color: sphere ? sphere.color : "zinc",
        refId:q.id, sphereId:questMainSphereId(q), personId:questPersonIds(q)[0] || null,
        linkedKind:q.linkedKind || null, campaignId:q.campaignId || null,
      };
      if (!q.deadline) {
        events.push({ ...base, id:`quest:${q.id}`, date:null, status:q.status, spanPos:"single", dayIndex:1, dayTotal:1, spanStart:null, spanEnd:null });
        return;
      }
      const overdue = q.deadline < today && q.status === "active";
      const status = overdue ? "overdue" : q.status;
      const spanStart = questStartOf(q), spanTotal = questSpanTotal(q);
      // Простая двусторонняя граница диапазона — раньше здесь был обход нижней границы для
      // просрочки, но он мешал Повестке по умолчанию скрывать прошлое (просроченный квест всё
      // равно просачивался). Вместо обхода — у Канбана теперь свой собственный широкий диапазон
      // (см. CalendarView), которому эта граница вообще не мешает; здесь достаточно честной проверки.
      // У мультидневного квеста граница проверяется по ПЕРЕСЕЧЕНИЮ диапазонов, а не по одной дате.
      if (q.deadline < rangeStart || spanStart > rangeEnd) return;
      if (spanTotal <= 1) {
        events.push({ ...base, id:`quest:${q.id}`, date:q.deadline, status, spanPos:"single", dayIndex:1, dayTotal:1, spanStart:q.deadline, spanEnd:q.deadline });
        return;
      }
      // Мультидневный квест — отдельное событие на КАЖДЫЙ свой день внутри видимого диапазона.
      // Нумерация (dayIndex) считается от начала самого квеста, а не от начала диапазона, иначе
      // «день 1 из 5» появлялся бы заново при каждой прокрутке месяца. spanMode="edges" оставляет
      // только первый и последний день — для тех, кому длинные квесты засоряют Повестку.
      const from = spanStart < rangeStart ? rangeStart : spanStart;
      const to = q.deadline > rangeEnd ? rangeEnd : q.deadline;
      for (let d = from; d <= to; d = addDaysToDateStr(d, 1)) {
        const dayIndex = daysBetween(spanStart, d) + 1;
        const spanPos = dayIndex === 1 ? "start" : dayIndex === spanTotal ? "end" : "middle";
        if (spanMode === "edges" && spanPos === "middle") continue;
        events.push({ ...base, id:`quest:${q.id}:${d}`, date:d, status, spanPos, dayIndex, dayTotal:spanTotal, spanStart, spanEnd:q.deadline });
      }
    });
  }

  if (!filters || filters.birthdays !== false) {
    (state.people||[]).forEach(p => {
      if (!p.birthday || p.archived || p.trackBirthday!==true) return;
      const b = new Date(p.birthday + "T00:00:00");
      if (isNaN(b.getTime())) return;
      // На длинный диапазон может попасть больше одного дня рождения этого человека — перебираем
      // все года диапазона, а не только ближайший (nextBirthdayDateStr для этого не годится).
      const startYear = Number(rangeStart.slice(0,4)), endYear = Number(rangeEnd.slice(0,4));
      for (let y = startYear; y <= endYear; y++) {
        const dateStr = `${y}-${pad2(b.getMonth()+1)}-${pad2(b.getDate())}`;
        if (dateStr < rangeStart || dateStr > rangeEnd) continue;
        events.push({
          id:`birthday:${p.id}:${y}`, date:dateStr, kind:"birthday",
          title:`ДР: ${p.name}`, color:p.color || "amber",
          status: dateStr < today ? "past" : "upcoming",
          refId:p.id, personId:p.id,
        });
      }
    });
  }

  if (!filters || filters.holidays !== false) {
    HOLIDAYS.forEach(h => {
      const sub = state.holidaySubscriptions && state.holidaySubscriptions[h.id];
      if (!sub || !sub.subscribed) return;
      // Тот же приём, что у ДР — перебираем все года диапазона, а не только ближайший.
      const startYear = Number(rangeStart.slice(0,4)), endYear = Number(rangeEnd.slice(0,4));
      for (let y = startYear; y <= endYear; y++) {
        const dateStr = `${y}-${pad2(h.month)}-${pad2(h.day)}`;
        if (dateStr < rangeStart || dateStr > rangeEnd) continue;
        events.push({
          id:`holiday:${h.id}:${y}`, date:dateStr, kind:"holiday",
          title:h.name, color:"violet",
          status: dateStr < today ? "past" : "upcoming",
          refId:h.id,
        });
      }
    });
  }

  if (!filters || filters.habits !== false) {
    (state.habits||[]).forEach(h => {
      if (sphereFilter && !sphereFilter.has(h.sphereId)) return;
      const sphere = sphereById[h.sphereId];
      (h.logs||[]).forEach(d => {
        if (d < rangeStart || d > rangeEnd || d > today) return;
        events.push({
          id:`habit:${h.id}:${d}`, date:d, kind:"habit",
          title:h.title, color: sphere ? sphere.color : "zinc",
          status:"done", refId:h.id, sphereId:h.sphereId,
        });
      });
      // Сегодняшний день — отдельным "не отмечено" маркером, если ещё не отмечена (чтобы день не
      // выглядел пустым, если про привычку просто ещё не вспомнили). Будущих дней у привычек нет
      // в принципе — см. ТЗ «Календарь», допущение 0.2.
      if (today >= rangeStart && today <= rangeEnd && !(h.logs||[]).includes(today)) {
        events.push({
          id:`habit:${h.id}:${today}:pending`, date:today, kind:"habit",
          title:h.title, color: sphere ? sphere.color : "zinc",
          status:"pending", refId:h.id, sphereId:h.sphereId,
        });
      }
    });
  }

  // Без даты — в конец: null не сравнивается со строками предсказуемо через "<"/">"
  // (Повестка эти события у себя дополнительно отфильтровывает, но сорт не должен на них падать).
  return events.sort((a,b) => {
    if (a.date === b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : 1;
  });
}
