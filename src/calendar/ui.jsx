// Интерфейс календаря: месяц, неделя, повестка и канбан.

import { LinkedHabitCompactRow } from "../habits/ui.jsx";
import { MonthNav } from "../ui/month-nav.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Filter, Flag, Flame, Gift,
  LayoutGrid, List, Plus, Sparkles,
} from "lucide-react";
import {
  addDaysStr, addDaysToDateStr, clamp, daysBetween, pad2, toDateStr, todayStr,
} from "../core/basics.js";
import { fmtDateShort, fmtDateWithYear, monthKey } from "../core/format.js";
import { defaultCalendarPrefs } from "../core/prefs.js";
import { WEEKDAY_LABELS, endOfWeekSunday, startOfWeekMonday } from "../core/week.js";
import { computeStreak } from "../habits/model.js";
import { birthdayBlurb } from "../people/birthday.js";
import { activePeople } from "../people/model.js";
import { HOLIDAYS } from "../quests/holidays.js";
import { questMainSphere } from "../quests/links.js";
import { QuestRow } from "../quests/quest-row.jsx";
import {
  QUEST_MAX_SPAN_DAYS, normalizeQuestDates, questSpanTotal, shiftQuestRangeTo,
} from "../quests/spans.js";
import { QuestCard, QuestForm } from "../quests/ui.jsx";
import { Button, Card, EmptyState, Modal, SectionHeader } from "../ui/atoms.jsx";
import { useIsDesktop } from "../ui/hooks.js";
import { pal } from "../ui/theme.js";
import { computeCalendarEvents } from "./model.js";

// computeCalendarEvents (объявлена выше, рядом с computeSyncedBirthdayQuests) из уже существующих
// источников: квесты (deadline), дни рождения людей, история отметок привычек. См. согласованное
// ТЗ «Календарь + доработки Людей»: 4 варианта отображения, фильтры, назначение квестов на
// будущие дни через клик/drag-and-drop, плюс раунд правок после живой проверки (см. комментарии
// у Канбана и окна дня — там разбор конкретных багов, которые он ловил).

const CALENDAR_VIEW_TABS = [
  { id:"month",  label:"Месяц" },
  { id:"week",   label:"Неделя" },
  { id:"agenda", label:"Повестка" },
  { id:"kanban", label:"Канбан" },
];
const CALENDAR_FILTER_LABELS = { quests:"Квесты", birthdays:"Дни рождения", habits:"Привычки", holidays:"Праздники" };
// Полные недели (пн—вс), покрывающие месяц целиком — 5 или 6 строк сетки, без обрубленных
// "хвостов" из одной-двух ячеек по краям месяца.
function monthGridDays(monthKeyStr) {
  const [y,m] = monthKeyStr.split("-").map(Number);
  const start = startOfWeekMonday(`${y}-${pad2(m)}-01`);
  const end = endOfWeekSunday(toDateStr(new Date(y, m, 0)));
  const days = [];
  for (let d = start; d <= end; d = addDaysToDateStr(d, 1)) days.push(d);
  return days;
}

function CalendarDot({ color, overdue }) {
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${overdue ? "bg-red-500" : pal(color).bgSolid}`} />;
}

function CalendarDayMarkers({ events, onOpenQuest }) {
  if (!events || !events.length) return null;
  const shown = events.slice(0,3);
  const extra = events.length - shown.length;
  return (
    <div className="flex items-center gap-0.5 flex-wrap mt-1">
      {shown.map(e => (
        <span key={e.id} title={e.title}
          draggable={e.kind==="quest"}
          onDragStart={(ev) => { if (e.kind==="quest") { ev.stopPropagation(); ev.dataTransfer.setData("text/quest-id", e.refId); } }}
          onClick={(ev) => { if (e.kind==="quest" && onOpenQuest) { ev.stopPropagation(); onOpenQuest(e.refId); } }}
          className={`inline-block w-1.5 h-1.5 rounded-full ${e.kind==="quest" && e.status==="overdue" ? "bg-red-500" : pal(e.color).bgSolid} ${e.kind==="quest" ? "cursor-grab" : ""}`}
        />
      ))}
      {extra > 0 && <span className="text-[10px] text-zinc-500 font-data leading-none">+{extra}</span>}
    </div>
  );
}

// Мультидневный квест рисуется ОДНОЙ полосой, растянутой на все свои дни, — как в популярных
// трекерах. Ключевое решение: полоса не собирается из кусочков внутри ячеек дня (так её всегда
// будут рвать границы и отступы), а лежит в отдельном слое НАД неделей, где она — один элемент
// CSS-грида с `grid-column: from / span n`. Спан по колонкам сам перекрывает зазоры сетки, так
// что никаких «мостов» из отрицательных отступов не нужно, а перетаскивание и растягивание
// работают с цельным блоком.
//
// Геометрия слоя (в px): отступ сверху под число дня, высота полосы и вертикальный зазор.
const CAL_ROW_HEADER = 22;
const CAL_BAR_H = 18;
const CAL_BAR_GAP = 2;
const CAL_MAX_LANES = 4;
// Отступ сверху в карточке дня недельной сетки: паддинг + строка с датой + её нижний отступ.
const CAL_WEEK_HEADER = 30;

// Раскладка недели: события расходятся по «дорожкам» (lane), внутри дорожки многодневный квест
// превращается в непрерывные отрезки. Разрыв (в режиме «только края» середина пропущена) делит
// полосу на несколько отрезков, но дорожка у них общая — уровень не скачет.
function buildWeekSegments(week, eventsByDate) {
  const spans = [];
  const byKey = new Map();
  week.forEach((d, i) => {
    (eventsByDate[d] || []).forEach(e => {
      const multi = e.kind==="quest" && e.dayTotal > 1;
      const key = multi ? `q:${e.refId}` : `e:${e.id}`;
      let sp = byKey.get(key);
      if (!sp) { sp = { key, from:i, to:i, byDay:{}, multi }; byKey.set(key, sp); spans.push(sp); }
      sp.from = Math.min(sp.from, i); sp.to = Math.max(sp.to, i);
      sp.byDay[i] = e;
    });
  });
  // Длинные полосы занимают дорожки первыми — иначе одиночные события расселятся так, что
  // сплошной дорожки для полосы просто не останется и она уедет вниз.
  spans.sort((a, b) => (b.to - b.from) - (a.to - a.from) || a.from - b.from);
  const busy = [];
  spans.forEach(sp => {
    let lane = 0;
    for (;;) {
      if (!busy[lane]) busy[lane] = new Array(week.length).fill(false);
      let free = true;
      for (let i = sp.from; i <= sp.to && free; i++) if (busy[lane][i]) free = false;
      if (free) break;
      lane++;
    }
    for (let i = sp.from; i <= sp.to; i++) busy[lane][i] = true;
    sp.lane = lane;
  });

  const segments = [];
  const hidden = {};
  spans.forEach(sp => {
    // Скрытые за пределами CAL_MAX_LANES события считаем по дням — для подписи «+N ещё».
    if (sp.lane >= CAL_MAX_LANES) {
      Object.keys(sp.byDay).forEach(i => { const d = week[i]; hidden[d] = (hidden[d]||0) + 1; });
      return;
    }
    let run = null;
    for (let i = sp.from; i <= sp.to + 1; i++) {
      const e = sp.byDay[i];
      if (e && !run) run = { event:e, lastEvent:e, from:i, to:i, lane:sp.lane, key:`${sp.key}:${i}` };
      else if (e && run) { run.to = i; run.lastEvent = e; }
      else if (!e && run) { segments.push(run); run = null; }
    }
  });
  const laneCount = spans.reduce((m, sp) => Math.max(m, Math.min(sp.lane, CAL_MAX_LANES - 1) + 1), 0);
  return { segments, hidden, laneCount };
}

// Слой полос над одной неделей. Всё позиционирование — обычный CSS-грид с теми же 7 колонками и
// тем же зазором, что у ячеек дней, поэтому полосы совпадают с сеткой пиксель в пиксель без
// ручной арифметики.
function CalendarWeekBars({ week, segments, gridClassName, paddingTop, onOpenQuest, onDropQuest, onBeginResize, resizingQuestId }) {
  const ref = useRef(null);
  // Колонка под курсором — нужна, чтобы дроп на саму полосу попадал в правильный день, а не
  // «мимо» (полоса перекрывает ячейки, поэтому обязана обрабатывать дроп сама).
  function dateAt(clientX) {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const col = clamp(Math.floor((clientX - rect.left) / (rect.width / week.length)), 0, week.length - 1);
    return week[col];
  }
  return (
    <div ref={ref} className={`absolute inset-0 ${gridClassName} pointer-events-none`}
      style={{ paddingTop, gridAutoRows: `${CAL_BAR_H}px`, rowGap: CAL_BAR_GAP, alignContent: "start" }}>
      {segments.map(seg => {
        const e = seg.event;
        const multi = e.dayTotal > 1;
        const isQuest = e.kind === "quest";
        // Ручки показываются только у настоящих концов квеста: если полоса уходит на соседнюю
        // неделю, тянуть её за обрезанный край было бы враньём.
        const realStart = multi && e.dayIndex === 1;
        const realEnd = multi && seg.lastEvent.dayIndex === seg.lastEvent.dayTotal;
        return (
          <div key={seg.key}
            style={{ gridColumn: `${seg.from + 1} / span ${seg.to - seg.from + 1}`, gridRow: seg.lane + 1, marginLeft: 2, marginRight: 2 }}
            className={`group/bar relative ${resizingQuestId ? "" : "pointer-events-auto"} flex items-center gap-1 px-1.5 rounded text-[10px] truncate ${isQuest ? "cursor-grab" : "cursor-pointer"} ${resizingQuestId===e.refId ? "ring-1 ring-amber-400/60" : ""} ${isQuest && e.status==="overdue" ? "bg-red-500/20 text-red-200" : `${pal(e.color).bgSoft} ${pal(e.color).text}`}`}
            title={e.title}
            draggable={isQuest && !resizingQuestId}
            onDragStart={(ev) => { if (isQuest) { ev.stopPropagation(); ev.dataTransfer.setData("text/quest-id", e.refId); } }}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={(ev) => { ev.preventDefault(); ev.stopPropagation(); const id = ev.dataTransfer.getData("text/quest-id"); const d = dateAt(ev.clientX); if (id && d) onDropQuest(id, d); }}
            onClick={(ev) => { ev.stopPropagation(); if (isQuest && onOpenQuest) onOpenQuest(e.refId); }}
          >
            {e.kind==="birthday" && <Gift className="w-2.5 h-2.5 shrink-0"/>}
            {e.kind==="holiday" && <Sparkles className="w-2.5 h-2.5 shrink-0"/>}
            {e.campaignId && <Flag className="w-2.5 h-2.5 shrink-0 opacity-70"/>}
            <span className="truncate">{e.title}</span>
            {multi && <span className="ml-auto shrink-0 opacity-60 font-data">{e.dayTotal} дн.</span>}
            {isQuest && realStart && (
              <span onPointerDown={(ev) => onBeginResize(ev, e, "start")} onClick={(ev) => ev.stopPropagation()}
                className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize flex items-center justify-start pl-0.5">
                <span className="h-2.5 w-0.5 rounded-full bg-current opacity-0 group-hover/bar:opacity-70" />
              </span>
            )}
            {isQuest && realEnd && (
              <span onPointerDown={(ev) => onBeginResize(ev, e, "end")} onClick={(ev) => ev.stopPropagation()}
                className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize flex items-center justify-end pr-0.5">
                <span className="h-2.5 w-0.5 rounded-full bg-current opacity-0 group-hover/bar:opacity-70" />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Предпросмотр растягивания: события квеста пересобираются под новые границы, поэтому полоса
// тянется вживую тем же кодом, что и обычно, — отдельной «призрачной» отрисовки не нужно.
function applyResizePreview(days, eventsByDate, resize) {
  if (!resize) return eventsByDate;
  let template = null;
  for (const d of days) {
    const found = (eventsByDate[d]||[]).find(e => e.kind==="quest" && e.refId===resize.questId);
    if (found) { template = found; break; }
  }
  if (!template) return eventsByDate;
  const total = daysBetween(resize.startDate, resize.deadline) + 1;
  const out = {};
  days.forEach(d => { out[d] = (eventsByDate[d]||[]).filter(e => !(e.kind==="quest" && e.refId===resize.questId)); });
  let i = 1;
  for (let d = resize.startDate; d <= resize.deadline; d = addDaysToDateStr(d, 1), i++) {
    if (!(d in out)) continue;
    out[d] = [...out[d], { ...template, id:`quest:${resize.questId}:${d}`, date:d, dayIndex:i, dayTotal:total,
      spanStart:resize.startDate, spanEnd:resize.deadline,
      spanPos: total===1 ? "single" : i===1 ? "start" : i===total ? "end" : "middle" }];
  }
  return out;
}

// Растягивание полосы за край — общее для сеток месяца и недели. Пока тянут, состояние живёт в
// компоненте и НЕ пишется в сохранение: в квест уезжает только итог по отпусканию кнопки, иначе
// каждый пиксель движения давал бы новую запись состояния и свой тост.
function useSpanResize(onResizeQuest) {
  const [resize, setResize] = useState(null);
  const resizeRef = useRef(null);
  resizeRef.current = resize;

  function beginResize(ev, event, edge) {
    ev.preventDefault();
    ev.stopPropagation();
    setResize({ questId: event.refId, edge, startDate: event.spanStart, deadline: event.spanEnd });
  }

  useEffect(() => {
    if (!resize) return;
    // День под курсором ищем через elementFromPoint по атрибуту ячейки: так растягивание работает
    // и через границу недели, и вниз по строкам, без арифметики по прямоугольникам. Полосы на
    // время растягивания теряют pointer-events (см. resizingQuestId), поэтому под курсором
    // оказывается именно ячейка дня, а не сама полоса.
    function dateUnder(ev) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const cell = el && el.closest ? el.closest("[data-cal-date]") : null;
      return cell ? cell.getAttribute("data-cal-date") : null;
    }
    function onMove(ev) {
      const d = dateUnder(ev);
      if (!d) return;
      setResize(r => {
        if (!r) return r;
        if (r.edge === "start") return d <= r.deadline && d !== r.startDate ? { ...r, startDate:d } : r;
        return d >= r.startDate && d !== r.deadline ? { ...r, deadline:d } : r;
      });
    }
    function onUp() {
      const r = resizeRef.current;
      setResize(null);
      if (r && onResizeQuest) onResizeQuest(r.questId, r.startDate, r.deadline);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resize && resize.questId, resize && resize.edge]); // eslint-disable-line react-hooks/exhaustive-deps

  return { resize, beginResize };
}

function CalendarDayCell({ date, inMonth=true, isToday, isSelected, events, hiddenCount, minHeight, onSelect, onQuickAdd, onDropQuest, onOpenQuest }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      data-cal-date={date}
      onClick={() => onSelect(date)}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const questId = e.dataTransfer.getData("text/quest-id"); if (questId) onDropQuest(questId, date); }}
      className={`group relative p-1.5 rounded-lg border cursor-pointer transition flex flex-col ${isToday ? "border-amber-500/40 bg-amber-500/5" : dragOver ? "border-indigo-500/50 bg-indigo-500/5" : isSelected ? "border-indigo-500/40" : "border-zinc-800 hover:border-zinc-700"} ${inMonth ? "" : "opacity-40"}`}
      style={{ minHeight }}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-data ${isToday ? "text-amber-300" : "text-zinc-500"}`}>{Number(date.slice(8,10))}</span>
        <button onClick={(e) => { e.stopPropagation(); onQuickAdd(date); }} className="opacity-0 group-hover:opacity-100 transition text-zinc-600 hover:text-zinc-200" title="Добавить квест на этот день">
          <Plus className="w-3 h-3"/>
        </button>
      </div>
      {/* Узкий экран — точки; от md события рисует слой полос над всей неделей (CalendarWeekBars). */}
      <div className="md:hidden">
        <CalendarDayMarkers events={events} onOpenQuest={onOpenQuest} />
      </div>
      {hiddenCount > 0 && <span className="hidden md:block absolute left-2 bottom-1 text-[10px] text-zinc-600">+{hiddenCount} ещё</span>}
    </div>
  );
}

function CalendarMonthGrid({ month, days, eventsByDate, today, panelDate, onSelectDay, onQuickAdd, onDropQuest, onOpenQuest, onResizeQuest }) {
  const { resize, beginResize } = useSpanResize(onResizeQuest);
  const shownEvents = useMemo(() => applyResizePreview(days, eventsByDate, resize), [days, eventsByDate, resize]);
  const weeks = useMemo(() => {
    const out = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i+7));
    return out;
  }, [days]);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAY_LABELS.map(l => <div key={l} className="text-center text-[10px] uppercase tracking-wide text-zinc-600 font-data">{l}</div>)}
      </div>
      <div className="space-y-1.5">
        {weeks.map(week => {
          const { segments, hidden, laneCount } = buildWeekSegments(week, shownEvents);
          const anyHidden = Object.keys(hidden).length > 0;
          const minHeight = Math.max(64, CAL_ROW_HEADER + laneCount*(CAL_BAR_H + CAL_BAR_GAP) + (anyHidden ? 16 : 6));
          return (
            <div key={week[0]} className="relative">
              <div className="grid grid-cols-7 gap-1.5">
                {week.map(d => (
                  <CalendarDayCell key={d} date={d} inMonth={d.slice(0,7)===month} isToday={d===today} isSelected={d===panelDate}
                    events={shownEvents[d]} hiddenCount={hidden[d]||0} minHeight={minHeight}
                    onSelect={onSelectDay} onQuickAdd={onQuickAdd} onDropQuest={onDropQuest} onOpenQuest={onOpenQuest} />
                ))}
              </div>
              <CalendarWeekBars week={week} segments={segments} gridClassName="hidden md:grid grid-cols-7 gap-x-1.5" paddingTop={CAL_ROW_HEADER}
                onOpenQuest={onOpenQuest} onDropQuest={onDropQuest} onBeginResize={beginResize} resizingQuestId={resize && resize.questId} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarWeekGrid({ days, eventsByDate, today, onSelectDay, onQuickAdd, onDropQuest, onOpenQuest, onResizeQuest }) {
  // Та же модель, что в месяце: события лежат в слое полос над всей неделей, поэтому
  // многодневный квест — один цельный блок, который можно тянуть и растягивать за края.
  // Ниже sm сетка распадается в вертикальный стек карточек, где полоса поперёк бессмысленна —
  // там каждая карточка рисует обычный список своих событий.
  const { resize, beginResize } = useSpanResize(onResizeQuest);
  const shownEvents = useMemo(() => applyResizePreview(days, eventsByDate, resize), [days, eventsByDate, resize]);
  const { segments, hidden, laneCount } = buildWeekSegments(days, shownEvents);
  const anyHidden = Object.keys(hidden).length > 0;
  const minHeight = Math.max(160, CAL_WEEK_HEADER + laneCount*(CAL_BAR_H + CAL_BAR_GAP) + (anyHidden ? 18 : 8));
  return (
    <div className="relative">
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {days.map(d => {
          const events = shownEvents[d] || [];
          const isToday = d === today;
          return (
            <div key={d} data-cal-date={d}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const questId = e.dataTransfer.getData("text/quest-id"); if (questId) onDropQuest(questId, d); }}
              className={`relative rounded-xl border p-2 flex flex-col ${isToday ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800"}`}
              style={{ minHeight }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className={`text-xs font-data ${isToday ? "text-amber-300" : "text-zinc-500"}`}>{WEEKDAY_LABELS[(new Date(d+"T00:00:00").getDay()+6)%7]} {Number(d.slice(8,10))}</div>
                <button onClick={() => onQuickAdd(d)} className="text-zinc-600 hover:text-zinc-200"><Plus className="w-3 h-3"/></button>
              </div>
              <div className="sm:hidden space-y-1">
                {events.map(e => (
                  <button key={e.id}
                    onClick={() => { if (e.kind==="quest") onOpenQuest(e.refId); else onSelectDay(d); }}
                    draggable={e.kind==="quest"}
                    onDragStart={(ev) => { if (e.kind==="quest") ev.dataTransfer.setData("text/quest-id", e.refId); }}
                    className={`w-full text-left px-1.5 py-1 rounded-lg text-[11px] truncate flex items-center gap-1 ${e.kind==="quest" && e.status==="overdue" ? "bg-red-500/10 text-red-300" : `${pal(e.color).bgSoft} ${pal(e.color).text}`}`}
                  >
                    {e.kind==="birthday" && <Gift className="w-2.5 h-2.5 shrink-0"/>}
                    {e.kind==="holiday" && <Sparkles className="w-2.5 h-2.5 shrink-0"/>}
                    {e.campaignId && <Flag className="w-2.5 h-2.5 shrink-0"/>}
                    <span className="truncate">{e.title}</span>
                    {e.dayTotal > 1 && <span className="ml-auto shrink-0 opacity-70 font-data">{e.dayIndex}/{e.dayTotal}</span>}
                  </button>
                ))}
              </div>
              {hidden[d] > 0 && <span className="hidden sm:block absolute left-2 bottom-1.5 text-[10px] text-zinc-600">+{hidden[d]} ещё</span>}
            </div>
          );
        })}
      </div>
      <CalendarWeekBars week={days} segments={segments} gridClassName="hidden sm:grid grid-cols-7 gap-x-2" paddingTop={CAL_WEEK_HEADER}
        onOpenQuest={onOpenQuest} onDropQuest={onDropQuest} onBeginResize={beginResize} resizingQuestId={resize && resize.questId} />
    </div>
  );
}

// Альтернатива "квадратикам" для широкого экрана — тот же построчный список, что и так виден на
// узком (там grid-cols-1 у CalendarWeekGrid и так стек), просто доступный по выбору и на ПК.
// В отличие от Повестки, показывает ВСЕ 7 дней недели (включая пустые), а не только те, где есть
// события — это фиксированная неделя, а не событийная лента.
function CalendarWeekList({ days, eventsByDate, today, onSelectDay, onQuickAdd, onOpenQuest, onDropQuest }) {
  return (
    <div className="space-y-2">
      {days.map(d => {
        const events = eventsByDate[d] || [];
        const isToday = d === today;
        return (
          <div key={d}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const questId = e.dataTransfer.getData("text/quest-id"); if (questId) onDropQuest(questId, d); }}
            className={`rounded-xl border p-3 ${isToday ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800"}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`text-xs font-data ${isToday ? "text-amber-300" : "text-zinc-500"}`}>{WEEKDAY_LABELS[(new Date(d+"T00:00:00").getDay()+6)%7]}, {fmtDateShort(d)}{isToday ? " · Сегодня" : ""}</div>
              <button onClick={() => onQuickAdd(d)} className="text-zinc-600 hover:text-zinc-200"><Plus className="w-3.5 h-3.5"/></button>
            </div>
            {events.length === 0 ? (
              <div className="text-xs text-zinc-600">Ничего не запланировано</div>
            ) : (
              <div className="space-y-1.5">
                {events.map(e => (
                  <button key={e.id}
                    onClick={() => { if (e.kind==="quest") onOpenQuest(e.refId); else onSelectDay(d); }}
                    draggable={e.kind==="quest"}
                    onDragStart={(ev) => { if (e.kind==="quest") ev.dataTransfer.setData("text/quest-id", e.refId); }}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border transition ${e.kind==="quest" && e.status==="overdue" ? "border-red-500/30 bg-red-500/5" : "border-zinc-800 hover:border-zinc-700"}`}
                  >
                    {e.kind==="birthday" ? <Gift className="w-3.5 h-3.5 text-amber-400 shrink-0"/> : e.kind==="holiday" ? <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0"/> : <CalendarDot color={e.color} overdue={e.kind==="quest" && e.status==="overdue"} />}
                    {e.campaignId && <Flag className="w-3 h-3 text-zinc-500 shrink-0"/>}
                    <span className="text-sm text-zinc-200 truncate flex-1">{e.title}</span>
                    {e.dayTotal > 1 && <span className="text-[10px] font-data text-zinc-600 shrink-0">день {e.dayIndex}/{e.dayTotal}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Повестка по умолчанию скрывает прошлое (pastDaysShown=0 -> запрос начинается с сегодня) и
// подгружает его порциями по 7 дней вверх списка по требованию — раньше весь диапазон в -14 дней
// показывался сразу, из-за чего список всегда начинался с "недавнего прошлого", даже если
// человека интересовало только то, что впереди.
function CalendarAgenda({ events, today, onSelectDay, onQuickAdd, onOpenQuest, pastDaysShown, canLoadMorePast, onLoadMorePast, onHidePast }) {
  const [manualDate, setManualDate] = useState("");
  // Группируем строго по датам — события "без даты" (существуют только для Канбана) сюда не
  // подмешиваем, у них есть отдельная колонка "Без даты" в Канбане.
  const byDate = useMemo(() => {
    const map = {};
    events.forEach(e => { if (!e.date) return; (map[e.date] = map[e.date] || []).push(e); });
    return map;
  }, [events]);
  const dates = Object.keys(byDate).sort();
  // Якорь для "К сегодня": сама дата "сегодня", если под ней что-то есть, иначе ближайшая дата
  // впереди — так кнопка не молчит просто потому, что на сегодня ничего не запланировано.
  const anchorDate = dates.find(d => d >= today) || null;
  const anchorRef = useRef(null);
  function scrollToAnchor() {
    if (anchorRef.current) anchorRef.current.scrollIntoView({ behavior:"smooth", block:"start" });
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <input type="date" className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={manualDate} onChange={e=>setManualDate(e.target.value)} />
        <Button size="sm" variant="secondary" disabled={!manualDate} onClick={() => { onQuickAdd(manualDate); setManualDate(""); }}><Plus className="w-3.5 h-3.5"/>Добавить на дату…</Button>
        {anchorDate && (
          <Button size="sm" variant="ghost" onClick={scrollToAnchor}><Calendar className="w-3.5 h-3.5"/>К сегодня</Button>
        )}
      </div>

      {(canLoadMorePast || pastDaysShown > 0) && (
        <div className="flex items-center gap-2">
          {canLoadMorePast && (
            <button onClick={onLoadMorePast} className="flex-1 text-center text-xs text-zinc-500 hover:text-zinc-300 py-2 border border-dashed border-zinc-800 rounded-xl hover:border-zinc-700 transition">
              Показать предыдущие 7 дней ↑
            </button>
          )}
          {pastDaysShown > 0 && (
            <button onClick={onHidePast} className="shrink-0 text-center text-xs text-zinc-500 hover:text-zinc-300 py-2 px-3 border border-dashed border-zinc-800 rounded-xl hover:border-zinc-700 transition">
              Скрыть загруженное прошлое ↓
            </button>
          )}
        </div>
      )}

      {dates.length === 0 ? (
        <EmptyState icon={Calendar} title="Пока пусто" subtitle="В ближайших неделях нет ни одного события." />
      ) : dates.map(date => (
        <div key={date} ref={date===anchorDate ? anchorRef : undefined}>
          <div className="flex items-center justify-between mb-1.5">
            <div className={`text-xs font-data ${date===today ? "text-amber-300" : date < today ? "text-zinc-600" : "text-zinc-500"}`}>{fmtDateWithYear(date)}{date===today ? " · Сегодня" : ""}</div>
            <button onClick={() => onQuickAdd(date)} className="text-zinc-600 hover:text-zinc-200"><Plus className="w-3.5 h-3.5"/></button>
          </div>
          <div className="space-y-1.5">
            {byDate[date].map(e => (
              <button key={e.id} onClick={() => { if (e.kind==="quest") onOpenQuest(e.refId); else onSelectDay(date); }} className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl border transition ${e.kind==="quest" && e.status==="overdue" ? "border-red-500/30 bg-red-500/5" : "border-zinc-800 hover:border-zinc-700"} ${date < today ? "opacity-70" : ""}`}>
                {e.kind==="birthday" ? <Gift className="w-3.5 h-3.5 text-amber-400 shrink-0"/> : e.kind==="holiday" ? <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0"/> : <CalendarDot color={e.color} overdue={e.kind==="quest" && e.status==="overdue"} />}
                {e.campaignId && <Flag className="w-3 h-3 text-zinc-500 shrink-0"/>}
                <span className="text-sm text-zinc-200 truncate flex-1">{e.title}</span>
                {e.dayTotal > 1 && <span className="text-[10px] font-data text-zinc-600 shrink-0">день {e.dayIndex}/{e.dayTotal}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Порядок колонок и их состав пересмотрены после живой проверки: "Просрочено" ушло в конец (это
// диагностика для просмотра, не рабочий поток, ей не место первой), добавлена отдельная "Завтра"
// (раньше "завтра" неотличимо тонуло в "Ближайшие 7 дней"), поэтому "Ближайшие 7 дней" теперь
// значит "послезавтра ... +7 дней" — без пересечения с "Завтра".
const KANBAN_COLUMNS = [
  { id:"today",    label:"Сегодня" },
  { id:"tomorrow", label:"Завтра" },
  { id:"soon",     label:"Ближайшие 7 дней" },
  { id:"later",    label:"Позже" },
  { id:"none",     label:"Без даты" },
  { id:"overdue",  label:"Просрочено" },
];
// Раскладка по колонкам — только диагностика поверх quest.deadline/status, сама колонка нигде не
// хранится (пересчитывается каждый раз). Только АКТИВНЫЕ квесты (не done/failed — им эти колонки
// не имеют смысла: живая проверка показала, что старый выполненный/провальный квест с датой в
// прошлом оседал в "Ближайшие 7 дней" только потому, что дата технически была "<= сегодня+7" без
// проверки нижней границы — фильтр по статусу и явные границы ниже это исключают.
function CalendarKanban({ events, today, onDropQuest, onOpenQuest, collapsed, onToggleCollapse }) {
  const columns = useMemo(() => {
    const map = { today:[], tomorrow:[], soon:[], later:[], none:[], overdue:[] };
    const tomorrow = addDaysStr(1);
    const in7 = addDaysStr(7);
    // Мультидневный квест приходит из computeCalendarEvents несколькими событиями (по одному на
    // каждый свой день) — в Канбане это по-прежнему ОДНА карточка: берём первое событие квеста,
    // остальные пропускаем.
    const seenQuests = new Set();
    events.forEach(e => {
      if (e.kind==="quest") {
        if (seenQuests.has(e.refId)) return;
        seenQuests.add(e.refId);
      }
      let col;
      if (e.status==="overdue") col = "overdue";
      else if (!e.date) col = "none";
      else if (e.kind==="quest") {
        // Колонку квеста определяет НАЧАЛО работы, а не дедлайн: идущий сейчас многодневный
        // квест должен лежать в «Сегодня», даже если сдавать его через три дня. У однодневных
        // spanStart совпадает с date, поэтому правило в точности сводится к прежнему.
        const start = e.spanStart || e.date;
        if (start <= today) col = "today";
        else if (start === tomorrow) col = "tomorrow";
        else if (start <= in7) col = "soon";
        else col = "later";
      }
      else if (e.date===today) col = "today";
      else if (e.date===tomorrow) col = "tomorrow";
      else if (e.date > tomorrow && e.date <= in7) col = "soon";
      else col = "later";
      map[col].push(e);
    });
    return map;
  }, [events, today]);

  // В какой колонке квест УЖЕ лежит — чтобы повторный дроп в ту же колонку был no-op (иначе
  // карточка молча прыгала вперёд по дате при каждом передропе туда же).
  const columnOfRefId = useMemo(() => {
    const map = {};
    Object.keys(columns).forEach(col => columns[col].forEach(e => { map[e.refId] = col; }));
    return map;
  }, [columns]);

  // "Ближайшие 7 дней" и "Позже" — диапазоны, а не конкретная дата: раньше при дропе туда молча
  // подставлялась "сегодня+3"/"сегодня+14", что удивляло (перенос "куда-то в район недели" — не то
  // же самое, что перенос на конкретный день). Теперь для этих двух колонок явно спрашиваем дату,
  // с разумным значением по умолчанию, которое можно тут же поправить.
  const [pendingDrop, setPendingDrop] = useState(null); // { questId, title, date }

  function handleDrop(colId, ev) {
    ev.preventDefault();
    const questId = ev.dataTransfer.getData("text/quest-id");
    if (!questId || colId==="overdue") return; // "Просрочено" — только просмотр, руками не двигают
    if (columnOfRefId[questId] === colId) return; // тот же столбец — дата не пересчитывается
    if (colId==="today") { onDropQuest(questId, today); return; }
    if (colId==="tomorrow") { onDropQuest(questId, addDaysStr(1)); return; }
    if (colId==="none") { onDropQuest(questId, null); return; }
    const defaultDate = colId==="soon" ? addDaysStr(3) : addDaysStr(14);
    const dragged = events.find(e => e.refId===questId);
    setPendingDrop({ questId, title: dragged ? dragged.title : "", date: defaultDate });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {KANBAN_COLUMNS.map(col => {
        const isCollapsed = (collapsed||[]).includes(col.id);
        return (
          <div key={col.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(col.id, e)} className="space-y-2">
            <button onClick={() => onToggleCollapse(col.id)} className={`w-full flex items-center gap-1 text-xs font-data px-1 ${col.id==="overdue" ? "text-red-400" : "text-zinc-500"} hover:text-zinc-300 transition`}>
              <ChevronDown className="w-3 h-3 shrink-0 transition-transform" style={{ transform: isCollapsed ? "rotate(-90deg)" : "none" }} />
              <span className="truncate">{col.label} ({columns[col.id].length})</span>
            </button>
            {!isCollapsed && (
              <div className="space-y-1.5" style={{ minHeight:80 }}>
                {columns[col.id].map(e => (
                  <div key={e.id}
                    draggable={col.id!=="overdue"}
                    onDragStart={(ev) => ev.dataTransfer.setData("text/quest-id", e.refId)}
                    onClick={() => onOpenQuest(e.refId)}
                    className={`px-2.5 py-2 rounded-lg border text-xs cursor-pointer transition ${col.id==="overdue" ? "border-red-500/30 bg-red-500/5 text-red-300" : "border-zinc-800 hover:border-zinc-700 text-zinc-200"}`}
                  >
                    <div className="truncate flex items-center gap-1">
                      {e.campaignId && <Flag className="w-2.5 h-2.5 shrink-0 opacity-60"/>}
                      <span className="truncate">{e.title}</span>
                    </div>
                    {e.date && (
                      <div className="text-[10px] text-zinc-600 font-data mt-0.5">
                        {e.dayTotal > 1 ? `${fmtDateShort(e.spanStart)} → ${fmtDateShort(e.spanEnd)}` : fmtDateShort(e.date)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <Modal open={!!pendingDrop} onClose={() => setPendingDrop(null)} title="На какую дату перенести?">
        {pendingDrop && (
          <div className="space-y-4">
            <div className="text-sm text-zinc-300 truncate">{pendingDrop.title}</div>
            <input type="date" className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 w-full" value={pendingDrop.date} onChange={e => setPendingDrop(p => ({ ...p, date:e.target.value }))} autoFocus />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingDrop(null)}>Отмена</Button>
              <Button onClick={() => { onDropQuest(pendingDrop.questId, pendingDrop.date); setPendingDrop(null); }} disabled={!pendingDrop.date}>Перенести</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// Строка привычки в окне дня — раньше это была просто заблокированная галочка без единой цифры.
// Теперь: сегодняшняя авто-привычка (цель по питанию/воде/чтению) — тот же живой прогресс-виджет,
// что в Хабе/Привычках, с быстрыми действиями и ссылкой на источник цели; сегодняшняя обычная
// привычка — кликабельный чекбокс (можно отметить прямо из календаря), со стриком и сферой;
// прошедший день — история для просмотра (задним числом отметки нигде в приложении не редактируются,
// календарь не исключение), тоже со стриком и сферой. У всех вариантов — ссылка "Открыть →" в
// Привычки (сквозной переход, которого раньше не было вообще).
function CalendarHabitDayRow({ date, habit, sphere, today, state, actions, navigate }) {
  if (!habit) return null;
  const isToday = date === today;
  const c = pal(sphere && sphere.color);
  const streak = computeStreak(habit.logs||[]);

  if (isToday && habit.linkedKind) {
    return <LinkedHabitCompactRow habit={habit} state={state} actions={actions} navigate={navigate} />;
  }

  if (isToday) {
    const done = (habit.logs||[]).includes(date);
    return (
      <div className={`flex items-center gap-3 p-3 rounded-xl border transition ${done ? "bg-zinc-800/40 border-zinc-800" : "bg-zinc-950/40 border-zinc-800 hover:border-zinc-700"}`}>
        <button onClick={() => actions.toggleHabitToday(habit.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${done ? c.bgSolid+" border-transparent" : "border-zinc-600"}`}>{done && <Check className="w-3.5 h-3.5 text-zinc-950"/>}</span>
          <span className="min-w-0 flex-1">
            <div className={`text-sm truncate ${done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{habit.title}</div>
            <div className={`text-xs ${c.text} truncate`}>{sphere ? sphere.name : "Без сферы"}</div>
          </span>
        </button>
        <span className="flex items-center gap-1 text-xs text-orange-400 font-data shrink-0"><Flame className="w-3 h-3"/>{streak}</span>
        <button onClick={() => navigate("habits")} className="text-xs text-amber-400 hover:text-amber-300 shrink-0">Открыть →</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/40">
      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${c.bgSolid} border-transparent`}><Check className="w-3.5 h-3.5 text-zinc-950"/></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate text-zinc-400">{habit.title}</div>
        <div className={`text-xs ${c.text} truncate`}>{sphere ? sphere.name : "Без сферы"} · выполнена в этот день</div>
      </div>
      <span className="flex items-center gap-1 text-xs text-orange-400 font-data shrink-0"><Flame className="w-3 h-3"/>{streak}</span>
      <button onClick={() => navigate("habits")} className="text-xs text-amber-400 hover:text-amber-300 shrink-0">Открыть →</button>
    </div>
  );
}

function CalendarDayDetail({ date, events, today, state, actions, navigate, onQuickAdd, onOpenQuest }) {
  const quests = events.filter(e => e.kind==="quest").map(e => state.quests.find(q=>q.id===e.refId)).filter(Boolean);
  const birthdays = events.filter(e => e.kind==="birthday");
  const holidayEvents = events.filter(e => e.kind==="holiday");
  const habitEvents = events.filter(e => e.kind==="habit");
  return (
    <div className="space-y-4">
      {quests.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-zinc-500 uppercase tracking-wide">Квесты</div>
          {quests.map(q => (
            <QuestRow key={q.id} quest={q} sphere={questMainSphere(state.spheres, q)}
              onComplete={q.status==="active" ? () => actions.completeQuest(q.id) : undefined}
              onClick={() => onOpenQuest(q.id)} />
          ))}
        </div>
      )}
      {birthdays.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-zinc-500 uppercase tracking-wide">Дни рождения</div>
          {birthdays.map(e => {
            const person = state.people.find(p => p.id===e.personId);
            // Раньше искали только status==="active" — как только человек нажимал "Поздравить" и
            // квест завершался, находка пропадала, кнопка просто исчезала без всякой отметки о
            // выполнении. Теперь ищем квест независимо от статуса и рендерим по нему обе ветки.
            const congratsQuest = state.quests.find(q => q.linkedKind==="birthdayGreeting" && q.linkedRefId===e.personId && q.deadline===date);
            return (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/40">
                <Gift className="w-4 h-4 text-amber-400 shrink-0"/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{person ? person.name : e.title}</div>
                  {person && <div className="text-xs text-zinc-500">{birthdayBlurb(person.birthday)}</div>}
                </div>
                {congratsQuest && congratsQuest.status==="active" && (
                  <Button size="sm" variant="secondary" onClick={() => actions.completeQuest(congratsQuest.id)}>Поздравить</Button>
                )}
                {congratsQuest && congratsQuest.status==="done" && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 shrink-0"><Check className="w-3.5 h-3.5"/>Поздравлено</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {holidayEvents.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-zinc-500 uppercase tracking-wide">Праздники</div>
          {holidayEvents.map(e => {
            const holiday = HOLIDAYS.find(h => h.id===e.refId);
            const sub = (state.holidaySubscriptions && state.holidaySubscriptions[e.refId]) || null;
            const linkedNames = ((sub && sub.personIds) || [])
              .map(pid => { const p = state.people.find(x=>x.id===pid); return p ? p.name : null; })
              .filter(Boolean);
            const relatedQuest = state.quests.find(q => q.linkedKind==="holidayGreeting" && q.linkedRefId===e.refId && q.deadline===date);
            const hasSubtasks = relatedQuest && relatedQuest.subtasks && relatedQuest.subtasks.length > 0;
            return (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/40">
                <Sparkles className="w-4 h-4 text-violet-400 shrink-0"/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{holiday ? holiday.name : e.title}</div>
                  {linkedNames.length > 0 && <div className="text-xs text-zinc-500 truncate">{linkedNames.join(", ")}</div>}
                </div>
                {relatedQuest && relatedQuest.status==="active" && (hasSubtasks
                  ? <Button size="sm" variant="secondary" onClick={() => onOpenQuest(relatedQuest.id)}>Открыть квест →</Button>
                  : <Button size="sm" variant="secondary" onClick={() => actions.completeQuest(relatedQuest.id)}>Поздравить</Button>
                )}
                {relatedQuest && relatedQuest.status==="done" && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 shrink-0"><Check className="w-3.5 h-3.5"/>Поздравлено</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {habitEvents.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-zinc-500 uppercase tracking-wide">Привычки</div>
          {habitEvents.map(e => (
            <CalendarHabitDayRow key={e.id} date={date} habit={state.habits.find(h=>h.id===e.refId)}
              sphere={state.spheres.find(s=>s.id===e.sphereId)} today={today} state={state} actions={actions} navigate={navigate} />
          ))}
        </div>
      )}
      {quests.length===0 && birthdays.length===0 && holidayEvents.length===0 && habitEvents.length===0 && (
        <div className="text-sm text-zinc-500">На этот день пока ничего не запланировано.</div>
      )}
      <div className="pt-2 flex justify-end">
        <Button variant="secondary" onClick={onQuickAdd}><Plus className="w-3.5 h-3.5"/>Добавить квест</Button>
      </div>
    </div>
  );
}

export function CalendarView({ state, actions, navigate }) {
  const prefs = (state.uiPrefs && state.uiPrefs.calendar) || defaultCalendarPrefs();
  const [view, setView] = useState(prefs.view || "month");
  const [month, setMonth] = useState(monthKey(todayStr()));
  const [weekStart, setWeekStart] = useState(startOfWeekMonday(todayStr()));
  const [selectedDate, setSelectedDate] = useState(null);
  const [questModalDate, setQuestModalDate] = useState(null);
  const [selectedQuestId, setSelectedQuestId] = useState(null);
  const [editingQuest, setEditingQuest] = useState(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [agendaPastDays, setAgendaPastDays] = useState(0);
  const today = todayStr();
  const isDesktop = useIsDesktop();
  // Панель дня сбоку от сетки Месяца (только на широком экране, см. useIsDesktop) — на ПК сетка
  // месяца сама по себе занимает от силы половину ширины контента, так что рядом с ней достаточно
  // места, чтобы показывать полный, не обрезанный список дня, а не только точки/короткие подписи
  // внутри тесной ячейки. Включение/выключение и ширина — настраиваемые (глазик + перетаскиваемый
  // разделитель), сохраняются в uiPrefs.calendar.monthPanel.
  const [monthPanelDate, setMonthPanelDate] = useState(today);
  const monthPanelPrefs = prefs.monthPanel || defaultCalendarPrefs().monthPanel;
  const monthPanelEnabled = monthPanelPrefs.enabled !== false;
  const [monthPanelWidth, setMonthPanelWidth] = useState(monthPanelPrefs.width || 300);
  const monthSplitRef = useRef(null);
  const monthPanelWidthRef = useRef(monthPanelWidth);

  function changeView(v) { setView(v); actions.setCalendarView(v); }
  // Кампанию могли удалить, пока стоял фильтр по ней — без этой страховки календарь молча
  // опустел бы, и причина была бы неочевидна.
  const filters = useMemo(() => {
    const base = prefs.filters || defaultCalendarPrefs().filters;
    if (base.campaign && base.campaign !== "none" && !(state.campaigns||[]).some(c => c.id===base.campaign)) return { ...base, campaign:null };
    return base;
  }, [prefs.filters, state.campaigns]);
  const weekLayout = prefs.weekLayout || "grid";
  function toggleFilter(key) { actions.setCalendarFilters({ [key]: !filters[key] }); }
  function toggleSphereFilter(sphereId) {
    const cur = filters.spheres || [];
    actions.setCalendarFilters({ spheres: cur.includes(sphereId) ? cur.filter(x=>x!==sphereId) : [...cur, sphereId] });
  }

  // Месяц/Неделя — сетка дней. Канбан классифицирует по колонкам от текущей даты сам по себе
  // (сегодня/завтра/ближайшие 7/позже/просрочено), поэтому ему нужен не короткий "рабочий" диапазон,
  // а большой практически неограниченный запас и назад, и вперёд — иначе старая просрочка или
  // квест с очень дальней датой попросту не попадали бы в выборку. Повестка, наоборот, по
  // умолчанию НЕ показывает прошлое вообще (rangeStart = сегодня) и подгружает его по 7 дней назад
  // через agendaPastDays; будущее у неё — фиксированный запас +60 дней, как и раньше.
  const range = useMemo(() => {
    if (view==="month") { const days = monthGridDays(month); return { start:days[0], end:days[days.length-1], gridDays:days }; }
    if (view==="week") { const days = Array.from({length:7},(_,i)=>addDaysToDateStr(weekStart,i)); return { start:days[0], end:days[days.length-1], gridDays:days }; }
    if (view==="kanban") { return { start:addDaysStr(-3650), end:addDaysStr(3650), gridDays:null }; }
    return { start:addDaysStr(-agendaPastDays), end:addDaysStr(60), gridDays:null };
  }, [view, month, weekStart, agendaPastDays]);

  const events = useMemo(
    () => computeCalendarEvents(state, range.start, range.end, filters),
    [state.quests, state.people, state.habits, state.spheres, range.start, range.end, filters]
  );
  // Квест-поздравление с ДР/праздником — на календаре одновременно и обычный quest-маркер (у него
  // есть deadline), и предмет собственной "красивой" карточки в секции "Дни рождения"/"Праздники"
  // (birthday/holiday-маркер на ту же дату) — раньше оба маркера показывались одновременно, то
  // есть на один и тот же повод приходилось два визуально разных пункта. displayEvents убирает
  // именно generic quest-маркер таких квестов из Месяца/Недели/Повестки/окна дня — там их и так
  // представляет специализированная карточка. Канбан НЕ использует displayEvents (берёт events
  // напрямую) — там это по-прежнему единственное место управлять такими квестами как обычными
  // карточками (подвинуть по датам, увидеть в "Просрочено").
  const displayEvents = useMemo(
    () => events.filter(e => !(e.kind==="quest" && (e.linkedKind==="birthdayGreeting" || e.linkedKind==="holidayGreeting"))),
    [events]
  );
  // Месяц/Неделя/окно дня группируют строго по датам — события "без даты" (только квесты, только
  // для Канбана) сюда осознанно не попадают, иначе они осели бы под бессмысленным ключом "null".
  const eventsByDate = useMemo(() => {
    const map = {};
    displayEvents.forEach(e => { if (!e.date) return; (map[e.date] = map[e.date] || []).push(e); });
    return map;
  }, [displayEvents]);

  function openQuickAdd(dateStr) { setQuestModalDate(dateStr); }
  // Перетаскивание переносит квест ЦЕЛИКОМ, сохраняя длительность: дата дропа становится началом
  // работы, дедлайн отъезжает на столько же дней. У однодневного квеста это в точности прежнее
  // поведение (просто новый deadline). dateStr === null — снять срок (колонка «Без даты»).
  // Растягивание полосы за край: границы приходят уже посчитанными, здесь только инварианты
  // (startDate строго раньше deadline) и запись в квест — одной операцией, по отпусканию кнопки.
  function handleResizeQuest(questId, startDate, deadline) {
    const q = state.quests.find(x => x.id===questId);
    if (!q || !startDate || !deadline) return;
    const dates = normalizeQuestDates(startDate, deadline);
    if (dates.startDate === (q.startDate||null) && dates.deadline === q.deadline) return;
    if (questSpanTotal({ startDate: dates.startDate, deadline: dates.deadline }) > QUEST_MAX_SPAN_DAYS) return;
    actions.updateQuest(questId, dates);
  }
  function handleDropQuest(questId, dateStr) {
    const q = state.quests.find(x => x.id===questId);
    if (!q) return;
    if (!dateStr) { actions.updateQuest(questId, { startDate:null, deadline:null }); return; }
    actions.updateQuest(questId, shiftQuestRangeTo(q, dateStr));
  }
  // Единая точка входа "открыть карточку этого квеста" — используется отовсюду (точки в Месяце,
  // строки в Неделе/Повестке/Канбане, строки в окне дня), чтобы взаимодействие с конкретным
  // квестом никогда не шло в обход через "открой окно дня и найди его там" (было неудобно в
  // Канбане особенно — там у карточки часто вообще нет "дня", у неё есть только колонка).
  function openQuest(questId) { setSelectedQuestId(questId); }
  // На широком экране, пока панель включена, клик по дню Месяца обновляет её вместо модалки — она
  // и так всегда на виду, открывать поверх неё ещё и попап избыточно. Если панель выключена или
  // экран узкий — по-прежнему модалка.
  function handleMonthDayClick(d) {
    setMonthPanelDate(d);
    if (!isDesktop || !monthPanelEnabled) setSelectedDate(d);
  }
  // Перетаскивание разделителя между сеткой и панелью — ширина панели считается от правого края
  // общего контейнера до курсора, зажата между разумным минимумом и тем, чтобы у сетки осталось
  // хотя бы ~320px (иначе 7 колонок начинают разваливаться). Пишем в uiPrefs только по mouseup,
  // не на каждый пиксель — сам драг ведёт локальный стейт для плавности.
  function handlePanelDragStart(e) {
    e.preventDefault();
    function onMove(ev) {
      const el = monthSplitRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fromRight = rect.right - ev.clientX;
      const min = 220, max = Math.max(min, rect.width - 320);
      const next = clamp(Math.round(fromRight), min, max);
      monthPanelWidthRef.current = next;
      setMonthPanelWidth(next);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      actions.setCalendarMonthPanel({ width: monthPanelWidthRef.current });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const selectedQuest = selectedQuestId ? state.quests.find(q => q.id===selectedQuestId) : null;
  // Защита от "зависшей" модалки: если выбранный квест пропал из state (например, его сняли через
  // выключение отслеживания ДР/праздника, пока карточка была открыта) — закрываем автоматически,
  // а не оставляем открытую модалку без содержимого, которую нечем закрыть штатной кнопкой.
  useEffect(() => {
    if (selectedQuestId && !selectedQuest) setSelectedQuestId(null);
  }, [selectedQuestId, selectedQuest]);

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Обзор" title="Календарь" action={<Button onClick={() => openQuickAdd(today)}><Plus className="w-4 h-4"/>Новый квест</Button>} />

      <div className="grid grid-cols-4 gap-2">
        {CALENDAR_VIEW_TABS.map(t => (
          <button key={t.id} onClick={() => changeView(t.id)} className={`py-2.5 rounded-xl text-xs font-medium border transition ${view===t.id ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300" : "border-zinc-800 text-zinc-500"}`}>{t.label}</button>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {Object.keys(CALENDAR_FILTER_LABELS).map(key => (
            <button key={key} onClick={() => toggleFilter(key)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${filters[key] ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "border-zinc-800 text-zinc-600"}`}>{CALENDAR_FILTER_LABELS[key]}</button>
          ))}
          <button onClick={() => setShowMoreFilters(s=>!s)} className="px-3 py-1.5 rounded-full text-xs font-medium border border-zinc-800 text-zinc-500 hover:text-zinc-300 flex items-center gap-1"><Filter className="w-3 h-3"/>Ещё фильтры</button>
        </div>
        {view==="month" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => actions.setCalendarMonthPanel({ enabled: !monthPanelEnabled })}
              className="hidden lg:flex p-1.5 rounded-lg border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 transition"
              title={monthPanelEnabled ? "Скрыть столбец дня" : "Показать столбец дня"}
            >
              {monthPanelEnabled ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
            </button>
            <MonthNav month={month} onChange={setMonth} />
          </div>
        )}
        {view==="week" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => actions.setCalendarWeekLayout(weekLayout==="grid" ? "list" : "grid")}
              className="hidden lg:flex p-1.5 rounded-lg border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 transition"
              title={weekLayout==="grid" ? "Показать списком" : "Показать квадратиками"}
            >
              {weekLayout==="grid" ? <List className="w-4 h-4"/> : <LayoutGrid className="w-4 h-4"/>}
            </button>
            <button onClick={() => setWeekStart(d=>addDaysToDateStr(d,-7))} className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"><ChevronLeft className="w-4 h-4"/></button>
            <div className="font-data text-sm text-zinc-200" style={{ minWidth:140, textAlign:"center" }}>{fmtDateShort(weekStart)} – {fmtDateShort(addDaysToDateStr(weekStart,6))}</div>
            <button onClick={() => setWeekStart(d=>addDaysToDateStr(d,7))} className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"><ChevronRight className="w-4 h-4"/></button>
          </div>
        )}
      </div>

      {showMoreFilters && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {state.spheres.map(s => {
              const active = (filters.spheres||[]).includes(s.id);
              const c = pal(s.color);
              return <button key={s.id} onClick={() => toggleSphereFilter(s.id)} className={`px-2.5 py-1 rounded-full text-xs border transition ${active ? `${c.bgSoft} ${c.border} ${c.text}` : "border-zinc-800 text-zinc-600"}`}>{s.name}</button>;
            })}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-600">Многодневные:</span>
              {[{ id:"all", label:"Все дни" }, { id:"edges", label:"Только начало и конец" }].map(m => (
                <button key={m.id} onClick={() => actions.setCalendarFilters({ spanMode:m.id })}
                  className={`px-2.5 py-1 rounded-full text-xs border transition ${(filters.spanMode||"all")===m.id ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "border-zinc-800 text-zinc-600"}`}>{m.label}</button>
              ))}
            </div>
            {(state.campaigns||[]).length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-600">Кампания:</span>
                <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300"
                  value={filters.campaign || "all"}
                  onChange={e => actions.setCalendarFilters({ campaign: e.target.value==="all" ? null : e.target.value })}>
                  <option value="all">Все</option>
                  <option value="none">Вне кампаний</option>
                  {(state.campaigns||[]).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {view==="month" && (
        <div ref={monthSplitRef} className={monthPanelEnabled ? "lg:flex lg:items-stretch" : ""}>
          <div className={monthPanelEnabled ? "lg:flex-1 lg:min-w-0" : ""}>
            <CalendarMonthGrid month={month} days={range.gridDays} eventsByDate={eventsByDate} today={today} panelDate={monthPanelEnabled ? monthPanelDate : null}
              onSelectDay={handleMonthDayClick} onQuickAdd={openQuickAdd} onDropQuest={handleDropQuest} onOpenQuest={openQuest} onResizeQuest={handleResizeQuest} />
          </div>
          {monthPanelEnabled && (
            <>
              {/* Перетаскиваемый разделитель — только от lg, там же, где и сама панель. Раньше был
                  практически невидим: родитель стоял на items-start, из-за чего разделитель как
                  flex-элемент не растягивался по высоте строки и сжимался в полоску толщиной
                  в пиксель — теперь родитель на items-stretch, плюс запасной minHeight на баре. */}
              <div
                onMouseDown={handlePanelDragStart}
                className="hidden lg:flex items-stretch shrink-0 px-2 cursor-col-resize group"
                title="Потяните, чтобы изменить соотношение сторон"
              >
                <div className="w-1 self-stretch rounded-full bg-zinc-700 group-hover:bg-indigo-500/70 transition" style={{ minHeight:200 }} />
              </div>
              <div className="hidden lg:block shrink-0" style={{ width:monthPanelWidth }}>
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="text-sm font-medium text-zinc-200 truncate">{fmtDateWithYear(monthPanelDate)}{monthPanelDate===today ? " · Сегодня" : ""}</div>
                    <button onClick={() => actions.setCalendarMonthPanel({ enabled:false })} className="text-zinc-600 hover:text-zinc-300 shrink-0" title="Скрыть столбец дня"><EyeOff className="w-3.5 h-3.5"/></button>
                  </div>
                  <CalendarDayDetail date={monthPanelDate} events={eventsByDate[monthPanelDate]||[]} today={today} state={state} actions={actions} navigate={navigate}
                    onQuickAdd={() => openQuickAdd(monthPanelDate)} onOpenQuest={openQuest} />
                </Card>
              </div>
            </>
          )}
        </div>
      )}
      {view==="week" && (weekLayout==="list"
        ? <CalendarWeekList days={range.gridDays} eventsByDate={eventsByDate} today={today} onSelectDay={setSelectedDate} onQuickAdd={openQuickAdd} onDropQuest={handleDropQuest} onOpenQuest={openQuest} />
        : <CalendarWeekGrid days={range.gridDays} eventsByDate={eventsByDate} today={today} onSelectDay={setSelectedDate} onQuickAdd={openQuickAdd} onDropQuest={handleDropQuest} onOpenQuest={openQuest} onResizeQuest={handleResizeQuest} />
      )}
      {view==="agenda" && (
        <CalendarAgenda events={displayEvents} today={today} onSelectDay={setSelectedDate} onQuickAdd={openQuickAdd} onOpenQuest={openQuest}
          pastDaysShown={agendaPastDays} canLoadMorePast={agendaPastDays < 365} onLoadMorePast={() => setAgendaPastDays(d => d+7)} onHidePast={() => setAgendaPastDays(0)} />
      )}
      {view==="kanban" && (
        <CalendarKanban events={events.filter(e => e.kind==="quest" && e.status!=="done" && e.status!=="failed")} today={today}
          onDropQuest={handleDropQuest} onOpenQuest={openQuest}
          collapsed={prefs.kanbanCollapsed || []} onToggleCollapse={actions.toggleKanbanColumn} />
      )}

      <Modal open={!!selectedDate} onClose={() => setSelectedDate(null)} title={selectedDate ? fmtDateWithYear(selectedDate) : ""}>
        {selectedDate && (
          <CalendarDayDetail date={selectedDate} events={eventsByDate[selectedDate]||[]} today={today} state={state} actions={actions} navigate={navigate}
            onQuickAdd={() => { setSelectedDate(null); openQuickAdd(selectedDate); }}
            onOpenQuest={(id) => { setSelectedDate(null); openQuest(id); }} />
        )}
      </Modal>

      <Modal open={!!questModalDate} onClose={() => setQuestModalDate(null)} title="Новый квест" maxWidth="max-w-xl">
        {questModalDate && (
          <QuestForm initial={{ deadline: questModalDate }} spheres={state.spheres} people={activePeople(state.people)} campaigns={(state.campaigns||[]).filter(c=>c.status!=="archived")}
            onSubmit={(q) => { actions.addQuest(q); setQuestModalDate(null); }} onCancel={() => setQuestModalDate(null)} />
        )}
      </Modal>

      {/* Прямой доступ к конкретному квесту отовсюду в Календаре (точки Месяца, строки Недели/
          Повестки/Канбана/окна дня) — тот же QuestCard, что на вкладке "Квесты", со всеми
          действиями сразу, без обхода через день (это и была жалоба: Канбан вёл в окно дня, а
          не к самому квесту, и для карточек без даты там вообще некуда было вести). */}
      <Modal open={!!selectedQuestId} onClose={() => setSelectedQuestId(null)} title="Квест" maxWidth="max-w-xl">
        {selectedQuest && (
          <QuestCard quest={selectedQuest} sphere={questMainSphere(state.spheres, selectedQuest)} defaultExpanded
            campaign={selectedQuest.campaignId ? (state.campaigns||[]).find(c => c.id===selectedQuest.campaignId) : null}
            onComplete={() => actions.completeQuest(selectedQuest.id)}
            onFail={() => actions.failQuest(selectedQuest.id)}
            onReopen={() => actions.reopenQuest(selectedQuest.id)}
            onEdit={() => { setEditingQuest(selectedQuest); setSelectedQuestId(null); }}
            onDelete={() => { actions.deleteQuest(selectedQuest.id); setSelectedQuestId(null); }}
            onToggleSubtask={(subId) => actions.toggleSubtask(selectedQuest.id, subId)}
          />
        )}
      </Modal>

      <Modal open={!!editingQuest} onClose={() => setEditingQuest(null)} title="Редактировать квест" maxWidth="max-w-xl">
        {editingQuest && (
          <QuestForm initial={editingQuest} spheres={state.spheres} people={activePeople(state.people)} campaigns={(state.campaigns||[]).filter(c=>c.status!=="archived")}
            onSubmit={(data) => { actions.updateQuest(editingQuest.id, data); setEditingQuest(null); }}
            onCancel={() => setEditingQuest(null)} />
        )}
      </Modal>
    </div>
  );
}
