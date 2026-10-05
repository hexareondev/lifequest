// Интерфейс людей: форма, карточка, список и подробный вид человека.

import { computeStreak } from "../habits/model.js";
import { QuestRow } from "../quests/quest-row.jsx";
import { useState } from "react";
import {
  Archive, ArchiveRestore, Check, ChevronDown, ChevronLeft, ChevronUp, Eye, EyeOff, Flame, Palette,
  Pencil, Plus, Share2, Sliders, Trash2, Users,
} from "lucide-react";
import { todayStr } from "../core/basics.js";
import { fmtDateShort, fmtDateWithYear, fmtMoney } from "../core/format.js";
import { imagePosStyle } from "../core/images.js";
import { levelFromXp } from "../core/xp.js";
import { FreeNotesDisplay } from "../notes/ui.jsx";
import { questMainSphere, questTouchesPerson } from "../quests/links.js";
import { sortByUrgency } from "../quests/sorting.js";
import { ShareButtons, ShareExportModal, ShareImportModal } from "../share/ui.jsx";
import {
  Button, Card, CollapsibleCard, EmptyState, KebabMenu, Modal, ProgressBar,
  SectionHeader, StickyAddButton, inputCls, labelCls,
} from "../ui/atoms.jsx";
import { PEOPLE_ICONS } from "../ui/icons.js";
import { ColorPicker, CoverPickerModal, CoverPreviewButton } from "../ui/pickers.jsx";
import { EditableListRow } from "../ui/editable-list.jsx";
import { pal } from "../ui/theme.js";
import { PersonAvatar } from "./avatar.jsx";
import { birthdayBlurb } from "./birthday.js";
import { PEOPLE_CARD_FIELD_LABELS, defaultPeopleCardFields, relationMeta } from "./model.js";

function PersonForm({ initial, relations, emojiPools, emojiAssignments, onAddPoolEmoji, onRemovePoolEmoji, onSubmit, onCancel }) {
  const [name, setName] = useState((initial && initial.name) || "");
  const [relation, setRelation] = useState((initial && initial.relation) || (relations[0] && relations[0].name) || "Другое");
  const [icon, setIcon] = useState((initial && initial.icon) || "Users");
  const [avatarEmoji, setAvatarEmoji] = useState((initial && initial.avatarEmoji) || null);
  const [avatarImage, setAvatarImage] = useState((initial && initial.avatarImage) || null);
  const [avatarPos, setAvatarPos] = useState((initial && initial.avatarPos) || null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [color, setColor] = useState((initial && initial.color) || "rose");
  const [notes, setNotes] = useState((initial && initial.notes) || "");
  const [journal, setJournal] = useState((initial && initial.journal) || "");
  const [birthday, setBirthday] = useState((initial && initial.birthday) || "");
  function submit() {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), relation, icon, avatarEmoji, avatarImage, avatarPos, color, notes: notes.trim(), journal: journal.trim(), birthday: birthday.trim() || null });
  }
  const AvatarIcon = PEOPLE_ICONS[icon] || Users;
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Имя</label>
        <input className={inputCls} value={name} onChange={e=>setName(e.target.value)} placeholder="Например: Аня" autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Отношения</label>
          <select className={inputCls} value={relation} onChange={e=>setRelation(e.target.value)}>
            {relations.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>День рождения (необязательно)</label>
          <input type="date" className={inputCls} value={birthday} onChange={e=>setBirthday(e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Аватар</label>
        <CoverPreviewButton onClick={() => setCoverPickerOpen(true)}>
          {avatarImage ? <img src={avatarImage} className="w-full h-full object-cover" style={imagePosStyle(avatarPos)} alt="" /> : avatarEmoji ? avatarEmoji : <AvatarIcon className="w-7 h-7 text-zinc-400" />}
        </CoverPreviewButton>
        <CoverPickerModal open={coverPickerOpen} onClose={() => setCoverPickerOpen(false)} kind="person"
          iconValue={icon} onPickIcon={(v) => { setIcon(v); setAvatarEmoji(null); setAvatarImage(null); }}
          emoji={avatarEmoji} onPickEmoji={(v) => { setAvatarEmoji(v); setAvatarImage(null); }}
          imageUrl={avatarImage} onPickImage={(v) => { setAvatarImage(v); setAvatarPos(null); }}
          imagePos={avatarPos} onPickPos={setAvatarPos}
          emojiPools={emojiPools} emojiAssignments={emojiAssignments}
          onAddPoolEmoji={onAddPoolEmoji} onRemovePoolEmoji={onRemovePoolEmoji}
        />
      </div>
      <div>
        <label className={labelCls}>Цвет</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div>
        <label className={labelCls}>Краткое описание (необязательно)</label>
        <textarea className={inputCls} rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Пара слов об этом человеке" />
      </div>
      <div>
        <label className={labelCls}>Заметки (необязательно)</label>
        <textarea className={inputCls} rows={5} value={journal} onChange={e=>setJournal(e.target.value)} placeholder={"Любая информация текстом.\nСписок — если строка начинается с \"- \" или \"1. \".\nРазделитель между блоками — отдельная строка из \"---\"."} />
        <div className="text-[11px] text-zinc-600 mt-1">Понимает списки ("- пункт" или "1. пункт") и разделители ("---" отдельной строкой).</div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>{initial ? "Сохранить" : "Добавить человека"}</Button>
      </div>
    </div>
  );
}

function PersonCard({ person, relations, questCount, habitCount, debtBalance, onClick, showFields, reorderable, isDragging, onDragStart, onDragOver, onDrop, onDragEnd, onMoveEarlier, onMoveLater, canMoveEarlier, canMoveLater, onToggleBirthdayTracking }) {
  const c = pal(person.color);
  const lvl = levelFromXp(person.xp);
  const rel = relationMeta(relations, person.relation);
  const rc = pal(rel.color);
  const bday = showFields.birthday ? birthdayBlurb(person.birthday) : null;
  const tracked = person.trackBirthday === true;
  return (
    <div
      onClick={onClick}
      draggable={reorderable}
      onDragStart={reorderable ? onDragStart : undefined}
      onDragOver={reorderable ? (e) => { e.preventDefault(); onDragOver && onDragOver(); } : undefined}
      onDrop={reorderable ? (e) => { e.preventDefault(); onDrop && onDrop(); } : undefined}
      onDragEnd={reorderable ? onDragEnd : undefined}
      className={`text-left h-full transition cursor-pointer ${isDragging ? "opacity-40" : ""}`}
    >
      <Card className={`p-5 h-full hover:border-zinc-700 transition ${person.archived ? "opacity-60" : ""}`}>
        <div className="flex items-start gap-3 mb-3">
          <PersonAvatar person={person} wrapClassName={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${c.bgSoft}`} iconClassName={`w-5 h-5 ${c.text}`} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-zinc-100 truncate">{person.name}</div>
            <div className={`text-xs ${rc.text}`}>{rel.name} · Ур. {lvl.level}</div>
            {bday && (
              <div className="text-xs text-zinc-500 mt-0.5 truncate flex items-center gap-1">
                <span className="truncate">{bday}</span>
                {onToggleBirthdayTracking && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleBirthdayTracking(person.id); }}
                    className={`shrink-0 ${tracked ? "text-sky-400" : "text-zinc-700 hover:text-zinc-400"}`}
                    title={tracked ? "Не отслеживать ДР" : "Отслеживать ДР"}
                  >
                    {tracked ? <Eye className="w-3 h-3"/> : <EyeOff className="w-3 h-3"/>}
                  </button>
                )}
              </div>
            )}
          </div>
          {reorderable && (
            <div className="flex flex-col shrink-0" onClick={(e) => e.stopPropagation()}>
              <button onClick={onMoveEarlier} disabled={!canMoveEarlier} className="p-0.5 text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed"><ChevronUp className="w-3.5 h-3.5"/></button>
              <button onClick={onMoveLater} disabled={!canMoveLater} className="p-0.5 text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed"><ChevronDown className="w-3.5 h-3.5"/></button>
            </div>
          )}
        </div>
        <ProgressBar value={lvl.ratio} colorClass={c.bgSolid} />
        {showFields.counts && (
          <div className="flex items-center justify-between mt-3 text-xs text-zinc-500 gap-2 flex-wrap">
            <span>{questCount} квестов</span>
            <span>{habitCount} привычек</span>
          </div>
        )}
        {showFields.debt && debtBalance !== 0 && (
          <div className={`text-xs font-data mt-2 ${debtBalance>0 ? "text-cyan-400" : "text-rose-400"}`}>
            {debtBalance>0 ? `Должны вам: ${fmtMoney(debtBalance)}` : `Вы должны: ${fmtMoney(Math.abs(debtBalance))}`}
          </div>
        )}
        {showFields.notes && person.notes && (
          <div className="text-xs text-zinc-500 mt-2 truncate">{person.notes}</div>
        )}
      </Card>
    </div>
  );
}

function PersonDetail({ person, state, actions, onBack, onEdit }) {
  const c = pal(person.color);
  const lvl = levelFromXp(person.xp);
  const rel = relationMeta(state.peopleRelations, person.relation);
  const quests = state.quests.filter(q => questTouchesPerson(q, person.id)).sort(sortByUrgency);
  const habits = state.habits.filter(h => h.personId===person.id);
  const debts = state.transactions.filter(t => t.type==="debt" && t.personId===person.id).sort((a,b) => b.date < a.date ? -1 : 1);
  const debtBalance = debts.reduce((a,t) => a + (t.direction==="repay" ? -t.amount : t.amount), 0);
  const transfers = state.transactions.filter(t => (t.type==="income" || t.type==="expense") && t.personId===person.id).sort((a,b) => b.date < a.date ? -1 : 1);
  const transfersNet = transfers.reduce((a,t) => a + (t.type==="income" ? t.amount : -t.amount), 0);
  // Все секции, кроме основной шапки (аватар/имя/описание), сворачиваемые — состояние общее на
  // весь экран (не по человеку) и сохраняется между сессиями.
  const collapsedSections = (state.uiPrefs && state.uiPrefs.peopleDetail && state.uiPrefs.peopleDetail.collapsedSections) || [];
  const isCollapsed = (key) => collapsedSections.includes(key);
  const birthdayTracked = person.trackBirthday === true;
  const [shareOne, setShareOne] = useState(false);

  // Меню-троеточие вместо кластера кнопок — тот же приём, что в LibraryItemDetail. Отдельного
  // подтверждения на удаление внутри меню не нужно: deletePerson уже мягкое (тост с "Отменить"),
  // поэтому inline-confirmDelete, который был здесь раньше, дублировал уже имеющуюся защиту.
  const menuItems = [
    { icon:Pencil, label:"Изменить", onClick:onEdit },
    { icon:Share2, label:"Поделиться карточкой", onClick:() => setShareOne(true) },
    ...(person.birthday ? [{
      icon: birthdayTracked ? EyeOff : Eye,
      label: birthdayTracked ? "Не отслеживать ДР" : "Отслеживать ДР",
      onClick: () => actions.togglePersonBirthdayTracking(person.id),
    }] : []),
    person.archived
      ? { icon:ArchiveRestore, label:"Из архива", onClick:() => actions.unarchivePerson(person.id) }
      : { icon:Archive, label:"В архив", onClick:() => actions.archivePerson(person.id) },
    { divider:true },
    { icon:Trash2, label:"Удалить", danger:true, onClick:() => { actions.deletePerson(person.id); onBack(); } },
  ];

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"><ChevronLeft className="w-3.5 h-3.5"/>Все люди</button>
      <Card className="p-6 relative">
        <KebabMenu items={menuItems} buttonClassName="absolute top-4 right-4" />
        <div className="flex items-start gap-4 pr-12">
          <PersonAvatar person={person} wrapClassName={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${c.bgSoft}`} iconClassName={`w-8 h-8 ${c.text}`} />
          <div className="flex-1" style={{ minWidth:240 }}>
            <div className="font-display text-2xl text-zinc-100 tracking-wide">{person.name}</div>
            <div className="text-sm text-zinc-500 font-data mt-0.5">{rel.name} · Уровень {lvl.level} · {lvl.xpIntoLevel}/{lvl.xpForNext} XP</div>
            {person.archived && <div className="text-xs text-zinc-600 mt-1 flex items-center gap-1"><Archive className="w-3 h-3"/>В архиве</div>}
          </div>
        </div>
        <div className="mt-4"><ProgressBar value={lvl.ratio} colorClass={c.bgSolid} /></div>
        {person.birthday && (
          <div className="text-xs text-zinc-600 mt-2 font-data flex items-center gap-1.5">
            <span>День рождения: {fmtDateWithYear(person.birthday)}{birthdayBlurb(person.birthday) ? ` · ${birthdayBlurb(person.birthday)}` : ""}</span>
            <button
              onClick={() => actions.togglePersonBirthdayTracking(person.id)}
              className={birthdayTracked ? "text-sky-400" : "text-zinc-700 hover:text-zinc-400"}
              title={birthdayTracked ? "Не отслеживать ДР" : "Отслеживать ДР"}
            >
              {birthdayTracked ? <Eye className="w-3 h-3"/> : <EyeOff className="w-3 h-3"/>}
            </button>
          </div>
        )}
        {person.notes && <div className="text-xs text-zinc-600 mt-2 whitespace-pre-wrap">{person.notes}</div>}
      </Card>

      <ShareExportModal open={shareOne} onClose={() => setShareOne(false)} sectionId="people" state={state} singleItemId={person.id} />

      <CollapsibleCard title="Заметки" open={!isCollapsed("journal")} onToggle={() => actions.toggleCollapsedSection("journal")}>
        <FreeNotesDisplay text={person.journal} />
      </CollapsibleCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <CollapsibleCard title={`Квесты с этим человеком (${quests.length})`} open={!isCollapsed("quests")} onToggle={() => actions.toggleCollapsedSection("quests")}>
          {quests.length === 0 ? <div className="text-sm text-zinc-500">Пока нет привязанных квестов.</div> : (
            <div className="space-y-2">
              {quests.map(q => <QuestRow key={q.id} quest={q} sphere={questMainSphere(state.spheres, q)} onComplete={q.status==="active" ? () => actions.completeQuest(q.id) : undefined} />)}
            </div>
          )}
        </CollapsibleCard>
        <CollapsibleCard title={`Привычки с этим человеком (${habits.length})`} open={!isCollapsed("habits")} onToggle={() => actions.toggleCollapsedSection("habits")}>
          {habits.length === 0 ? <div className="text-sm text-zinc-500">Пока нет привязанных привычек.</div> : (
            <div className="space-y-2">
              {habits.map(h => {
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
        </CollapsibleCard>
      </div>

      <CollapsibleCard title="Долги" open={!isCollapsed("debts")} onToggle={() => actions.toggleCollapsedSection("debts")}>
        {debts.length === 0 ? (
          <div className="text-sm text-zinc-500">Пока нет операций типа «Долг», привязанных к этому человеку.</div>
        ) : (
          <>
            <div className="text-sm mb-3">
              {debtBalance === 0 ? <span className="text-zinc-500">Баланс закрыт</span> : debtBalance > 0
                ? <span className="text-cyan-400 font-data">Должны вам: {fmtMoney(debtBalance)}</span>
                : <span className="text-rose-400 font-data">Вы должны: {fmtMoney(Math.abs(debtBalance))}</span>}
            </div>
            <div className="space-y-1">
              {debts.map(t => (
                <div key={t.id} className="flex items-center justify-between text-sm border-b border-zinc-800/60 py-2 last:border-0 gap-2 flex-wrap">
                  <span className="text-zinc-400">{fmtDateShort(t.date)} · {t.direction==="lend" ? "Дано в долг" : "Вернули"}{t.description ? ` — ${t.description}` : ""}</span>
                  <span className="font-data text-zinc-200 shrink-0">{fmtMoney(t.amount)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CollapsibleCard>

      <CollapsibleCard title="Переводы" open={!isCollapsed("transfers")} onToggle={() => actions.toggleCollapsedSection("transfers")}>
        {transfers.length === 0 ? (
          <div className="text-sm text-zinc-500">Пока нет переводов (категория «Люди» в доходах/расходах), привязанных к этому человеку.</div>
        ) : (
          <>
            <div className="text-sm mb-3">
              {transfersNet === 0 ? <span className="text-zinc-500">Сошлось в ноль</span> : transfersNet > 0
                ? <span className="text-emerald-400 font-data">От человека получено больше: {fmtMoney(transfersNet)}</span>
                : <span className="text-rose-400 font-data">Отправлено человеку больше: {fmtMoney(Math.abs(transfersNet))}</span>}
            </div>
            <div className="space-y-1">
              {transfers.map(t => (
                <div key={t.id} className="flex items-center justify-between text-sm border-b border-zinc-800/60 py-2 last:border-0 gap-2 flex-wrap">
                  <span className="text-zinc-400">{fmtDateShort(t.date)} · {t.type==="income" ? "Получено" : "Отправлено"}{t.description ? ` — ${t.description}` : ""}</span>
                  <span className={`font-data shrink-0 ${t.type==="income" ? "text-emerald-400" : "text-rose-400"}`}>{t.type==="income" ? "+" : "-"}{fmtMoney(t.amount)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CollapsibleCard>
    </div>
  );
}

function RelationManagerModal({ open, onClose, relations, onAdd, onDelete, onRecolor, onReorder }) {
  const [name, setName] = useState("");
  const [newColor, setNewColor] = useState("emerald");
  const [recoloring, setRecoloring] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const movableCount = relations.filter(r => r.name!=="Другое").length;

  function submit() {
    const n = name.trim();
    if (!n) return;
    if (relations.some(r => r.name.toLowerCase()===n.toLowerCase())) return;
    onAdd({ name:n, color:newColor });
    setName("");
  }

  return (
    <Modal open={open} onClose={onClose} title="Типы отношений" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="space-y-2 overflow-y-auto lq-scroll" style={{ maxHeight:260 }}>
          {relations.map((r, idx) => (
            <EditableListRow key={r.name} item={r} idx={idx} movableCount={movableCount}
              isPinned={r.name==="Другое"}
              isProtected={r.name==="Другое"}
              isRecoloring={recoloring===r.name}
              onToggleRecolor={() => setRecoloring(x => x===r.name ? null : r.name)}
              onRecolor={(col) => onRecolor(r.name, col)}
              onDelete={() => onDelete(r.name)}
              onMove={onReorder}
              isDragging={dragIdx===idx}
              onDragStart={setDragIdx}
              onDrop={(dropIdx) => { if (dragIdx!==null && dragIdx!==dropIdx) onReorder(dragIdx, dropIdx); setDragIdx(null); }}
              onDragEnd={() => setDragIdx(null)}
            />
          ))}
        </div>
        <div className="border-t border-zinc-800 pt-4">
          <label className={labelCls}>Новый тип отношений</label>
          <div className="flex gap-2 mb-2">
            <input className={inputCls} value={name} onChange={e=>setName(e.target.value)} placeholder="Например: Наставник" onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); submit(); } }} />
            <Button variant="secondary" onClick={submit}><Plus className="w-4 h-4"/></Button>
          </div>
          <ColorPicker value={newColor} onChange={setNewColor} />
        </div>
      </div>
    </Modal>
  );
}

function PeopleCardFieldsModal({ open, onClose, fields, onChange }) {
  return (
    <Modal open={open} onClose={onClose} title="Что показывать в карточках" maxWidth="max-w-sm">
      <div className="space-y-1">
        {Object.entries(PEOPLE_CARD_FIELD_LABELS).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2.5 px-1 py-2 cursor-pointer">
            <input type="checkbox" checked={fields[key] !== false} onChange={e => onChange(key, e.target.checked)} />
            <span className="text-sm text-zinc-200">{label}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

export function PeopleView({ state, actions, focus, setFocus }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [relModalOpen, setRelModalOpen] = useState(false);
  const [fieldsModalOpen, setFieldsModalOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [relFilter, setRelFilter] = useState("all");
  const [dragId, setDragId] = useState(null);
  const people = state.people || [];
  const focused = focus ? people.find(p => p.id===focus) : null;
  const cardFields = { ...defaultPeopleCardFields(), ...(state.uiPrefs && state.uiPrefs.peopleCardFields) };

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(p) { setEditing(p); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updatePerson(editing.id, data); else actions.addPerson(data);
    setModalOpen(false);
  }

  if (focused) {
    return (
      <>
        <PersonDetail person={focused} state={state} actions={actions} onBack={() => setFocus(null)} onEdit={() => openEdit(focused)} />
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Изменить человека">
          <PersonForm initial={editing} relations={state.peopleRelations} emojiPools={state.uiPrefs && state.uiPrefs.emojiPools} emojiAssignments={state.uiPrefs && state.uiPrefs.emojiAssignments} onAddPoolEmoji={actions.addPoolEmoji} onRemovePoolEmoji={actions.removePoolEmoji} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
        </Modal>
      </>
    );
  }

  // Активные сортируются вручную (order, drag-and-drop + стрелки), архив — по дате переноса
  // в архив (сначала недавние).
  const list = people
    .filter(p => showArchived ? p.archived : !p.archived)
    .filter(p => relFilter==="all" || p.relation===relFilter)
    .sort((a,b) => showArchived ? (b.archivedAt||"").localeCompare(a.archivedAt||"") : (a.order??0)-(b.order??0));

  const reorderable = !showArchived && relFilter==="all";

  return (
    <div className="space-y-5">
      {/* Шапка по образцу Библиотеки: в самом заголовке — только обмен и кебаб с настроечными
          модалками, ниже grid-переключатель Активные/Архив (как выбор вида в Библиотеке), а
          фильтр и главное действие — одной строкой: фильтры слева, «Добавить» справа. Раньше все
          кнопки стояли в заголовке и на узком экране разъезжались в несколько этажей. */}
      <SectionHeader eyebrow="Круг общения" title="Люди" action={
        <div className="flex items-center gap-2 flex-wrap">
          <ShareButtons onShare={() => setShareOpen(true)} onImport={() => setImportOpen(true)} />
          <KebabMenu items={[
            { icon:Sliders, label:"Настроить карточки", onClick:() => setFieldsModalOpen(true) },
            { icon:Palette, label:"Типы отношений",     onClick:() => setRelModalOpen(true) },
          ]} />
        </div>
      } />

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setShowArchived(false)} className={`py-2.5 rounded-xl text-sm font-medium border transition flex items-center justify-center gap-2 ${!showArchived ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>
          <Users className="w-4 h-4"/>Активные
        </button>
        <button onClick={() => setShowArchived(true)} className={`py-2.5 rounded-xl text-sm font-medium border transition flex items-center justify-center gap-2 ${showArchived ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>
          <Archive className="w-4 h-4"/>Архив
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={relFilter} onChange={e=>setRelFilter(e.target.value)}>
          <option value="all">Все отношения</option>
          {(state.peopleRelations||[]).map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
        </select>
      </div>
      {!showArchived && relFilter!=="all" && (
        <div className="text-xs text-zinc-600 -mt-2">Ручной порядок доступен только при фильтре «Все отношения».</div>
      )}

      {list.length === 0 ? (
        <EmptyState icon={Users} title={showArchived ? "В архиве никого нет" : "Пока нет карточек людей"}
          subtitle={showArchived ? "" : "Добавь близких людей, чтобы привязывать к ним квесты, привычки и долги."}
          action={!showArchived ? <Button size="sm" onClick={openCreate}>Добавить человека</Button> : undefined} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((p, i) => {
            const debtBalance = state.transactions.filter(t => t.type==="debt" && t.personId===p.id).reduce((a,t) => a + (t.direction==="repay" ? -t.amount : t.amount), 0);
            return (
              <PersonCard key={p.id} person={p} relations={state.peopleRelations}
                questCount={state.quests.filter(q => questTouchesPerson(q, p.id)).length}
                habitCount={state.habits.filter(h => h.personId===p.id).length}
                debtBalance={debtBalance}
                showFields={cardFields}
                onClick={() => setFocus(p.id)}
                reorderable={reorderable}
                isDragging={dragId===p.id}
                onDragStart={() => setDragId(p.id)}
                onDragOver={() => {}}
                onDrop={() => { if (dragId && dragId!==p.id) actions.reorderPerson(dragId, p.id); setDragId(null); }}
                onDragEnd={() => setDragId(null)}
                onMoveEarlier={() => i>0 && actions.reorderPerson(p.id, list[i-1].id)}
                onMoveLater={() => i<list.length-1 && actions.reorderPerson(p.id, list[i+1].id)}
                canMoveEarlier={reorderable && i>0}
                canMoveLater={reorderable && i<list.length-1}
                onToggleBirthdayTracking={actions.togglePersonBirthdayTracking}
              />
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Изменить человека" : "Новый человек"}>
        <PersonForm initial={editing} relations={state.peopleRelations} emojiPools={state.uiPrefs && state.uiPrefs.emojiPools} emojiAssignments={state.uiPrefs && state.uiPrefs.emojiAssignments} onAddPoolEmoji={actions.addPoolEmoji} onRemovePoolEmoji={actions.removePoolEmoji} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
      <StickyAddButton onClick={openCreate} label="Добавить человека" />
      <RelationManagerModal open={relModalOpen} onClose={() => setRelModalOpen(false)} relations={state.peopleRelations||[]} onAdd={actions.addRelation} onDelete={actions.deleteRelation} onRecolor={actions.recolorRelation} onReorder={actions.reorderRelation} />
      <PeopleCardFieldsModal open={fieldsModalOpen} onClose={() => setFieldsModalOpen(false)} fields={cardFields} onChange={(key,val) => actions.updatePeopleCardFields({ [key]: val })} />
      <ShareExportModal open={shareOpen} onClose={() => setShareOpen(false)} sectionId="people" state={state} />
      <ShareImportModal open={importOpen} onClose={() => setImportOpen(false)} sectionId="people" state={state} onImport={(parsed, reuse) => actions.importShared("people", parsed, reuse)} />
    </div>
  );
}
