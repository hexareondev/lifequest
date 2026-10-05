// Интерфейс квестов и кампаний: журнал, карточка и форма квеста, этапы, предпросмотр плана.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Archive, ArchiveRestore, Calendar, Check, CheckSquare, ChevronDown, ChevronLeft,
  Coins, Copy, Download, FileJson, Flag, Flame, ListPlus, Milestone, Pencil, Plus, ScrollText,
  Search, Sparkles, Trash2, Upload, Users, X,
} from "lucide-react";
import { addDaysStr, clamp, daysBetween, todayStr, uid } from "../core/basics.js";
import { copyTextToClipboard, downloadTextFile } from "../core/download.js";
import { fmtDateShort, pluralRu } from "../core/format.js";
import { defaultQuestsPrefs } from "../core/prefs.js";
import { DIFFICULTY, PRIORITY } from "../core/rules.js";
import { levelFromXp } from "../core/xp.js";
import {
  amountToNextTier, computeStreak, linkedHabitPeriodStats, linkedHabitProgress, tierLabel,
} from "../habits/model.js";
import {
  buildAiPlanGuide, buildCampaignExport, buildCampaignImport, campaignDraftSummary,
  parseCampaignPayload,
} from "../import/campaign-plan.jsx";
import { planUnitOffsetOf, resolvePlanDate } from "../import/plan-dates.js";
import { QuickAddButtons } from "../library/ui.jsx";
import { activePeople } from "../people/model.js";
import { workoutSetStats } from "../sport/model.js";
import {
  Button, Card, EmptyState, KebabMenu, Modal, Pips, ProgressBar, SectionHeader, StickyAddButton,
  inputCls, labelCls,
} from "../ui/atoms.jsx";
import { IconFor } from "../ui/icons.js";
import { ColorPicker, IconPicker } from "../ui/pickers.jsx";
import { pal } from "../ui/theme.js";
import {
  CAMPAIGN_DEFAULT_PERCENT, CAMPAIGN_MAX_STAGES, campaignFinalReward, campaignNextQuest,
  campaignQuestsOf, campaignStageStats, campaignStats, defaultCampaignReward,
} from "./campaigns.js";
import { questMainSphere, questPersonIds, questSphereIds, questTouchesSphere } from "./links.js";
import { QuestRow } from "./quest-row.jsx";
import { QUEST_SORTS, reorderCampaignQuests, sortByUrgency } from "./sorting.js";
import {
  QUEST_MAX_SPAN_DAYS, isMultiDayQuest, normalizeQuestDates, questDateLabel, questDayIndex,
  questSpanTotal,
} from "./spans.js";


// defaultExpanded — для случая «квест открыт в отдельном окне»: там он один, и прятать от
// человека состав подзадач за лишним кликом незачем.
export function QuestCard({ quest, sphere, campaign, onOpenCampaign, defaultExpanded, onComplete, onFail, onReopen, onEdit, onDelete, onToggleSubtask }) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const d = DIFFICULTY[quest.difficulty] || DIFFICULTY.easy;
  const p = PRIORITY[quest.priority] || PRIORITY.medium;
  const c = pal(sphere && sphere.color);
  const pc = pal(p.color);
  const overdue = quest.deadline && quest.deadline < todayStr() && quest.status === "active";
  const subtasks = quest.subtasks || [];
  const doneSubtasks = subtasks.filter(s => s.done).length;
  // Положение во времени у мультидневного квеста: не прогресс выполнения (его знает только
  // человек), а сколько срока уже съедено. Показывается только пока квест идёт.
  const spanTotal = questSpanTotal(quest);
  const spanDay = isMultiDayQuest(quest) && quest.status === "active" ? questDayIndex(quest, todayStr()) : null;
  const cc = campaign ? pal(campaign.color || (sphere && sphere.color)) : null;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: c.hex, minHeight: 24 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`text-sm font-semibold break-words ${quest.status==="done" ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{quest.title}</div>
              {quest.description && <div className="text-xs text-zinc-500 mt-1">{quest.description}</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onEdit} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"><Pencil className="w-3.5 h-3.5"/></button>
              <button onClick={onDelete} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${c.bgSoft} ${c.text}`}>{sphere ? sphere.name : "Без сферы"}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${pc.bgSoft} ${pc.text}`}>{p.label}</span>
            {questPersonIds(quest).length > 0 && quest.personName && <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 flex items-center gap-1"><Users className="w-3 h-3"/>{quest.personName}</span>}
            {campaign && (
              <button onClick={onOpenCampaign} disabled={!onOpenCampaign}
                className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${cc.bgSoft} ${cc.text} ${onOpenCampaign ? "hover:opacity-80" : ""}`}>
                <Flag className="w-3 h-3"/>{campaign.title}
              </button>
            )}
            <Pips count={d.pips} />
            {quest.deadline && <span className={`text-xs font-data flex items-center gap-1 ${overdue ? "text-red-400" : "text-zinc-500"}`}><Calendar className="w-3 h-3"/>{questDateLabel(quest)}</span>}
            {subtasks.length > 0 && (
              <button onClick={() => setExpanded(v => !v)} className="text-xs font-data text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                <ListPlus className="w-3 h-3"/>{doneSubtasks}/{subtasks.length}
                <ChevronDown className="w-3 h-3 transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "none" }}/>
              </button>
            )}
            <span className="text-xs font-data text-amber-300 flex items-center gap-1 ml-auto"><Sparkles className="w-3 h-3"/>{quest.rewardXp}<Coins className="w-3 h-3 ml-1"/>{quest.rewardGold}</span>
          </div>
          {spanDay && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[10px] font-data text-zinc-600 mb-1">
                <span>День {spanDay} из {spanTotal}</span>
                <span>{questDateLabel(quest)}</span>
              </div>
              <ProgressBar value={spanDay/spanTotal} colorClass={overdue ? "bg-red-500" : "bg-zinc-600"} heightClass="h-1" />
            </div>
          )}
          {expanded && subtasks.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3">
              {/* Отмечает выполнение только квадратик: если кликабельна вся строка, текст
                  подзадачи невозможно выделить и скопировать. */}
              {subtasks.map(st => (
                <div key={st.id} className="w-full flex items-center gap-2 text-left">
                  <button onClick={() => onToggleSubtask(st.id)} title={st.done ? "Снять отметку" : "Отметить выполненной"}
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${st.done ? "bg-amber-500 border-amber-500" : "border-zinc-600 hover:border-zinc-400"}`}>
                    {st.done && <Check className="w-3 h-3 text-zinc-950"/>}
                  </button>
                  <span className={`text-xs select-text ${st.done ? "text-zinc-500 line-through" : "text-zinc-300"}`}>{st.text}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-3">
            {quest.status === "active" && (
              <>
                <Button size="sm" onClick={onComplete}>Завершить</Button>
                <Button size="sm" variant="ghost" onClick={onFail}>Провалить</Button>
              </>
            )}
            {quest.status === "done" && <span className="text-xs text-emerald-400 flex items-center gap-1"><Check className="w-3.5 h-3.5"/>Выполнено{quest.completedAt ? " " + fmtDateShort(quest.completedAt) : ""}</span>}
            {quest.status === "failed" && (
              <>
                <span className="text-xs text-red-400 flex items-center gap-1"><X className="w-3.5 h-3.5"/>Провалено</span>
                <Button size="sm" variant="ghost" onClick={onReopen}>Вернуть в работу</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// Чипы, а не список с Ctrl-кликом: множественный выбор в <select multiple> на телефоне почти
// неработоспособен, а тут он нужен именно на телефоне.
//
// В свёрнутом виде показывается несколько строк, и ОТМЕЧЕННЫЕ идут первыми: при полусотне людей
// иначе пришлось бы разворачивать список каждый раз, когда нужно снять одну привязку. В
// развёрнутом порядок исходный — там важнее предсказуемое место каждого элемента.
const CHIP_ROW_PX = 32;

function MultiChipPicker({ items, selected, onToggle, empty, rows = 1 }) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const boxRef = useRef(null);
  // Переполнение измеряется, а не угадывается по числу элементов: длина названий разная, и любая
  // прикидка однажды спрячет последний чип, не показав кнопку «ещё».
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 1);
  });

  if (!items.length) return <div className="text-xs text-zinc-600">{empty}</div>;

  const ordered = open
    ? items
    : [...selected.map(id => items.find(i => i.id === id)).filter(Boolean),
       ...items.filter(i => !selected.includes(i.id))];

  return (
    <div className="space-y-1.5">
      <div ref={boxRef} className="flex flex-wrap gap-1.5 overflow-hidden"
        style={open ? undefined : { maxHeight: rows * CHIP_ROW_PX - 6 }}>
        {ordered.map(it => {
          const on = selected.includes(it.id);
          return (
            <button key={it.id} type="button" onClick={() => onToggle(it.id)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition ${on ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500 hover:text-zinc-300"}`}>
              {it.name}
            </button>
          );
        })}
      </div>
      {(open || overflows) && (
        <button type="button" onClick={() => setOpen(v => !v)} className="text-[11px] text-zinc-500 hover:text-zinc-300">
          {open ? "Свернуть" : `Показать все (${items.length})`}
        </button>
      )}
    </div>
  );
}

export function QuestForm({ initial, spheres, people, campaigns, onSubmit, onCancel }) {
  const [title, setTitle] = useState((initial && initial.title) || "");
  const [description, setDescription] = useState((initial && initial.description) || "");
  // Первая сфера в списке — главная: от неё берутся цвет и значок карточки. Поэтому порядок
  // отметок сохраняется, а не пересортировывается под порядок сфер в настройках.
  const [sphereIds, setSphereIds] = useState(() => {
    const from = questSphereIds(initial);
    return from.length ? from : (spheres[0] ? [spheres[0].id] : []);
  });
  const [personIds, setPersonIds] = useState(() => questPersonIds(initial));
  const [priority, setPriority] = useState((initial && initial.priority) || "medium");
  const [difficulty, setDifficulty] = useState((initial && initial.difficulty) || "medium");
  const [manualReward, setManualReward] = useState(!!(initial && initial.manualReward));
  const [rewardXp, setRewardXp] = useState((initial && initial.rewardXp) ?? DIFFICULTY.medium.xp);
  const [rewardGold, setRewardGold] = useState((initial && initial.rewardGold) ?? DIFFICULTY.medium.gold);
  const [deadline, setDeadline] = useState((initial && initial.deadline) || "");
  const [startDate, setStartDate] = useState((initial && initial.startDate) || "");
  const [multiDay, setMultiDay] = useState(!!(initial && initial.startDate));
  const [campaignId, setCampaignId] = useState((initial && initial.campaignId) || "");
  const [stageId, setStageId] = useState((initial && initial.stageId) || "");
  const [subtasks, setSubtasks] = useState((initial && initial.subtasks) || []);
  const [subtaskDraft, setSubtaskDraft] = useState("");

  const campaignList = campaigns || [];
  const campaign = campaignId ? campaignList.find(c => c.id===campaignId) : null;
  // Этап всегда должен принадлежать выбранной кампании — иначе после смены кампании квест уехал
  // бы в чужой этап. Тот же приём, что у нормализации счёта-получателя в форме перевода.
  useEffect(() => {
    if (!campaign) { if (stageId) setStageId(""); return; }
    if (stageId && !(campaign.stages||[]).some(st => st.id===stageId)) setStageId("");
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Диапазон дат: включение галочки предзаполняет начало текущим сроком (или сегодняшним днём,
  // если срока ещё нет), выключение — снимает начало, не трогая срок.
  function toggleMultiDay(on) {
    setMultiDay(on);
    if (on) { if (!deadline) setDeadline(todayStr()); setStartDate(deadline || todayStr()); }
    else setStartDate("");
  }
  const spanDays = multiDay && startDate && deadline && startDate <= deadline ? daysBetween(startDate, deadline)+1 : 0;
  const datesInvalid = multiDay && startDate && deadline && startDate > deadline;
  const spanTooLong = spanDays > QUEST_MAX_SPAN_DAYS;

  useEffect(() => {
    if (!manualReward) { const d = DIFFICULTY[difficulty]; setRewardXp(d.xp); setRewardGold(d.gold); }
  }, [difficulty, manualReward]);

  function addSubtask() {
    if (!subtaskDraft.trim()) return;
    setSubtasks(list => [...list, { id: uid(), text: subtaskDraft.trim(), done:false }]);
    setSubtaskDraft("");
  }
  function removeSubtask(id) { setSubtasks(list => list.filter(s => s.id!==id)); }
  function submit() {
    if (!title.trim() || datesInvalid || spanTooLong) return;
    const personNames = personIds.map(id => ((people||[]).find(p => p.id===id) || {}).name).filter(Boolean);
    const dates = normalizeQuestDates(multiDay ? (startDate || null) : null, deadline || null);
    onSubmit({
      title: title.trim(), description: description.trim(), sphereIds, priority, difficulty, manualReward,
      rewardXp: Number(rewardXp)||0, rewardGold: Number(rewardGold)||0,
      startDate: dates.startDate, deadline: dates.deadline,
      personIds,
      // Имя первого связанного человека хранится рядом для подписи в карточке — иначе ради одной
      // строки пришлось бы тащить в неё весь список людей.
      personName: personNames[0] || null,
      campaignId: campaignId || null, stageId: campaignId ? (stageId || null) : null,
      subtasks,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название квеста</label>
        <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: Подготовить презентацию" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Описание (необязательно)</label>
        <textarea className={inputCls} rows={2} value={description} onChange={e=>setDescription(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Сферы жизни</label>
        <MultiChipPicker items={spheres} selected={sphereIds} empty="Сфер пока нет" rows={2}
          onToggle={(id) => setSphereIds(l => l.includes(id) ? l.filter(x => x !== id) : [...l, id])} />
        {sphereIds.length > 1 && (
          <div className="text-[11px] text-zinc-600 mt-1.5">
            Награда достанется каждой отмеченной сфере целиком. Цвет карточки — по первой отмеченной.
          </div>
        )}
      </div>

      {/* Пока дата одна — она на всю ширину; появляется вторая — обе делят строку поровну.
          Подписи под ними общие и относятся к диапазону, поэтому вынесены из колонок. */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className={labelCls} style={{ marginBottom:0 }}>{multiDay ? "Даты" : "Срок"}</span>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={multiDay} onChange={e=>toggleMultiDay(e.target.checked)} />
            Несколько дней
          </label>
        </div>
        <div className={multiDay ? "grid grid-cols-2 gap-3" : ""}>
          {multiDay && (
            <div>
              <div className="text-[11px] text-zinc-600 mb-1">Начало</div>
              <input type="date" className={inputCls} value={startDate||""} onChange={e=>setStartDate(e.target.value)} />
            </div>
          )}
          <div>
            {multiDay && <div className="text-[11px] text-zinc-600 mb-1">Окончание</div>}
            <input type="date" className={inputCls} value={deadline||""} onChange={e=>setDeadline(e.target.value)} />
          </div>
        </div>
        {multiDay && datesInvalid && <div className="text-xs text-red-400 mt-1.5">Начало позже окончания.</div>}
        {multiDay && spanTooLong && <div className="text-xs text-red-400 mt-1.5">Слишком длинный диапазон — максимум {QUEST_MAX_SPAN_DAYS} дней.</div>}
        {multiDay && !datesInvalid && !spanTooLong && spanDays > 0 && (
          <div className="text-xs text-zinc-600 mt-1.5">{spanDays} {pluralRu(spanDays,"день","дня","дней")} подряд — квест займёт весь диапазон в календаре.</div>
        )}
      </div>
      {/* Этап без кампании выбирать не из чего — пустой отключённый список только занимал место
          и сбивал с толку. Появляется вместе с кампанией, вторым столбцом. */}
      {campaignList.length > 0 && (
        <div className={campaign && (campaign.stages||[]).length ? "grid grid-cols-2 gap-3" : ""}>
          <div>
            <label className={labelCls}>Кампания (необязательно)</label>
            <select className={inputCls} value={campaignId} onChange={e=>setCampaignId(e.target.value)}>
              <option value="">Не привязано</option>
              {campaignList.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          {campaign && (campaign.stages||[]).length > 0 && (
            <div>
              <label className={labelCls}>Этап</label>
              <select className={inputCls} value={stageId} onChange={e=>setStageId(e.target.value)}>
                <option value="">Без этапа</option>
                {(campaign.stages||[]).map(st => <option key={st.id} value={st.id}>{st.title}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      <div>
        <label className={labelCls}>Люди (необязательно)</label>
        <MultiChipPicker items={people || []} selected={personIds} empty="Людей пока нет"
          onToggle={(id) => setPersonIds(l => l.includes(id) ? l.filter(x => x !== id) : [...l, id])} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Приоритет</label>
          <select className={inputCls} value={priority} onChange={e=>setPriority(e.target.value)}>
            {Object.entries(PRIORITY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Сложность</label>
          <select className={inputCls} value={difficulty} onChange={e=>setDifficulty(e.target.value)}>
            {Object.entries(DIFFICULTY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className={labelCls} style={{ marginBottom:0 }}>Награда</span>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={manualReward} onChange={e=>setManualReward(e.target.checked)} />
            Своя награда
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <Sparkles className="w-4 h-4 text-amber-400 absolute" style={{ left:12, top:"50%", transform:"translateY(-50%)" }} />
            <input type="number" min="0" disabled={!manualReward} className={inputCls + " disabled:opacity-60"} style={{ paddingLeft:36 }} value={rewardXp} onChange={e=>setRewardXp(e.target.value)} />
          </div>
          <div className="relative">
            <Coins className="w-4 h-4 text-amber-400 absolute" style={{ left:12, top:"50%", transform:"translateY(-50%)" }} />
            <input type="number" min="0" disabled={!manualReward} className={inputCls + " disabled:opacity-60"} style={{ paddingLeft:36 }} value={rewardGold} onChange={e=>setRewardGold(e.target.value)} />
          </div>
        </div>
      </div>
      <div>
        <label className={labelCls}>Подзадачи</label>
        <div className="space-y-1.5 mb-2">
          {subtasks.map(s => (
            <div key={s.id} className="flex items-center gap-2 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-1.5">
              <span className="text-xs text-zinc-300 flex-1">{s.text}</span>
              <button onClick={() => removeSubtask(s.id)} className="text-zinc-600 hover:text-red-400"><X className="w-3.5 h-3.5"/></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls} value={subtaskDraft} onChange={e=>setSubtaskDraft(e.target.value)} onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); addSubtask(); } }} placeholder="Добавить пункт..." />
          <Button variant="secondary" onClick={addSubtask}><Plus className="w-4 h-4"/></Button>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        {/* initial используется и для предзаполнения нового квеста (кампания/сфера из кебаба
            кампании), поэтому «редактирование» определяется наличием id, а не самого initial. */}
        <Button onClick={submit} disabled={!title.trim() || datesInvalid || spanTooLong}>{initial && initial.id ? "Сохранить" : "Создать квест"}</Button>
      </div>
    </div>
  );
}
function CampaignForm({ initial, spheres, people, onSubmit, onCancel }) {
  const [title, setTitle] = useState((initial && initial.title) || "");
  const [description, setDescription] = useState((initial && initial.description) || "");
  const [sphereId, setSphereId] = useState((initial && initial.sphereId) || (spheres[0] && spheres[0].id) || "");
  const [personId, setPersonId] = useState((initial && initial.personId) || "");
  const [color, setColor] = useState((initial && initial.color) || (spheres.find(s=>s.id===((initial && initial.sphereId) || (spheres[0]||{}).id))||{}).color || "amber");
  const r = (initial && initial.reward) || defaultCampaignReward();
  const [rewardMode, setRewardMode] = useState(r.mode || "auto");
  const [percent, setPercent] = useState(r.percent != null ? r.percent : CAMPAIGN_DEFAULT_PERCENT);
  const [rewardXp, setRewardXp] = useState(r.xp || 0);
  const [rewardGold, setRewardGold] = useState(r.gold || 0);
  const [stages, setStages] = useState(((initial && initial.stages) || []).map(st => ({ ...st })));
  const [stageDraft, setStageDraft] = useState("");

  function addStage() {
    if (!stageDraft.trim()) return;
    if (stages.length >= CAMPAIGN_MAX_STAGES) return;
    setStages(list => [...list, { id: uid(), title: stageDraft.trim(), description: "", order: list.length }]);
    setStageDraft("");
  }
  function submit() {
    if (!title.trim()) return;
    const person = personId ? (people||[]).find(p => p.id===personId) : null;
    onSubmit({
      title: title.trim(), description: description.trim(), sphereId, color,
      personId: person ? person.id : null, personName: person ? person.name : null,
      stages: stages.map((st,i) => ({ ...st, order:i })),
      reward: {
        ...defaultCampaignReward(),
        ...(initial && initial.reward),
        mode: rewardMode,
        percent: clamp(Number(percent)||0, 0, 100),
        xp: rewardMode==="manual" ? Math.max(0, Number(rewardXp)||0) : null,
        gold: rewardMode==="manual" ? Math.max(0, Number(rewardGold)||0) : null,
      },
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название кампании</label>
        <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: Разработка игры" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Описание (необязательно)</label>
        <textarea className={inputCls} rows={2} value={description} onChange={e=>setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Сфера жизни</label>
          <select className={inputCls} value={sphereId} onChange={e=>setSphereId(e.target.value)}>
            {spheres.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Человек (необязательно)</label>
          <select className={inputCls} value={personId} onChange={e=>setPersonId(e.target.value)}>
            <option value="">Не привязано</option>
            {(people||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Цвет</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className={labelCls} style={{ marginBottom:0 }}>Награда за завершение</span>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={rewardMode==="manual"} onChange={e=>setRewardMode(e.target.checked ? "manual" : "auto")} />
            Своя награда
          </label>
        </div>
        {rewardMode === "auto" ? (
          <div>
            <div className="flex items-center gap-3">
              <input type="number" min="0" max="100" className={inputCls} style={{ width:100 }} value={percent} onChange={e=>setPercent(e.target.value)} />
              <span className="text-xs text-zinc-500">% от суммы наград квестов кампании</span>
            </div>
            <div className="text-xs text-zinc-600 mt-1.5">Итог пересчитывается сам: добавили квестов — награда за финал выросла.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Sparkles className="w-4 h-4 text-amber-400 absolute" style={{ left:12, top:"50%", transform:"translateY(-50%)" }} />
              <input type="number" min="0" className={inputCls} style={{ paddingLeft:36 }} value={rewardXp} onChange={e=>setRewardXp(e.target.value)} />
            </div>
            <div className="relative">
              <Coins className="w-4 h-4 text-amber-400 absolute" style={{ left:12, top:"50%", transform:"translateY(-50%)" }} />
              <input type="number" min="0" className={inputCls} style={{ paddingLeft:36 }} value={rewardGold} onChange={e=>setRewardGold(e.target.value)} />
            </div>
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>Этапы (необязательно)</label>
        <div className="space-y-1.5 mb-2">
          {stages.map((st, i) => (
            <div key={st.id} className="flex items-center gap-2 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-1.5">
              <Milestone className="w-3.5 h-3.5 text-zinc-600 shrink-0"/>
              <input className="flex-1 bg-transparent text-xs text-zinc-200 focus:outline-none" value={st.title}
                onChange={e=>setStages(list => list.map((x,j) => j===i ? { ...x, title:e.target.value } : x))} />
              <button onClick={() => setStages(list => list.filter((_,j) => j!==i))} className="text-zinc-600 hover:text-red-400"><X className="w-3.5 h-3.5"/></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls} value={stageDraft} onChange={e=>setStageDraft(e.target.value)}
            onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); addStage(); } }} placeholder="Название этапа..." />
          <Button variant="secondary" onClick={addStage}><Plus className="w-4 h-4"/></Button>
        </div>
        <div className="text-xs text-zinc-600 mt-1.5">Этапы только группируют квесты и показывают свой прогресс — собственной награды у них нет.</div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit} disabled={!title.trim()}>{initial ? "Сохранить" : "Создать кампанию"}</Button>
      </div>
    </div>
  );
}

// Карточка кампании: прогресс, сроки, ближайший шаг, награда, кебаб и разворачиваемый состав.
// Состояние разворота живёт снаружи (в QuestsView), чтобы не сбрасывалось при перерисовке списка.
function CampaignCard({ campaign, state, actions, expanded, onToggleExpand, onEdit, onAddQuest, onExport, onOpenQuest }) {
  const quests = campaignQuestsOf(state.quests, campaign.id);
  const stats = campaignStats(state.quests, campaign);
  const reward = campaignFinalReward(state.quests, campaign);
  const next = campaignNextQuest(state.quests, campaign.id);
  const sphere = state.spheres.find(sp => sp.id===campaign.sphereId);
  const c = pal(campaign.color || (sphere && sphere.color));
  const failed = quests.filter(q => q.status==="failed");
  const archived = campaign.status === "archived";
  const done = campaign.status === "done";

  const stageGroups = [
    ...(campaign.stages||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0)).map(st => ({ id:st.id, title:st.title, quests: quests.filter(q => q.stageId===st.id) })),
    { id:"__none__", title: (campaign.stages||[]).length ? "Без этапа" : "", quests: quests.filter(q => !q.stageId) },
  ].filter(g => g.quests.length);

  const menuItems = [
    { icon: Pencil, label: "Редактировать", onClick: onEdit },
    { icon: Plus, label: "Добавить квест", onClick: onAddQuest },
    { icon: Download, label: "Выгрузить план", onClick: onExport },
    { divider: true },
    ...(campaign.claimedFinal ? [{ icon: Sparkles, label: "Разрешить награду снова", onClick: () => actions.resetCampaignClaim(campaign.id) }] : []),
    { icon: archived ? ArchiveRestore : Archive, label: archived ? "Вернуть из архива" : "В архив", onClick: () => actions.archiveCampaign(campaign.id, !archived) },
    { divider: true },
    { icon: Trash2, label: "Удалить кампанию", onClick: () => actions.deleteCampaign(campaign.id, false), danger: true },
    { icon: Trash2, label: "Удалить вместе с квестами", onClick: () => actions.deleteCampaign(campaign.id, true), danger: true },
  ];

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: c.hex, minHeight: 24 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <button onClick={onToggleExpand} className="min-w-0 text-left flex-1">
              <div className={`text-sm font-semibold break-words flex items-center gap-2 ${done ? "text-zinc-400" : "text-zinc-100"}`}>
                {done && <Check className="w-4 h-4 text-emerald-400 shrink-0"/>}
                {campaign.title}
                <ChevronDown className="w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "none" }}/>
              </div>
              {campaign.description && <div className="text-xs text-zinc-500 mt-1">{campaign.description}</div>}
            </button>
            <KebabMenu items={menuItems} />
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${c.bgSoft} ${c.text}`}>{sphere ? sphere.name : "Без сферы"}</span>
            {campaign.personName && <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 flex items-center gap-1"><Users className="w-3 h-3"/>{campaign.personName}</span>}
            {campaign.source==="import" && <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 flex items-center gap-1"><FileJson className="w-3 h-3"/>импорт</span>}
            {archived && <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">в архиве</span>}
            <span className={`text-xs font-data flex items-center gap-1 ml-auto ${campaign.claimedFinal ? "text-emerald-400" : "text-amber-300"}`}>
              {campaign.claimedFinal && <Check className="w-3 h-3"/>}
              <Sparkles className="w-3 h-3"/>{campaign.claimedFinal ? (campaign.reward.grantedXp ?? reward.xp) : reward.xp}
              <Coins className="w-3 h-3 ml-1"/>{campaign.claimedFinal ? (campaign.reward.grantedGold ?? reward.gold) : reward.gold}
            </span>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs font-data text-zinc-500 mb-1">
              <span>{stats.done}/{stats.total} {pluralRu(stats.total,"квест","квеста","квестов")}</span>
              {stats.startDate && <span>{fmtDateShort(stats.startDate)} → {fmtDateShort(stats.endDate)} · {stats.days} {pluralRu(stats.days,"день","дня","дней")}</span>}
            </div>
            <ProgressBar value={stats.progress} colorClass={done ? "bg-emerald-500" : c.bgSolid} />
          </div>

          {failed.length > 0 && (
            <div className="mt-2.5 flex items-start gap-2 text-xs text-orange-300 bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5"/>
              <span>
                {failed.length} {pluralRu(failed.length,"квест провален","квеста провалены","квестов провалены")} — кампания не закроется, пока их не выполнят или не удалят.
                {!expanded && <button onClick={onToggleExpand} className="ml-1 underline hover:text-orange-200">Показать</button>}
              </span>
            </div>
          )}

          {next && !expanded && (
            <div className="mt-2.5 text-xs text-zinc-500 truncate">
              Дальше: <span className="text-zinc-300">{next.title}</span>
              {next.deadline && <span className="font-data text-zinc-600"> · {questDateLabel(next)}</span>}
            </div>
          )}

          {expanded && (
            <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3">
              {stageGroups.length === 0 && (
                <div className="text-xs text-zinc-600">В кампании пока нет квестов. Добавьте их через кебаб или импортируйте план.</div>
              )}
              {stageGroups.map(g => {
                const st = campaignStageStats(state.quests, campaign.id, g.id==="__none__" ? null : g.id);
                return (
                  <div key={g.id}>
                    {g.title && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <Milestone className="w-3.5 h-3.5 text-zinc-600 shrink-0"/>
                        <span className="text-xs text-zinc-400 truncate flex-1">{g.title}</span>
                        <span className="text-xs font-data text-zinc-600">{st.done}/{st.total}</span>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {g.quests.map(q => (
                        <QuestRow key={q.id} quest={q} sphere={questMainSphere(state.spheres, q)}
                          onComplete={q.status==="active" ? () => actions.completeQuest(q.id) : undefined}
                          onClick={() => onOpenQuest(q.id)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// Инструкция для ИИ — персональная (реальные сферы, по желанию имена людей), см. buildAiPlanGuide.
function AiGuideModal({ open, onClose, state, onNotify }) {
  const [includePeople, setIncludePeople] = useState(false);
  const text = useMemo(() => open ? buildAiPlanGuide(state, { includePeople }) : "", [open, includePeople, state]);
  return (
    <Modal open={open} onClose={onClose} title="Инструкция для ИИ" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="text-sm text-zinc-400">
          Отдайте этот текст любому ИИ вместе с задачей («составь план разработки на шесть недель»).
          В ответ он пришлёт JSON, который загружается кнопкой «Импортировать план».
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={includePeople} onChange={e=>setIncludePeople(e.target.checked)} />
          Добавить список людей ({activePeople(state.people).length})
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => {
            const ok = downloadTextFile(text, `questlife-ai-plan-guide-${todayStr()}.md`, "text/markdown;charset=utf-8");
            onNotify && onNotify(ok ? "Инструкция скачана" : "Скачивание заблокировано — скопируйте текст ниже");
          }}><Download className="w-3.5 h-3.5"/>Скачать .md</Button>
          <Button variant="secondary" onClick={() => {
            copyTextToClipboard(text).then(ok => onNotify && onNotify(ok ? "Инструкция скопирована" : "Не удалось скопировать — выделите текст ниже"));
          }}><Copy className="w-3.5 h-3.5"/>Скопировать</Button>
        </div>
        <textarea readOnly value={text} className="w-full h-72 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-[11px] font-data text-zinc-300 lq-scroll" />
      </div>
    </Modal>
  );
}

// Экран импорта плана: разбор файла, затем полноценная правка перед добавлением.
// Ключевое здесь — не «предпросмотр», а именно редактор: план от ИИ почти всегда хочется
// подвинуть по датам, что-то выкинуть и что-то переименовать ДО того, как он расползётся
// по календарю сорока квестами.
function CampaignImportModal({ open, onClose, state, onImport, onNotify }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState("");
  const [collapsedStages, setCollapsedStages] = useState([]);
  const [openQuestId, setOpenQuestId] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setText(""); setDraft(null); setWarnings([]); setError(""); setCollapsedStages([]); setOpenQuestId(null);
  }, [open]);

  function handleText(value) {
    setText(value);
    if (!value.trim()) { setDraft(null); setWarnings([]); setError(""); return; }
    const res = parseCampaignPayload(value, { spheres: state.spheres, people: activePeople(state.people), today: todayStr() });
    if (res.ok) { setDraft(res.draft); setWarnings(res.warnings || []); setError(""); }
    else { setDraft(null); setWarnings([]); setError(res.error); }
  }
  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleText(String(reader.result || ""));
    reader.onerror = () => setError("Не удалось прочитать файл.");
    reader.readAsText(file);
  }

  function patchDraft(patch) { setDraft(d => d ? { ...d, ...patch } : d); }
  function patchQuest(stageId, questId, patch) {
    setDraft(d => ({ ...d, stages: d.stages.map(st => st.id!==stageId ? st : {
      ...st, quests: st.quests.map(q => q.id!==questId ? q : { ...q, ...patch }),
    })}));
  }
  function changeDifficulty(stageId, q, difficulty) {
    // Награда пересчитывается только у квестов на авто-награде — вручную выставленную не трогаем.
    const patch = q.manualReward ? { difficulty } : { difficulty, rewardXp: DIFFICULTY[difficulty].xp, rewardGold: DIFFICULTY[difficulty].gold };
    patchQuest(stageId, q.id, patch);
  }
  function toggleStage(stageId, on) {
    setDraft(d => ({ ...d, stages: d.stages.map(st => st.id!==stageId ? st : { ...st, quests: st.quests.map(q => ({ ...q, include:on })) }) }));
  }

  const summary = draft ? campaignDraftSummary(draft) : null;

  function apply() {
    if (!draft || !summary.count) return;
    const built = buildCampaignImport(draft);
    onImport(built.campaign, built.quests);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Импорт плана кампании" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {!draft && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <input ref={fileRef} type="file" accept="application/json,.json,.txt" onChange={handleFile} className="hidden" />
              <Button variant="secondary" onClick={() => fileRef.current && fileRef.current.click()}><Upload className="w-3.5 h-3.5"/>Выбрать файл…</Button>
              <span className="text-xs text-zinc-600">или вставьте ответ ИИ ниже — обёртка ```json снимется сама</span>
            </div>
            <textarea value={text} onChange={e=>handleText(e.target.value)} placeholder="Вставьте JSON плана…"
              className="w-full h-40 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-[11px] font-data text-zinc-300 lq-scroll" />
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-sm text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/><span>{error}</span>
              </div>
            )}
          </>
        )}

        {draft && (
          <>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Название кампании</label>
                <input className={inputCls} value={draft.title} onChange={e=>patchDraft({ title:e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Сфера</label>
                  <select className={inputCls} value={draft.sphereId||""} onChange={e=>patchDraft({ sphereId:e.target.value })}>
                    {state.spheres.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Человек</label>
                  <select className={inputCls} value={draft.personId||""} onChange={e=>{
                    const p = (state.people||[]).find(x=>x.id===e.target.value);
                    patchDraft({ personId: p ? p.id : null, personName: p ? p.name : null });
                  }}>
                    <option value="">Не привязано</option>
                    {activePeople(state.people).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Награда за финал</label>
                  {draft.rewardMode === "auto" ? (
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" max="100" className={inputCls} style={{ width:80 }} value={draft.rewardPercent}
                        onChange={e=>patchDraft({ rewardPercent: clamp(Math.round(Number(e.target.value)||0), 0, 100) })} />
                      <span className="text-xs text-zinc-500">% от квестов</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" className={inputCls} style={{ width:80 }} value={draft.rewardXp} onChange={e=>patchDraft({ rewardXp: Math.max(0, Number(e.target.value)||0) })} />
                      <input type="number" min="0" className={inputCls} style={{ width:80 }} value={draft.rewardGold} onChange={e=>patchDraft({ rewardGold: Math.max(0, Number(e.target.value)||0) })} />
                      <button className="text-xs text-zinc-500 hover:text-zinc-300 underline" onClick={()=>patchDraft({ rewardMode:"auto" })}>%</button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-end gap-3 flex-wrap p-3 rounded-xl border border-zinc-800 bg-zinc-950/40">
                <div>
                  <label className={labelCls}>Дата старта плана</label>
                  <input type="date" className={inputCls} value={draft.startDate} onChange={e=>{ if (e.target.value) patchDraft({ startDate:e.target.value }); }} />
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer pb-2">
                  <input type="checkbox" checked={draft.skipWeekends} onChange={e=>patchDraft({ skipWeekends:e.target.checked })} />
                  Пропускать выходные
                </label>
                <div className="text-xs text-zinc-600 flex-1 min-w-[220px] pb-1.5">
                  План двигается целиком: относительные интервалы между квестами сохраняются.
                </div>
              </div>
            </div>

            <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1 lq-scroll">
              {draft.stages.map(st => {
                const collapsed = collapsedStages.includes(st.id);
                const allOn = st.quests.every(q => q.include);
                return (
                  <div key={st.id} className="rounded-xl border border-zinc-800">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
                      <button onClick={() => toggleStage(st.id, !allOn)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${allOn ? "bg-amber-500 border-transparent" : "border-zinc-600"}`}>
                        {allOn && <Check className="w-3 h-3 text-zinc-950"/>}
                      </button>
                      <button onClick={() => setCollapsedStages(list => collapsed ? list.filter(x=>x!==st.id) : [...list, st.id])}
                        className="flex-1 text-left flex items-center gap-2 min-w-0">
                        <span className="text-sm text-zinc-200 truncate">{st.title || "Без этапа"}</span>
                        <span className="text-xs font-data text-zinc-600">{st.quests.filter(q=>q.include).length}/{st.quests.length}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-600 transition-transform" style={{ transform: collapsed ? "rotate(-90deg)" : "none" }}/>
                      </button>
                    </div>
                    {!collapsed && (
                      <div className="p-2 space-y-1.5">
                        {st.quests.map(q => {
                          const date = resolvePlanDate(draft.startDate, q.unitOffset, draft.skipWeekends);
                          const isOpen = openQuestId === q.id;
                          return (
                            <div key={q.id} className={`rounded-lg border ${q.include ? "border-zinc-800" : "border-zinc-900 opacity-50"}`}>
                              <div className="flex items-center gap-2 px-2 py-1.5 flex-wrap">
                                <button onClick={() => patchQuest(st.id, q.id, { include: !q.include })}
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${q.include ? "bg-amber-500 border-transparent" : "border-zinc-600"}`}>
                                  {q.include && <Check className="w-3 h-3 text-zinc-950"/>}
                                </button>
                                <input className="flex-1 min-w-[140px] bg-transparent text-sm text-zinc-200 focus:outline-none"
                                  value={q.title} onChange={e=>patchQuest(st.id, q.id, { title:e.target.value })} />
                                <input type="date" className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300 shrink-0"
                                  value={date || ""}
                                  onChange={e=>patchQuest(st.id, q.id, { unitOffset: e.target.value ? planUnitOffsetOf(draft.startDate, e.target.value, draft.skipWeekends) : null })} />
                                <div className="flex items-center gap-1 shrink-0">
                                  <input type="number" min="1" max={QUEST_MAX_SPAN_DAYS} style={{ width:52 }}
                                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300"
                                    value={q.duration} onChange={e=>patchQuest(st.id, q.id, { duration: clamp(Math.round(Number(e.target.value)||1), 1, QUEST_MAX_SPAN_DAYS) })} />
                                  <span className="text-[10px] text-zinc-600">дн.</span>
                                </div>
                                <button onClick={() => setOpenQuestId(isOpen ? null : q.id)} className="text-zinc-600 hover:text-zinc-300 shrink-0">
                                  <ChevronDown className="w-4 h-4 transition-transform" style={{ transform: isOpen ? "rotate(180deg)" : "none" }}/>
                                </button>
                              </div>
                              {isOpen && (
                                <div className="px-2 pb-2 pt-1 space-y-2 border-t border-zinc-800/70">
                                  <input className={inputCls} placeholder="Описание" value={q.description} onChange={e=>patchQuest(st.id, q.id, { description:e.target.value })} />
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <select className={inputCls} value={q.difficulty} onChange={e=>changeDifficulty(st.id, q, e.target.value)}>
                                      {Object.entries(DIFFICULTY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                                    </select>
                                    <select className={inputCls} value={q.priority} onChange={e=>patchQuest(st.id, q.id, { priority:e.target.value })}>
                                      {Object.entries(PRIORITY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                                    </select>
                                    <select className={inputCls} value={q.sphereId||""} onChange={e=>patchQuest(st.id, q.id, { sphereId:e.target.value })}>
                                      {state.spheres.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                                    </select>
                                    <div className="flex items-center gap-1">
                                      <input type="number" min="0" style={{ width:60 }} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300"
                                        value={q.rewardXp} onChange={e=>patchQuest(st.id, q.id, { rewardXp: Math.max(0, Number(e.target.value)||0), manualReward:true })} />
                                      <Sparkles className="w-3 h-3 text-amber-400"/>
                                      <input type="number" min="0" style={{ width:60 }} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300"
                                        value={q.rewardGold} onChange={e=>patchQuest(st.id, q.id, { rewardGold: Math.max(0, Number(e.target.value)||0), manualReward:true })} />
                                      <Coins className="w-3 h-3 text-amber-400"/>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    {q.subtasks.map((sub, i) => (
                                      <div key={sub.id} className="flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
                                        <input className="flex-1 bg-zinc-950/60 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300"
                                          value={sub.text}
                                          onChange={e=>patchQuest(st.id, q.id, { subtasks: q.subtasks.map((x,j) => j===i ? { ...x, text:e.target.value } : x) })} />
                                        <button onClick={()=>patchQuest(st.id, q.id, { subtasks: q.subtasks.filter((_,j)=>j!==i) })} className="text-zinc-600 hover:text-red-400"><X className="w-3.5 h-3.5"/></button>
                                      </div>
                                    ))}
                                    <button onClick={()=>patchQuest(st.id, q.id, { subtasks: [...q.subtasks, { id:uid(), text:"Новый пункт", done:false }] })}
                                      className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"><Plus className="w-3 h-3"/>Подзадача</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/40 text-xs text-zinc-400 space-y-1">
              <div className="flex items-center gap-3 flex-wrap font-data">
                <span className="text-zinc-200">{summary.count} {pluralRu(summary.count,"квест","квеста","квестов")}</span>
                {summary.excluded > 0 && <span className="text-zinc-600">({summary.excluded} исключено)</span>}
                <span>{summary.subtasks} {pluralRu(summary.subtasks,"подзадача","подзадачи","подзадач")}</span>
                {summary.from && <span>{fmtDateShort(summary.from)} → {fmtDateShort(summary.to)}</span>}
                <span className="text-amber-300 flex items-center gap-1 ml-auto">
                  <Sparkles className="w-3 h-3"/>{summary.sumXp}+{summary.finalXp}
                  <Coins className="w-3 h-3 ml-1"/>{summary.sumGold}+{summary.finalGold}
                </span>
              </div>
              <div className="text-zinc-600">Второе число — награда за завершение всей кампании.</div>
            </div>

            {warnings.length > 0 && (
              <div className="p-3 rounded-xl border border-amber-500/25 bg-amber-500/5 text-xs text-amber-200/90 space-y-1">
                {warnings.map((w,i) => <div key={i} className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5"/><span>{w}</span></div>)}
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-2">
          {draft && <Button variant="ghost" onClick={() => { setDraft(null); setWarnings([]); }}>Назад к файлу</Button>}
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button disabled={!draft || !summary || !summary.count} onClick={apply}>
            Импортировать{summary && summary.count ? ` (${summary.count})` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function QuestsView({ state, actions }) {
  // Два вида одной вкладки: плоский журнал квестов и список кампаний. Переключатель —
  // полноширинный grid, тот же паттерн, что в Библиотеке и в переключателе режимов Календаря.
  // Вид, архив и список развёрнутых кампаний живут в uiPrefs, а не в локальном состоянии:
  // возвращаться к схлопнутому списку после каждой перезагрузки незачем.
  const prefs = { ...defaultQuestsPrefs(), ...((state.uiPrefs && state.uiPrefs.quests) || {}) };
  const view = prefs.view;
  const showArchived = prefs.showArchivedCampaigns;
  const expandedCampaigns = prefs.expandedCampaigns;
  const sortKey = QUEST_SORTS[prefs.sort] ? prefs.sort : "urgency";
  const setView = (v) => actions.updateQuestsPrefs({ view:v });
  const setSortKey = (v) => actions.updateQuestsPrefs({ sort:v });
  const setShowArchived = (v) => actions.updateQuestsPrefs({ showArchivedCampaigns: !!v });

  const [filter, setFilter] = useState("active");
  const [sphereFilter, setSphereFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [presetCampaign, setPresetCampaign] = useState(null); // { campaignId } — «Добавить квест» из кебаба кампании

  const [campaignModal, setCampaignModal] = useState(null); // null | { initial }
  const [importOpen, setImportOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [exportText, setExportText] = useState(null); // { title, text }
  const [focusQuestId, setFocusQuestId] = useState(null);

  const campaigns = state.campaigns || [];
  const activeCampaigns = campaigns.filter(c => c.status !== "archived");
  const shownCampaigns = showArchived ? campaigns.filter(c => c.status === "archived") : activeCampaigns;

  const counts = useMemo(() => {
    const today = todayStr();
    return {
      active: state.quests.filter(q=>q.status==="active" && !(q.deadline && q.deadline<today)).length,
      overdue: state.quests.filter(q=>q.status==="active" && q.deadline && q.deadline<today).length,
      done: state.quests.filter(q=>q.status==="done").length,
      failed: state.quests.filter(q=>q.status==="failed").length,
    };
  }, [state.quests]);

  const filtered = useMemo(() => {
    let list = state.quests.slice();
    const today = todayStr();
    if (filter === "active") list = list.filter(q => q.status==="active" && !(q.deadline && q.deadline<today));
    else if (filter === "done") list = list.filter(q => q.status==="done");
    else if (filter === "overdue") list = list.filter(q => q.status==="active" && q.deadline && q.deadline<today);
    else if (filter === "failed") list = list.filter(q => q.status==="failed");
    if (sphereFilter !== "all") list = list.filter(q => questTouchesSphere(q, sphereFilter));
    // Та же страховка, что в Календаре: удалённая кампания в фильтре не должна прятать все квесты.
    const cf = campaignFilter!=="all" && campaignFilter!=="none" && !(state.campaigns||[]).some(c => c.id===campaignFilter) ? "all" : campaignFilter;
    if (cf === "none") list = list.filter(q => !q.campaignId);
    else if (cf !== "all") list = list.filter(q => q.campaignId===cf);
    if (search.trim()) { const s = search.trim().toLowerCase(); list = list.filter(q => q.title.toLowerCase().includes(s)); }
    return reorderCampaignQuests(list.sort(QUEST_SORTS[sortKey].fn), state.campaigns, state.quests);
  }, [state.quests, state.campaigns, filter, sphereFilter, campaignFilter, search, sortKey]);

  const FILTERS = [
    { id:"active", label:`Активные (${counts.active})` },
    { id:"overdue", label:`Просроченные (${counts.overdue})` },
    { id:"done", label:`Выполненные (${counts.done})` },
    { id:"failed", label:`Провалено (${counts.failed})` },
    { id:"all", label:"Все" },
  ];

  function openCreate() { setEditing(null); setPresetCampaign(null); setModalOpen(true); }
  function openEdit(q) { setEditing(q); setPresetCampaign(null); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updateQuest(editing.id, data); else actions.addQuest(data);
    setModalOpen(false);
  }
  function openCampaignQuest(questId) {
    // Тот же приём, что в Календаре: строка кампании открывает полную карточку квеста в модалке.
    setFocusQuestId(questId);
  }
  function addQuestToCampaign(campaign) {
    setEditing(null);
    setPresetCampaign({ campaignId: campaign.id, sphereId: campaign.sphereId });
    setModalOpen(true);
  }
  function exportCampaign(campaign) {
    const payload = buildCampaignExport(campaign, state.quests, state.spheres);
    const text = JSON.stringify(payload, null, 2);
    downloadTextFile(text, `questlife-campaign-${todayStr()}.json`, "application/json");
    setExportText({ title: campaign.title, text });
  }

  const focusQuest = focusQuestId ? state.quests.find(q => q.id===focusQuestId) : null;
  // Защита от «зависшей» модалки: квест могли удалить, пока карточка была открыта.
  useEffect(() => { if (focusQuestId && !focusQuest) setFocusQuestId(null); }, [focusQuestId, focusQuest]);

  const sectionMenu = [
    { icon: Upload, label: "Импортировать план…", onClick: () => setImportOpen(true) },
    { icon: FileJson, label: "Инструкция для ИИ", onClick: () => setGuideOpen(true) },
  ];

  function campaignOf(quest) { return quest.campaignId ? campaigns.find(c => c.id===quest.campaignId) : null; }
  function focusCampaign(campaignId) {
    setView("campaigns");
    setShowArchived((campaigns.find(c=>c.id===campaignId)||{}).status === "archived");
    actions.toggleExpandedCampaign(campaignId, true);
    setFocusQuestId(null);
  }

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Журнал заданий" title="Квесты" action={<KebabMenu items={sectionMenu} />} />

      <div className="grid grid-cols-2 gap-2">
        {[{ id:"quests", label:"Квесты" }, { id:"campaigns", label:`Кампании${activeCampaigns.length ? ` (${activeCampaigns.length})` : ""}` }].map(t => (
          <button key={t.id} onClick={() => setView(t.id)}
            className={`py-2.5 rounded-xl text-xs font-medium border transition ${view===t.id ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>{t.label}</button>
        ))}
      </div>

      {view === "quests" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${filter===f.id ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "text-zinc-400 border-zinc-800 hover:border-zinc-700"}`}>{f.label}</button>
            ))}
            <div className="flex-1" />
            {campaigns.length > 0 && (
              <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={campaignFilter} onChange={e=>setCampaignFilter(e.target.value)}>
                <option value="all">Все кампании</option>
                <option value="none">Вне кампаний</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            )}
            <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={sortKey} onChange={e=>setSortKey(e.target.value)} title="Порядок квестов">
              {Object.entries(QUEST_SORTS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={sphereFilter} onChange={e=>setSphereFilter(e.target.value)}>
              <option value="all">Все сферы</option>
              {state.spheres.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-600 absolute" style={{ left:10, top:"50%", transform:"translateY(-50%)" }} />
              <input className="bg-zinc-900 border border-zinc-800 rounded-lg pr-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600" style={{ width:160, paddingLeft:30 }} placeholder="Поиск..." value={search} onChange={e=>setSearch(e.target.value)} />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={ScrollText} title="Здесь пока пусто" subtitle="Измени фильтры или создай новый квест." action={<Button size="sm" onClick={openCreate}>Создать квест</Button>} />
          ) : (
            <div className="space-y-3">
              {filtered.map(q => (
                <QuestCard key={q.id} quest={q} sphere={questMainSphere(state.spheres, q)}
                  campaign={campaignOf(q)} onOpenCampaign={q.campaignId ? () => focusCampaign(q.campaignId) : undefined}
                  onComplete={() => actions.completeQuest(q.id)}
                  onFail={() => actions.failQuest(q.id)}
                  onReopen={() => actions.reopenQuest(q.id)}
                  onEdit={() => openEdit(q)}
                  onDelete={() => actions.deleteQuest(q.id)}
                  onToggleSubtask={(subId) => actions.toggleSubtask(q.id, subId)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {view === "campaigns" && (
        <>
          {campaigns.some(c => c.status==="archived") && (
            <div className="grid grid-cols-2 gap-2">
              {[{ id:false, label:`Активные (${activeCampaigns.length})` }, { id:true, label:`Архив (${campaigns.filter(c=>c.status==="archived").length})` }].map(t => (
                <button key={String(t.id)} onClick={() => setShowArchived(t.id)}
                  className={`py-2 rounded-xl text-xs font-medium border transition ${showArchived===t.id ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "border-zinc-800 text-zinc-500"}`}>{t.label}</button>
              ))}
            </div>
          )}

          {shownCampaigns.length === 0 ? (
            <EmptyState icon={Flag} title={showArchived ? "Архив пуст" : "Кампаний пока нет"}
              subtitle="Кампания — крупная цель, разбитая на этапы и дневные квесты. План можно собрать руками или попросить ИИ и загрузить файлом."
              action={
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <Button size="sm" onClick={() => setCampaignModal({ initial:null })}>Новая кампания</Button>
                  <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}><Upload className="w-3.5 h-3.5"/>Импортировать план</Button>
                  <Button size="sm" variant="ghost" onClick={() => setGuideOpen(true)}><FileJson className="w-3.5 h-3.5"/>Инструкция для ИИ</Button>
                </div>
              } />
          ) : (
            <div className="space-y-3">
              {shownCampaigns.map(c => (
                <CampaignCard key={c.id} campaign={c} state={state} actions={actions}
                  expanded={expandedCampaigns.includes(c.id)}
                  onToggleExpand={() => actions.toggleExpandedCampaign(c.id)}
                  onEdit={() => setCampaignModal({ initial:c })}
                  onAddQuest={() => addQuestToCampaign(c)}
                  onExport={() => exportCampaign(c)}
                  onOpenQuest={openCampaignQuest}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Редактировать квест" : "Новый квест"} maxWidth="max-w-xl">
        <QuestForm initial={editing || presetCampaign} spheres={state.spheres} people={activePeople(state.people)}
          campaigns={activeCampaigns} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>

      <Modal open={!!campaignModal} onClose={() => setCampaignModal(null)} title={campaignModal && campaignModal.initial ? "Редактировать кампанию" : "Новая кампания"} maxWidth="max-w-xl">
        {campaignModal && (
          <CampaignForm initial={campaignModal.initial} spheres={state.spheres} people={activePeople(state.people)}
            onSubmit={(data) => {
              if (campaignModal.initial) actions.updateCampaign(campaignModal.initial.id, data);
              else { const id = actions.addCampaign(data); actions.toggleExpandedCampaign(id, true); }
              setCampaignModal(null);
            }}
            onCancel={() => setCampaignModal(null)} />
        )}
      </Modal>

      {/* Полная карточка квеста кампании — та же, что на вкладке «Квесты», со всеми действиями. */}
      <Modal open={!!focusQuest} onClose={() => setFocusQuestId(null)} title="Квест" maxWidth="max-w-xl">
        {focusQuest && (
          <QuestCard quest={focusQuest} sphere={questMainSphere(state.spheres, focusQuest)} campaign={campaignOf(focusQuest)} defaultExpanded
            onComplete={() => actions.completeQuest(focusQuest.id)}
            onFail={() => actions.failQuest(focusQuest.id)}
            onReopen={() => actions.reopenQuest(focusQuest.id)}
            onEdit={() => { const q = focusQuest; setFocusQuestId(null); openEdit(q); }}
            onDelete={() => { actions.deleteQuest(focusQuest.id); setFocusQuestId(null); }}
            onToggleSubtask={(subId) => actions.toggleSubtask(focusQuest.id, subId)}
          />
        )}
      </Modal>

      <CampaignImportModal open={importOpen} onClose={() => setImportOpen(false)} state={state}
        onImport={(campaign, quests) => { actions.importCampaign(campaign, quests); setView("campaigns"); setShowArchived(false); actions.toggleExpandedCampaign(campaign.id, true); }}
        onNotify={(msg) => actions.notify(msg)} />
      <AiGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} state={state} onNotify={(msg) => actions.notify(msg)} />

      {/* Запасной путь на случай, если программное скачивание заблокировано песочницей: файл
          всё равно можно забрать выделением. Тот же приём, что у полной выгрузки. */}
      <Modal open={!!exportText} onClose={() => setExportText(null)} title={exportText ? `План: ${exportText.title}` : ""} maxWidth="max-w-2xl">
        {exportText && (
          <div className="space-y-3">
            <div className="text-sm text-zinc-400">Файл сохранён. Если скачивание заблокировано — скопируйте содержимое отсюда.</div>
            <Button variant="secondary" onClick={() => copyTextToClipboard(exportText.text).then(ok => actions.notify(ok ? "План скопирован" : "Не удалось скопировать — выделите текст ниже"))}>
              <Copy className="w-3.5 h-3.5"/>Скопировать
            </Button>
            <textarea readOnly value={exportText.text} className="w-full h-64 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-[11px] font-data text-zinc-300 lq-scroll" />
          </div>
        )}
      </Modal>

      <StickyAddButton
        onClick={() => view==="campaigns" ? setCampaignModal({ initial:null }) : openCreate()}
        label={view==="campaigns" ? "Новая кампания" : "Новый квест"} />
    </div>
  );
}

function HabitMiniHeatmap({ logs, colorHex }) {
  const days = 35;
  const cells = [];
  for (let i=days-1;i>=0;i--) { const ds = addDaysStr(-i); cells.push({ date:ds, done:(logs||[]).includes(ds) }); }
  const weeks = [];
  for (let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));
  return (
    <div className="inline-flex gap-1">
      {weeks.map((w,wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {w.map(c => <div key={c.date} title={c.date} className="rounded-sm" style={{ width:8, height:8, backgroundColor: c.done ? colorHex : "rgba(63,63,70,0.5)" }} />)}
        </div>
      ))}
    </div>
  );
}

function HabitRow({ habit, sphere, onToggleToday, onEdit, onDelete }) {
  const c = pal(sphere && sphere.color);
  const streak = computeStreak(habit.logs||[]);
  const done = (habit.logs||[]).includes(todayStr());
  const last30 = (habit.logs||[]).filter(d => d >= addDaysStr(-29)).length;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={onToggleToday} className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition ${done ? c.bgSolid + " border-transparent" : "border-zinc-700 hover:border-zinc-500"}`}>
          {done && <Check className="w-5 h-5 text-zinc-950"/>}
        </button>
        <div className="min-w-0" style={{ minWidth:140 }}>
          <div className="text-sm font-medium text-zinc-100 truncate">{habit.title}</div>
          <div className={`text-xs ${c.text} mt-0.5 flex items-center gap-1.5 flex-wrap`}>
            <span>{sphere ? sphere.name : "Без сферы"}</span>
            {habit.personId && habit.personName && <span className="text-rose-300 flex items-center gap-1"><Users className="w-3 h-3"/>{habit.personName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-orange-400 text-sm font-data shrink-0"><Flame className="w-4 h-4"/>{streak}</div>
        <div className="text-xs text-zinc-500 font-data shrink-0">{last30}/30 дней</div>
        <div className="flex-1 flex justify-end overflow-x-auto lq-scroll">
          <HabitMiniHeatmap logs={habit.logs} colorHex={c.hex} />
        </div>
        <button onClick={onEdit} className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 shrink-0"><Pencil className="w-4 h-4"/></button>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800 shrink-0"><Trash2 className="w-4 h-4"/></button>
      </div>
    </Card>
  );
}

// Полная карточка авто-привычки (БЖУ/калории, вода, чтение) для вкладки "Привычки" — вместо
// чекбокса живой прогресс за сегодня + быстрые действия. Управляется целью (питания/чтения), не
// вручную — поэтому нет ни редактирования, ни удаления: снять цель можно только там, где она
// задана (дневник питания / карточка книги).
export function LinkedHabitCard({ habit, state, actions, navigate }) {
  const progress = linkedHabitProgress(habit, state);
  const streak = computeStreak(habit.logs||[]);
  const period = linkedHabitPeriodStats(habit, state);
  const periodDone = period.done, periodDays = period.days;
  if (!progress) return null; // цель только что сняли — на следующем рендере пропадёт из списка
  const label = tierLabel(progress.tier);
  // Ссылка на раздел объявлена один раз и всегда прижата вправо. Там, где у вида есть ряд
  // функциональных кнопок, она встаёт в этот же ряд — отдельная строка ради одной ссылки
  // раздувала бы карточку на пустом месте.
  const sectionLink = (
    <button onClick={() => {
      if (progress.kind==="reading") return navigate("library", { kind:"book", id:progress.book.id });
      if (progress.kind==="sportPlan") return navigate("sport");
      return navigate("nutrition");
    }} className="text-xs text-amber-400 hover:text-amber-300 ml-auto shrink-0">
      {progress.kind==="reading" ? `${progress.book.title} →` : progress.kind==="sportPlan" ? "Открыть тренировку →" : "Открыть дневник →"}
    </button>
  );
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-100 truncate flex items-center gap-2">
            {habit.title}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-data uppercase tracking-wide shrink-0">Авто</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-orange-400 text-sm font-data shrink-0"><Flame className="w-4 h-4"/>{streak}</div>
        {/* Привычка живёт ровно столько, сколько живёт её цель, поэтому «за 30 дней» тут врало бы:
            у цели на две недели знаменатель должен быть 14, а не 30. */}
        <div className="text-xs text-zinc-500 font-data shrink-0" title="Дней с засчитанным результатом за период цели">{periodDone}/{periodDays} дней цели</div>
        {label && <span className={`text-xs font-data shrink-0 ${label.cls}`}>{label.text}</span>}
      </div>

      {progress.kind==="nutritionMacros" && (
        <div className="space-y-2">
          {progress.parts.map(p => (
            <div key={p.key}>
              <div className="flex items-center justify-between text-xs font-data text-zinc-500 mb-1">
                <span>{p.label}</span><span>{p.actual} / {p.target} {p.unit}</span>
              </div>
              <ProgressBar value={clamp(p.actual/p.target,0,1)} colorClass={p.colorClass} heightClass="h-1.5" />
            </div>
          ))}
        </div>
      )}

      {progress.kind==="nutritionWater" && (
        <div>
          <div className="flex items-center justify-between text-xs font-data text-zinc-500 mb-1 flex-wrap gap-1">
            <span>{progress.actual} / {progress.target} мл</span>
            {progress.tier<4 && <span>ещё {amountToNextTier(progress.actual, progress.target, progress.tier)} мл до следующей оценки</span>}
          </div>
          <ProgressBar value={clamp(progress.actual/progress.target,0,1)} colorClass="bg-sky-500" heightClass="h-1.5" />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {[200,300,500].map(ml => (
              <Button key={ml} variant="secondary" size="sm" onClick={() => actions.logWater(ml, todayStr())}>+{ml} мл</Button>
            ))}
            {sectionLink}
          </div>
        </div>
      )}

      {progress.kind==="sportPlan" && (
        <div>
          <div className="flex items-center justify-between text-xs font-data text-zinc-500 mb-1 flex-wrap gap-1">
            <span>{progress.actual} / {progress.target} подходов сегодня</span>
            {progress.tier<4 && <span>ещё {progress.target-progress.actual} до конца тренировки</span>}
          </div>
          <ProgressBar value={clamp(progress.fraction,0,1)} colorClass="bg-emerald-500" heightClass="h-1.5" />
          {/* Своя карточка: подходы отмечаются прямо здесь, не уходя в раздел «Спорт». */}
          <div className="mt-2 space-y-2">
            {progress.sessions.map(sess => (
              <div key={sess.id} className="rounded-xl border border-zinc-800 p-2.5">
                <div className="text-xs text-zinc-300 mb-1.5">{sess.title}</div>
                <div className="space-y-1">
                  {sess.entries.map(entry => {
                    const st = workoutSetStats({ entries:[entry] });
                    return (
                      <div key={entry.id} className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400 truncate flex-1">{entry.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {entry.sets.map(set => (
                            <button key={set.id} onClick={() => actions.toggleWorkoutSet(sess.id, entry.id, set.id)}
                              title={set.done ? "Снять отметку" : "Отметить подход"}
                              className={`w-4 h-4 rounded border ${set.done ? "bg-emerald-500 border-emerald-500" : "border-zinc-600 hover:border-zinc-400"}`} />
                          ))}
                        </div>
                        <span className="text-[10px] font-data text-zinc-600 w-8 text-right shrink-0">{st.done}/{st.total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {progress.kind==="reading" && (
        <div>
          <div className="flex items-center justify-between text-xs font-data text-zinc-500 mb-1 flex-wrap gap-1">
            <span>{progress.actual} / {progress.target} стр сегодня</span>
            {progress.tier<4 && <span>ещё {amountToNextTier(progress.actual, progress.target, progress.tier)} стр до следующей оценки</span>}
          </div>
          <ProgressBar value={clamp(progress.fraction,0,1)} colorClass="bg-violet-500" heightClass="h-1.5" />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <QuickAddButtons onAdd={(n) => actions.updateLibraryItem("book", progress.book.id, { pagesRead: (progress.book.pagesRead||0)+n })} />
            {sectionLink}
          </div>
        </div>
      )}

      {/* У БЖУ и тренировок своего ряда кнопок нет — им ссылка нужна отдельной строкой. */}
      {(progress.kind==="nutritionMacros" || progress.kind==="sportPlan") && (
        <div className="mt-3 flex">{sectionLink}</div>
      )}
    </Card>
  );
}

function HabitForm({ spheres, people, initial, onSubmit, onCancel }) {
  const [title, setTitle] = useState((initial && initial.title) || "");
  const [sphereId, setSphereId] = useState((initial && initial.sphereId) || (spheres[0] && spheres[0].id) || "");
  const [personId, setPersonId] = useState((initial && initial.personId) || "");
  function submit() {
    if (!title.trim()) return;
    const person = personId ? (people||[]).find(p => p.id===personId) : null;
    onSubmit({ title: title.trim(), sphereId, personId: person ? person.id : null, personName: person ? person.name : null });
  }
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название привычки</label>
        <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: Медитация 10 минут" autoFocus onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); submit(); } }} />
      </div>
      <div>
        <label className={labelCls}>Сфера жизни</label>
        <select className={inputCls} value={sphereId} onChange={e=>setSphereId(e.target.value)}>
          {spheres.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Человек (необязательно)</label>
        <select className={inputCls} value={personId} onChange={e=>setPersonId(e.target.value)}>
          <option value="">Не привязано</option>
          {(people||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>{initial ? "Сохранить" : "Добавить"}</Button>
      </div>
    </div>
  );
}

export function HabitsView({ state, actions, navigate }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const doneToday = state.habits.filter(h => (h.logs||[]).includes(todayStr())).length;

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(h) { setEditing(h); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updateHabit(editing.id, data); else actions.addHabit(data);
    setModalOpen(false);
  }

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Ежедневный ритуал" title="Привычки" />
      <Card className="p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-zinc-200">Сегодня выполнено</div>
          <div className="font-data text-sm text-zinc-400">{doneToday}/{state.habits.length}</div>
        </div>
        <ProgressBar value={state.habits.length ? doneToday/state.habits.length : 0} colorClass="bg-gradient-to-r from-emerald-500 to-emerald-300" />
      </Card>
      {state.habits.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Пока нет привычек" subtitle="Добавь то, что хочешь делать каждый день — вода, спорт, чтение." action={<Button size="sm" onClick={openCreate}>Добавить привычку</Button>} />
      ) : (
        <div className="space-y-3">
          {state.habits.map(h => h.linkedKind
            ? <LinkedHabitCard key={h.id} habit={h} state={state} actions={actions} navigate={navigate} />
            : <HabitRow key={h.id} habit={h} sphere={state.spheres.find(s=>s.id===h.sphereId)} onToggleToday={() => actions.toggleHabitToday(h.id)} onEdit={() => openEdit(h)} onDelete={() => actions.deleteHabit(h.id)} />
          )}
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Изменить привычку" : "Новая привычка"}>
        <HabitForm spheres={state.spheres} people={activePeople(state.people)} initial={editing} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
      <StickyAddButton onClick={openCreate} label="Новая привычка" />
    </div>
  );
}

function SphereForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState((initial && initial.name) || "");
  const [icon, setIcon] = useState((initial && initial.icon) || "Star");
  const [color, setColor] = useState((initial && initial.color) || "amber");
  function submit() { if (!name.trim()) return; onSubmit({ name: name.trim(), icon, color }); }
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название сферы</label>
        <input className={inputCls} value={name} onChange={e=>setName(e.target.value)} placeholder="Например: Духовность" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Иконка</label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <div>
        <label className={labelCls}>Цвет</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>{initial ? "Сохранить" : "Создать сферу"}</Button>
      </div>
    </div>
  );
}

function SphereCard({ sphere, questCount, habitCount, onClick }) {
  const c = pal(sphere.color);
  const lvl = levelFromXp(sphere.xp);
  const Icon = IconFor(sphere.icon);
  return (
    <button onClick={onClick} className="text-left h-full">
      <Card className="p-5 h-full hover:border-zinc-700 transition">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${c.bgSoft}`}><Icon className={`w-5 h-5 ${c.text}`}/></div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-100 truncate">{sphere.name}</div>
            <div className="text-xs text-zinc-500 font-data">Уровень {lvl.level}</div>
          </div>
        </div>
        <ProgressBar value={lvl.ratio} colorClass={c.bgSolid} />
        <div className="flex items-center justify-between mt-3 text-xs text-zinc-500">
          <span>{questCount} квестов</span>
          <span>{habitCount} привычек</span>
        </div>
      </Card>
    </button>
  );
}

function SphereDetail({ sphere, state, actions, onBack, onEdit }) {
  const c = pal(sphere.color);
  const Icon = IconFor(sphere.icon);
  const lvl = levelFromXp(sphere.xp);
  const quests = state.quests.filter(q => questTouchesSphere(q, sphere.id)).sort(sortByUrgency);
  const habits = state.habits.filter(h => h.sphereId===sphere.id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"><ChevronLeft className="w-3.5 h-3.5"/>Все сферы</button>
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${c.bgSoft}`}><Icon className={`w-8 h-8 ${c.text}`}/></div>
            <div>
              <div className="font-display text-2xl text-zinc-100 tracking-wide">{sphere.name}</div>
              <div className="text-sm text-zinc-500 font-data mt-0.5">Уровень {lvl.level} · {lvl.xpIntoLevel}/{lvl.xpForNext} XP</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit}><Pencil className="w-3.5 h-3.5"/>Изменить</Button>
            {!confirmDelete ? (
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="w-3.5 h-3.5"/></Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Button variant="danger" size="sm" onClick={() => { actions.deleteSphere(sphere.id); onBack(); }}>Удалить</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Отмена</Button>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4"><ProgressBar value={lvl.ratio} colorClass={c.bgSolid} /></div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <div className="text-sm font-semibold text-zinc-200 mb-3">Квесты этой сферы ({quests.length})</div>
          {quests.length === 0 ? <div className="text-sm text-zinc-500">Пока нет квестов в этой сфере.</div> : (
            <div className="space-y-2">
              {quests.map(q => <QuestRow key={q.id} quest={q} sphere={sphere} onComplete={q.status==="active" ? () => actions.completeQuest(q.id) : undefined} />)}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="text-sm font-semibold text-zinc-200 mb-3">Привычки этой сферы ({habits.length})</div>
          {habits.length === 0 ? <div className="text-sm text-zinc-500">Пока нет привычек в этой сфере.</div> : (
            <div className="space-y-2">
              {habits.map(h => {
                if (h.linkedKind) {
                  const progress = linkedHabitProgress(h, state);
                  const streak = computeStreak(h.logs||[]);
                  return (
                    <div key={h.id} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-950/40">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-data uppercase tracking-wide shrink-0">Авто</span>
                      <span className="text-sm flex-1 text-zinc-200 truncate">{h.title}</span>
                      {progress && <span className="text-xs text-zinc-500 font-data shrink-0">{progress.tier}/4 сегодня</span>}
                      <span className="text-xs text-orange-400 font-data flex items-center gap-1"><Flame className="w-3 h-3"/>{streak}</span>
                    </div>
                  );
                }
                const done = (h.logs||[]).includes(todayStr());
                const streak = computeStreak(h.logs||[]);
                return (
                  <button key={h.id} onClick={() => actions.toggleHabitToday(h.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition text-left ${done ? "bg-zinc-800/40 border-zinc-800" : "bg-zinc-950/40 border-zinc-800 hover:border-zinc-700"}`}>
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${done ? c.bgSolid + " border-transparent" : "border-zinc-600"}`}>{done && <Check className="w-3.5 h-3.5 text-zinc-950"/>}</span>
                    <span className={`text-sm flex-1 ${done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{h.title}</span>
                    <span className="text-xs text-orange-400 font-data flex items-center gap-1"><Flame className="w-3 h-3"/>{streak}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function SpheresView({ state, actions, focus, setFocus }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const focused = focus ? state.spheres.find(s => s.id===focus) : null;

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(s) { setEditing(s); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updateSphere(editing.id, data); else actions.addSphere(data);
    setModalOpen(false);
  }

  if (focused) {
    return (
      <>
        <SphereDetail sphere={focused} state={state} actions={actions} onBack={() => setFocus(null)} onEdit={() => openEdit(focused)} />
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Изменить сферу">
          <SphereForm initial={editing} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
        </Modal>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Атрибуты персонажа" title="Сферы жизни" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.spheres.map(s => (
          <SphereCard key={s.id} sphere={s}
            questCount={state.quests.filter(q => questTouchesSphere(q, s.id)).length}
            habitCount={state.habits.filter(h => h.sphereId===s.id).length}
            onClick={() => setFocus(s.id)}
          />
        ))}
      </div>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Изменить сферу" : "Новая сфера"}>
        <SphereForm initial={editing} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
      <StickyAddButton onClick={openCreate} label="Новая сфера" />
    </div>
  );
}
