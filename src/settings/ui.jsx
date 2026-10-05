// Настройки: меню, библиотека, смайлики, ключи API, праздники и данные.

import { useEffect, useState } from "react";
import { pad2, todayStr } from "../core/basics.js";
import { fmtDateShort } from "../core/format.js";
import { defaultApiKeys, defaultLibrarySources } from "../core/prefs.js";
import { TABS, fullTabOrder } from "../core/tabs.js";
import {
  LOG_HABIT_BASE_CURRENCY, LOG_HABIT_BASE_XP, LOG_HABIT_KINDS, LOG_HABIT_WINDOW_DAYS,
  logRewardDayCount,
} from "../habits/model.js";
import { LIBRARY_SEARCH_SOURCES } from "../library/search.js";
import { activePeople } from "../people/model.js";
import { HOLIDAYS, HOLIDAY_QUEST_LEAD_DAYS } from "../quests/holidays.js";
import { normalizeState } from "../state/model.js";
import { Button, Modal, inputCls, labelCls } from "../ui/atoms.jsx";
import { EMOJI_CATEGORY_LABELS, defaultEmojiAssignments, defaultEmojiPools } from "../ui/emoji-pools.js";
import { EmojiPicker } from "../ui/pickers.jsx";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

// Профиля здесь больше нет: карточка персонажа переехала в собственный раздел «Профиль».
// Держать имя и аватар в двух местах — верный способ развести их по смыслу и запутать себя.
const SETTINGS_SECTIONS = [
  { id:"menu",     label:"Меню" },
  { id:"rewards",  label:"Поощрения" },
  { id:"library",  label:"Библиотека" },
  { id:"emojis",   label:"Смайлики" },
  { id:"holidays", label:"Праздники" },
  { id:"data",     label:"Данные" },
];

// Строка вкладки в настройке порядка/видимости меню — тот же визуальный паттерн, что у
// EditableListRow (drag handle + стрелки), только вместо цвета — иконка вкладки, а вместо
// удаления — скрыть/показать (глаз).
function TabOrderRow({ tabDef, idx, count, hidden, isDragging, onDragStart, onDrop, onDragEnd, onMove, onToggleHidden }) {
  const Icon = tabDef.icon;
  return (
    <div
      draggable
      onDragStart={() => onDragStart(idx)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop(idx); }}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 transition ${isDragging ? "opacity-40" : ""} ${hidden ? "opacity-50" : ""}`}
    >
      <span className="text-zinc-700 shrink-0" style={{ cursor:"grab" }} title="Перетащить"><GripVertical className="w-3.5 h-3.5"/></span>
      <Icon className="w-4 h-4 text-zinc-500 shrink-0" />
      <span className="text-sm text-zinc-200 flex-1 truncate">{tabDef.label}</span>
      <span className="flex items-center shrink-0">
        <button onClick={() => onMove(idx, idx-1)} disabled={idx<=0} className="p-1 text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed"><ChevronUp className="w-3.5 h-3.5"/></button>
        <button onClick={() => onMove(idx, idx+1)} disabled={idx>=count-1} className="p-1 text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed"><ChevronDown className="w-3.5 h-3.5"/></button>
      </span>
      <button onClick={onToggleHidden} className="shrink-0 text-zinc-500 hover:text-zinc-200" title={hidden ? "Показать в меню" : "Скрыть из меню"}>
        {hidden ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
      </button>
    </div>
  );
}

function MenuSettingsSection({ state, onReorder, onToggleHidden }) {
  const [dragIdx, setDragIdx] = useState(null);
  const order = fullTabOrder(state);
  const hidden = new Set((state.uiPrefs && state.uiPrefs.tabs && state.uiPrefs.tabs.hidden) || []);
  const hubDef = TABS.find(t => t.id==="hub");
  const HubIcon = hubDef.icon;
  const movableIds = order.filter(id => id!=="hub");

  return (
    <div className="space-y-4">
      <div className="text-xs text-zinc-600">Порядок и видимость разделов в левом меню. Хаб всегда закреплён первым — от него удобно возвращаться в общую картину.</div>
      <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2">
        <span className="w-3.5 h-3.5 shrink-0" />
        <HubIcon className="w-4 h-4 text-zinc-500 shrink-0" />
        <span className="text-sm text-zinc-400 flex-1">{hubDef.label}</span>
        <span className="text-[10px] text-zinc-600 uppercase tracking-wide shrink-0">Всегда</span>
      </div>
      <div className="space-y-2">
        {movableIds.map((id, idx) => {
          const tabDef = TABS.find(t => t.id===id);
          if (!tabDef) return null;
          return (
            <TabOrderRow key={id} tabDef={tabDef} idx={idx} count={movableIds.length}
              hidden={hidden.has(id)}
              isDragging={dragIdx===idx}
              onDragStart={setDragIdx}
              onDrop={(dropIdx) => { if (dragIdx!==null && dragIdx!==dropIdx) onReorder(movableIds[dragIdx], movableIds[dropIdx]); setDragIdx(null); }}
              onDragEnd={() => setDragIdx(null)}
              onMove={(from,to) => onReorder(movableIds[from], movableIds[to])}
              onToggleHidden={() => onToggleHidden(id)}
            />
          );
        })}
      </div>
    </div>
  );
}

// Ключи для поиска обложек по проверенным источникам (Настройки → Библиотека). Open Library
// сюда не входит — она открытая и работает без ключа вообще.
// Один блок на каждый вид (книги/фильмы/игры): переключатели включённых источников + поля
// ключей (со ссылкой на регистрацию) только для тех источников, кому ключ вообще нужен.
function LibrarySourceGroup({ kindLabel, sources, sourcesEnabled, apiKeys, onToggleSource, onSaveKey }) {
  const [drafts, setDrafts] = useState(() => {
    const d = {};
    sources.forEach(s => { if (s.needsKey || s.optionalKey) d[s.needsKey||s.optionalKey] = apiKeys[s.needsKey||s.optionalKey] || ""; });
    return d;
  });
  const [savedField, setSavedField] = useState(null);

  function save(field) {
    onSaveKey({ [field]: (drafts[field]||"").trim() });
    setSavedField(field);
    setTimeout(() => setSavedField(null), 1500);
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-500 uppercase tracking-wide font-data">{kindLabel}</div>
      {sources.map(s => {
        const keyField = s.needsKey || s.optionalKey;
        const enabled = (sourcesEnabled && sourcesEnabled[s.id]) !== false;
        return (
          <div key={s.id} className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={enabled} onChange={e => onToggleSource(s.id, e.target.checked)} />
              <span className="text-sm text-zinc-200 flex-1">{s.label}</span>
              {s.needsKey && <span className="text-[10px] text-zinc-600 uppercase tracking-wide">нужен ключ</span>}
            </label>
            {keyField && enabled && (
              <div className="mt-2 pl-6">
                <div className="flex gap-2">
                  <input className={inputCls} value={drafts[keyField]||""} onChange={e=>setDrafts(d=>({ ...d, [keyField]:e.target.value }))} placeholder={s.needsKey ? `API-ключ ${s.label}` : `API-ключ ${s.label} (необязательно)`} />
                  <Button variant="secondary" size="sm" onClick={() => save(keyField)}>{savedField===keyField ? "Сохранено ✓" : "Сохранить"}</Button>
                </div>
                {s.keyUrl && <a href={s.keyUrl} target="_blank" rel="noreferrer" className="text-xs text-amber-400 hover:text-amber-300 mt-1.5 inline-block">Получить ключ →</a>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Управление пулами смайликов: создать/переименовать/удалить пул, отредактировать состав
// (тот же EmojiPicker, что и в формах — двусторонняя синхронизация получается сама собой, это
// один и тот же массив в state.uiPrefs.emojiPools), и назначить, какая категория какой пул
// использует.
function EmojiPoolsSettingsSection({ pools, assignments, onAddEmoji, onRemoveEmoji, onCreate, onRename, onDelete, onAssign }) {
  const [newPoolName, setNewPoolName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const poolIds = Object.keys(pools);

  function startRename(id) { setRenamingId(id); setRenameDraft(pools[id].name); }
  function submitRename() {
    if (renameDraft.trim()) onRename(renamingId, renameDraft.trim());
    setRenamingId(null);
  }
  function submitCreate() {
    if (!newPoolName.trim()) return;
    onCreate(newPoolName.trim());
    setNewPoolName("");
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-zinc-600">
        Пул — это набор смайликов, который можно назначить сразу нескольким категориям. Правки
        (добавить/убрать смайлик) видны сразу везде, где этот пул используется — что здесь, что
        прямо в форме создания карточки.
      </div>

      <div>
        <div className={labelCls}>Какая категория какой пул использует</div>
        <div className="space-y-2">
          {Object.entries(EMOJI_CATEGORY_LABELS).map(([cat, label]) => (
            <div key={cat} className="flex items-center justify-between gap-2 bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
              <span className="text-sm text-zinc-300">{label}</span>
              <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300" value={assignments[cat] || poolIds[0]} onChange={e => onAssign(cat, e.target.value)}>
                {poolIds.map(id => <option key={id} value={id}>{pools[id].name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className={labelCls}>Пулы</div>
        {poolIds.map(id => {
          const pool = pools[id];
          const inUse = Object.values(assignments).includes(id);
          return (
            <div key={id} className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                {renamingId===id ? (
                  <div className="flex gap-2 flex-1">
                    <input autoFocus className={inputCls} value={renameDraft} onChange={e=>setRenameDraft(e.target.value)} onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); submitRename(); } }} />
                    <Button variant="secondary" size="sm" onClick={submitRename}>Ок</Button>
                  </div>
                ) : (
                  <button onClick={() => startRename(id)} className="text-sm text-zinc-200 font-medium hover:text-amber-300 transition flex items-center gap-1.5"><Pencil className="w-3 h-3 text-zinc-600"/>{pool.name}</button>
                )}
                {poolIds.length > 1 && (
                  <button onClick={() => onDelete(id)} disabled={inUse} title={inUse ? "Сначала переназначь категории, использующие этот пул" : "Удалить пул"} className="text-zinc-600 hover:text-red-400 disabled:opacity-25 disabled:hover:text-zinc-600 disabled:cursor-not-allowed shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
                )}
              </div>
              <EmojiPicker value={null} onChange={() => {}} poolEmojis={pool.emojis} onAdd={(v) => onAddEmoji(id, v)} onRemove={(v) => onRemoveEmoji(id, v)} />
            </div>
          );
        })}
        <div className="flex gap-2">
          <input className={inputCls} value={newPoolName} onChange={e=>setNewPoolName(e.target.value)} placeholder="Название нового пула" onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); submitCreate(); } }} />
          <Button variant="secondary" onClick={submitCreate}><Plus className="w-4 h-4"/>Создать пул</Button>
        </div>
      </div>
    </div>
  );
}

function ApiKeysSettingsSection({ apiKeys, librarySources, onSaveKeys, onToggleSource }) {
  return (
    <div className="space-y-6">
      <div className="text-xs text-zinc-600">
        Какие базы использовать для поиска обложек по названию — можно включать/выключать по
        отдельности. Ссылка вручную (со Steam, с сайта книги и т.п.) работает всегда, независимо
        от этих настроек.
      </div>
      <LibrarySourceGroup kindLabel="Книги" sources={LIBRARY_SEARCH_SOURCES.book} sourcesEnabled={librarySources.book} apiKeys={apiKeys} onToggleSource={(id,en) => onToggleSource("book", id, en)} onSaveKey={onSaveKeys} />
      <LibrarySourceGroup kindLabel="Фильмы и сериалы" sources={LIBRARY_SEARCH_SOURCES.movie} sourcesEnabled={librarySources.movie} apiKeys={apiKeys} onToggleSource={(id,en) => onToggleSource("movie", id, en)} onSaveKey={onSaveKeys} />
      <LibrarySourceGroup kindLabel="Игры" sources={LIBRARY_SEARCH_SOURCES.game} sourcesEnabled={librarySources.game} apiKeys={apiKeys} onToggleSource={(id,en) => onToggleSource("game", id, en)} onSaveKey={onSaveKeys} />
      <div className="text-xs text-zinc-600 border-t border-zinc-800 pt-3">
        IGDB и поиск по Steam сюда не добавлены — они официально не отвечают на запросы прямо из
        браузера, нужен свой сервер-посредник, которого у этого сайта нет. Для игр из Steam
        по-прежнему проще всего вставить ссылку на обложку вручную (вкладка «Ссылка»).
      </div>
    </div>
  );
}

// Настройки раздела «Праздники»: подписка/отписка (глазик у каждого) + привязка людей чипами,
// видна только у подписанных — тот же визуальный язык, что у фильтра сфер в Календаре.
function HolidaysSettingsSection({ holidaySubscriptions, people, onToggleSubscribe, onSetPeople }) {
  const shown = activePeople(people);
  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-600">
        Подпишись на праздник, чтобы он появлялся в Календаре — а если привязать людей, за{" "}
        {HOLIDAY_QUEST_LEAD_DAYS} дней до даты сам появится квест на поздравление. Один привязанный
        человек — простой квест, несколько — один квест с отдельной подзадачей на каждого.
      </div>
      <div className="space-y-2">
        {HOLIDAYS.map(h => {
          const sub = holidaySubscriptions[h.id] || { subscribed:false, personIds:[] };
          const linkedIds = sub.personIds || [];
          return (
            <div key={h.id} className="p-3 rounded-xl border border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-zinc-200 truncate">{h.name}</span>
                  <span className="text-xs text-zinc-600 font-data shrink-0">{pad2(h.day)}.{pad2(h.month)}</span>
                </div>
                <button
                  onClick={() => onToggleSubscribe(h.id)}
                  className={`shrink-0 ${sub.subscribed ? "text-sky-400" : "text-zinc-700 hover:text-zinc-400"}`}
                  title={sub.subscribed ? "Отписаться" : "Подписаться"}
                >
                  {sub.subscribed ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
                </button>
              </div>
              {sub.subscribed && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {shown.length === 0 && <span className="text-xs text-zinc-600">Сначала добавь людей в разделе «Люди»</span>}
                  {shown.map(p => {
                    const active = linkedIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => onSetPeople(h.id, active ? linkedIds.filter(x=>x!==p.id) : [...linkedIds, p.id])}
                        className={`px-2.5 py-1 rounded-full text-xs border transition ${active ? "bg-sky-500/15 border-sky-500/30 text-sky-300" : "border-zinc-800 text-zinc-600 hover:text-zinc-300"}`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsModal({ open, onClose, state, actions }) {
  const onBackupDone = () => actions.markBackupDone();
  const [section, setSection] = useState("menu");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmFillDemo, setConfirmFillDemo] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!open) { setShowExport(false); setShowImport(false); setImportText(""); setImportMsg(""); setCopied(false); setConfirmReset(false); setConfirmFillDemo(false); setSection("menu"); } }, [open]);

  // Выгрузка идёт без отступов. Раньше стоял JSON.stringify(state, null, 2) — от него файл
  // раздувался на треть и превращался в тысячи строк, хотя читать его руками всё равно никто не
  // будет: это машинный формат, а не документ. Импорт от форматирования не зависит вовсе.
  const exportText = showExport ? JSON.stringify(state) : "";

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state));
      setCopied(true);
      onBackupDone();
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setCopied(false);
    }
  }

  // На телефоне «скачать» кладёт файл в загрузки, откуда он обычно и пропадает. Системное меню
  // отправки решает ровно это: один тап — и бэкап уехал в облако или в переписку с собой.
  // Появляется только там, где браузер умеет делиться файлами; на остальных остаётся скачивание.
  const canShareBackup = typeof navigator !== "undefined" && !!navigator.canShare
    && (() => { try { return navigator.canShare({ files: [new File(["{}"], "t.json", { type: "application/json" })] }); } catch (e) { return false; } })();

  async function shareExport() {
    try {
      const file = new File([JSON.stringify(state)], `questlife-backup-${todayStr()}.json`, { type: "application/json" });
      await navigator.share({ files: [file], title: "Бэкап QuestLife" });
      onBackupDone();
    } catch (e) {
      // Отмена в системном меню — не ошибка и не повод считать бэкап сделанным.
    }
  }

  function downloadExport() {
    try {
      const blob = new Blob([JSON.stringify(state)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `questlife-export-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onBackupDone();
    } catch (e) {
      // На некоторых песочницах (например, в артефакте Claude) программное скачивание может
      // блокироваться — тогда остаётся текстовое поле ниже: выделить и скопировать вручную.
    }
  }

  function applyImport(raw) {
    try {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.spheres) && Array.isArray(data.quests)) {
        actions.replaceState(normalizeState(data));
        setImportText(""); setShowImport(false); setImportMsg("");
      } else {
        setImportMsg("Не похоже на выгрузку QuestLife — нет ожидаемых полей.");
      }
    } catch (err) {
      setImportMsg("Не получилось прочитать JSON — проверь, что вставлен текст целиком.");
    }
  }
  function importFromFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyImport(reader.result);
    reader.readAsText(file);
  }

  return (
    <Modal open={open} onClose={onClose} title="Настройки">
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {SETTINGS_SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)} className={`py-2 rounded-xl text-xs font-medium border transition ${section===s.id ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>{s.label}</button>
          ))}
        </div>

        {section==="menu" && (
          <MenuSettingsSection state={state} onReorder={actions.reorderTab} onToggleHidden={actions.toggleTabHidden} />
        )}

        {section==="rewards" && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-zinc-200 mb-1">Поощрения за ведение разделов</div>
              <div className="text-xs text-zinc-500">
                Небольшая награда за сам факт записи: день с операцией в финансах, приёмом пищи в
                дневнике или тренировкой в журнале. Не требует ежедневности — вести каждый день не нужно.
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/40 cursor-pointer">
              <span className="text-sm text-zinc-200">Начислять поощрения</span>
              <input type="checkbox" checked={!!(state.logRewards && state.logRewards.enabled)}
                onChange={e => actions.setLogRewards(e.target.checked)} />
            </label>
            <div className="space-y-1.5">
              {Object.entries(LOG_HABIT_KINDS).map(([kind, cfg]) => {
                const sphere = state.spheres.find(sp => sp.id===cfg.sphereId);
                const days = logRewardDayCount(kind, state, 30);
                return (
                  <div key={kind} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-950/40">
                    <span className="text-sm text-zinc-300 flex-1 truncate">{cfg.title}</span>
                    <span className="text-xs text-zinc-600">{sphere ? sphere.name : cfg.sphereId}</span>
                    <span className="text-xs font-data text-zinc-500 shrink-0">{days} дн. за месяц</span>
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-zinc-600">
              {LOG_HABIT_BASE_XP} XP и {LOG_HABIT_BASE_CURRENCY} золота за день с записью — вдвое меньше, чем за выполнение цели.
              Начисление идёт с момента включения и не более чем за {LOG_HABIT_WINDOW_DAYS} последних дней,
              чтобы заполненный задним числом месяц не выдавал награду разом.
              {state.logRewards && state.logRewards.enabled && state.logRewards.enabledAt
                ? ` Включено с ${fmtDateShort(state.logRewards.enabledAt)}.` : ""}
            </div>
          </div>
        )}

        {section==="library" && (
          <ApiKeysSettingsSection
            apiKeys={(state.uiPrefs && state.uiPrefs.apiKeys) || defaultApiKeys()}
            librarySources={(state.uiPrefs && state.uiPrefs.librarySources) || defaultLibrarySources()}
            onSaveKeys={actions.updateApiKeys}
            onToggleSource={actions.toggleLibrarySource}
          />
        )}

        {section==="emojis" && (
          <EmojiPoolsSettingsSection
            pools={(state.uiPrefs && state.uiPrefs.emojiPools) || defaultEmojiPools()}
            assignments={(state.uiPrefs && state.uiPrefs.emojiAssignments) || defaultEmojiAssignments()}
            onAddEmoji={actions.addPoolEmoji}
            onRemoveEmoji={actions.removePoolEmoji}
            onCreate={actions.createEmojiPool}
            onRename={actions.renameEmojiPool}
            onDelete={actions.deleteEmojiPool}
            onAssign={actions.setEmojiAssignment}
          />
        )}

        {section==="holidays" && (
          <HolidaysSettingsSection
            holidaySubscriptions={state.holidaySubscriptions || {}}
            people={state.people}
            onToggleSubscribe={actions.toggleHolidaySubscription}
            onSetPeople={actions.setHolidayPeople}
          />
        )}

        {section==="data" && (
          <div className="space-y-5">
            <div>
              <label className={labelCls}>Данные</label>
              <div className="text-xs text-zinc-600 mb-2">Прогресс и так сохраняется автоматически между сессиями. Это — на всякий случай, для ручного бэкапа или переноса.</div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setShowExport(v => !v); setShowImport(false); }}>{showExport ? "Скрыть выгрузку" : "Выгрузить JSON"}</Button>
                <Button variant="secondary" size="sm" onClick={() => { setShowImport(v => !v); setShowExport(false); }}>{showImport ? "Скрыть вставку" : "Вставить JSON"}</Button>
                <label className="inline-flex items-center justify-center rounded-xl transition-colors duration-150 px-3 py-1.5 text-xs gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 cursor-pointer">
                  Загрузить файл
                  <input type="file" accept="application/json" style={{ display:"none" }} onChange={importFromFile} />
                </label>
              </div>
              {showExport && (
                <div className="mt-3">
                  <textarea readOnly value={exportText} onClick={e => e.target.select()} onFocus={e => e.target.select()} className={inputCls + " font-data"} style={{ height:140, resize:"vertical" }} />
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={copyExport}>{copied ? "Скопировано ✓" : "Скопировать"}</Button>
                    {canShareBackup && <Button size="sm" onClick={shareExport}>Отправить</Button>}
                    <Button variant="secondary" size="sm" onClick={downloadExport}>Скачать файл</Button>
                    <span className="text-xs text-zinc-600">Или выдели весь текст в поле и скопируй вручную.</span>
                  </div>
                </div>
              )}
              {showImport && (
                <div className="mt-3">
                  <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportMsg(""); }} placeholder="Вставь сюда скопированный JSON..." className={inputCls + " font-data"} style={{ height:140, resize:"vertical" }} />
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={() => applyImport(importText)}>Импортировать</Button>
                    {importMsg && <span className="text-xs text-red-400">{importMsg}</span>}
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-zinc-800 pt-4">
              <label className="text-xs text-zinc-500 uppercase tracking-wide font-data mb-2 block">Демо-данные</label>
              {!confirmFillDemo ? (
                <Button variant="secondary" size="sm" onClick={() => setConfirmFillDemo(true)}>Заполнить превью-данными</Button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-zinc-400">Заменит все текущие данные примерами (API-ключи останутся). Точно?</span>
                  <Button variant="secondary" size="sm" onClick={() => { actions.fillPreviewData(); setConfirmFillDemo(false); onClose(); }}>Да, заполнить</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmFillDemo(false)}>Отмена</Button>
                </div>
              )}
            </div>
            <div className="border-t border-zinc-800 pt-4">
              <label className="text-xs text-red-400/80 uppercase tracking-wide font-data mb-2 block">Опасная зона</label>
              {!confirmReset ? (
                <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>Сбросить все данные</Button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-zinc-400">Точно? Это необратимо.</span>
                  <Button variant="danger" size="sm" onClick={() => { actions.resetAll(); setConfirmReset(false); onClose(); }}>Да, сбросить</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Отмена</Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
