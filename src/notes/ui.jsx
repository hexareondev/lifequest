// Интерфейс заметок: рисование разметки, встраиваемые виджеты, дерево папок, редактор и сам
// раздел. Разбор markdown и модель заметок лежат рядом в notes/ — здесь только то, что рисует.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowRight, Bold, Boxes, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Code, Download, FileCode, FilePlus, FileText, Folder, FolderOpen, FolderPlus, Hash, Heading1,
  Heading2, Heading3, Highlighter, Italic, Link2, List, ListChecks, ListOrdered, Minus, Pencil,
  Pin, PinOff, Plus, Quote, Search, Sliders, Strikethrough, Trash2, Type, X,
} from "lucide-react";
import { uid } from "../core/basics.js";
import { downloadTextFile } from "../core/download.js";
import { fmtDateShort, fmtDateWithYear, fmtMoney } from "../core/format.js";
import { levelFromXp } from "../core/xp.js";
import {
  libraryDisplayTitle, libraryItemTypeLabel, libraryProgressOf, libraryStatusLabel,
} from "../library/constants.js";
import { LibraryCover } from "../library/cover.jsx";
import {
  applyMarkdownAction, continueListOnEnter, keyboardInsetOf, parseInline, parseMarkdown,
  toggleMarkdownCheckbox,
} from "../notes/markdown.js";
import {
  EMBED_FIELDS, EMBED_MAX_PER_NOTE, NOTE_MAX_TITLE, allNoteTags, buildBranchFiles,
  buildNoteMarkdown, canMoveFolder, childFolders, defaultNotesPrefs, downloadBinaryFile,
  embedFieldsOf, embedNavTarget, embedSyntax, extractTags, folderNoteCount, folderPathLabel,
  insertEmbedEdit, noteTitleOf, notesInFolder, parseEmbedRef, pickerItemMatches, replaceEmbedLine,
  resolveEmbed, safeFileSegment, searchNotes, sortNotesList, zipStore,
} from "../notes/model.js";
import { PersonAvatar } from "../people/avatar.jsx";
import { birthdayBlurb } from "../people/birthday.js";
import { relationMeta } from "../people/model.js";
import { questTouchesPerson, questTouchesSphere } from "../quests/links.js";
import {
  Button, Card, EmptyState, KebabMenu, Modal, ProgressBar, SectionHeader, StarRating, inputCls,
} from "../ui/atoms.jsx";
import { useIsDesktop } from "../ui/hooks.js";
import { IconFor } from "../ui/icons.js";
import { pal } from "../ui/theme.js";

// Рендер идёт в React-элементы, а НЕ через dangerouslySetInnerHTML. Разница принципиальная:
// вставленный в заметку HTML при таком рендере физически не может исполниться.
function InlineText({ text, onOpenTag, onOpenLink, embedState, navigate }) {
  const parts = parseInline(text);
  return (
    <>
      {parts.map((p, i) => {
        if (typeof p === "string") return <React.Fragment key={i}>{p}</React.Fragment>;
        if (p.t === "code") return <code key={i} className="px-1 py-0.5 rounded bg-zinc-800/80 text-amber-300 font-data text-[0.92em]">{p.v}</code>;
        if (p.t === "b") return <strong key={i} className="font-semibold text-zinc-200">{p.v}</strong>;
        if (p.t === "i") return <em key={i} className="italic">{p.v}</em>;
        if (p.t === "s") return <span key={i} className="line-through text-zinc-500">{p.v}</span>;
        if (p.t === "mark") return <mark key={i} className="bg-amber-500/25 text-amber-200 rounded px-0.5">{p.v}</mark>;
        if (p.t === "tag") return (
          <button key={i} onClick={() => onOpenTag && onOpenTag(p.v)}
            className="text-sky-400 hover:text-sky-300 hover:underline">#{p.v}</button>
        );
        if (p.t === "wiki") return (
          <button key={i} onClick={() => onOpenLink && onOpenLink(p.v)}
            className="text-violet-400 hover:text-violet-300 hover:underline">{p.label}</button>
        );
        // Без состояния встраивать нечего — показываем исходный текст, а не пустоту.
        if (p.t === "embed") return embedState
          ? <NoteEmbedChip key={i} raw={p.v} state={embedState} navigate={navigate} />
          : <React.Fragment key={i}>{"![[" + p.v + "]]"}</React.Fragment>;
        if (p.t === "link") return (
          <a key={i} href={p.v} target="_blank" rel="noreferrer noopener" className="text-amber-400 hover:text-amber-300 hover:underline break-all">{p.label}</a>
        );
        return null;
      })}
    </>
  );
}

const MD_HEADING_CLS = {
  1: "text-xl font-semibold text-zinc-100 mt-4 mb-1",
  2: "text-lg font-semibold text-zinc-100 mt-4 mb-1",
  3: "text-base font-semibold text-zinc-200 mt-3 mb-1",
  4: "text-sm font-semibold text-zinc-200 mt-3 mb-0.5",
  5: "text-sm font-semibold text-zinc-300 mt-2",
  6: "text-xs font-semibold uppercase tracking-wide text-zinc-500 mt-2",
};

function MarkdownView({ text, onToggleCheckbox, onOpenTag, onOpenLink, className, embedState, navigate, onConfigureEmbed }) {
  const blocks = parseMarkdown(text);
  if (!blocks.length) return <div className="text-sm text-zinc-600">Пусто.</div>;
  const inline = (t) => <InlineText text={t} onOpenTag={onOpenTag} onOpenLink={onOpenLink} embedState={embedState} navigate={navigate} />;
  let embedsShown = 0;
  return (
    <div className={className || "text-sm text-zinc-300 leading-relaxed"}>
      {blocks.map((b, i) => {
        if (b.type === "embed") {
          if (!embedState) return <div key={i} className="whitespace-pre-wrap font-data text-zinc-500">{"![[" + b.ref + "]]"}</div>;
          embedsShown += 1;
          if (embedsShown > EMBED_MAX_PER_NOTE) {
            // Сообщение показываем ровно один раз, а не под каждой скрытой карточкой.
            return embedsShown === EMBED_MAX_PER_NOTE + 1
              ? <div key={i} className="my-2 text-xs text-zinc-600">Остальные встраивания скрыты: в одной заметке их не больше {EMBED_MAX_PER_NOTE}.</div>
              : null;
          }
          return <NoteEmbedCard key={i} raw={b.ref} state={embedState} navigate={navigate}
            onConfigure={onConfigureEmbed ? (found) => onConfigureEmbed(b.line, found) : null} />;
        }
        if (b.type === "blank") return <div key={i} className="h-2" />;
        if (b.type === "hr") return <hr key={i} className="border-zinc-800 my-3" />;
        if (b.type === "h") { const H = `h${Math.min(6, b.level)}`; return React.createElement(H, { key: i, className: MD_HEADING_CLS[b.level] || MD_HEADING_CLS[6] }, inline(b.text)); }
        if (b.type === "code") return (
          <pre key={i} className="my-2 p-3 rounded-lg bg-zinc-950 border border-zinc-800 overflow-x-auto lq-scroll">
            <code className="font-data text-xs text-zinc-300 whitespace-pre">{b.lines.join("\n")}</code>
          </pre>
        );
        if (b.type === "quote") return (
          <blockquote key={i} className="my-2 border-l-2 border-zinc-700 pl-3 text-zinc-400 italic">
            {b.lines.map((l, j) => <div key={j}>{inline(l)}</div>)}
          </blockquote>
        );
        if (b.type === "todo") return (
          <div key={i} className="my-1 space-y-1">
            {b.items.map((it, j) => (
              <label key={j} className={`flex items-start gap-2 ${onToggleCheckbox ? "cursor-pointer" : ""}`} style={{ paddingLeft: it.depth * 18 }}>
                <input type="checkbox" checked={it.checked} disabled={!onToggleCheckbox}
                  onChange={() => onToggleCheckbox && onToggleCheckbox(it.line)}
                  className="mt-1 accent-amber-500 shrink-0" />
                <span className={it.checked ? "text-zinc-600 line-through" : ""}>{inline(it.text)}</span>
              </label>
            ))}
          </div>
        );
        if (b.type === "ul" || b.type === "ol") return (
          <div key={i} className="my-1 space-y-0.5">
            {b.items.map((it, j) => (
              <div key={j} className="flex gap-2" style={{ paddingLeft: it.depth * 18 }}>
                <span className="text-zinc-600 shrink-0 font-data text-xs mt-0.5">{b.type === "ol" ? `${(b.start || 1) + j}.` : "•"}</span>
                <span className="min-w-0">{inline(it.text)}</span>
              </div>
            ))}
          </div>
        );
        return <div key={i} className="whitespace-pre-wrap">{inline(b.text)}</div>;
      })}
    </div>
  );
}

// Свободные заметки в карточке человека — тот же движок, отдельная подпись на случай пустоты.
export function FreeNotesDisplay({ text }) {
  if (!text || !text.trim()) return <div className="text-sm text-zinc-500">Пока пусто.</div>;
  return <MarkdownView text={text} className="text-sm text-zinc-400 leading-relaxed" />;
}

// Виджеты сделаны отдельными и только на чтение, а не переиспользуют карточки разделов. Те тащат
// за собой actions, перетаскивание, кебаб-меню и всплывающие подсказки — внутри абзаца всё это
// не нужно и мешает, а связав их, любая правка в разделе начала бы ломать заметки.

function NoteEmbedShell({ onClick, onConfigure, children }) {
  return (
    <div className="relative group my-2">
      <button onClick={onClick}
        className="w-full flex items-center gap-3 p-3 pr-8 rounded-xl border border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/60 transition text-left">
        {children}
      </button>
      {/* Кнопка настройки — сосед основной, а не вложенная в неё: кнопка внутри кнопки
          недопустима в разметке и ведёт себя непредсказуемо при клике и с клавиатуры. */}
      {onConfigure && (
        <button onClick={onConfigure} title="Какие поля показывать"
          className="absolute top-1.5 right-1.5 p-1 rounded-lg text-zinc-600 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-amber-300 hover:bg-zinc-800 transition">
          <Sliders className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function NoteEmbedMissing({ raw }) {
  const parsed = parseEmbedRef(raw);
  return (
    <div className="my-2 flex items-center gap-2 p-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 text-sm text-zinc-500">
      <AlertCircle className="w-4 h-4 text-amber-500/70 shrink-0" />
      {parsed
        ? <span>Не найдено: <span className="text-zinc-300">{parsed.ref}</span>. Возможно, объект переименован или удалён.</span>
        : <span>Не разобрано встраивание: <span className="font-data text-zinc-400">![[{raw}]]</span></span>}
    </div>
  );
}

// Общая подпись под названием: поля собираются в одну строку через точку, чтобы карточка не росла
// вертикально с каждым включённым полем.
function NoteEmbedMeta({ parts }) {
  const items = parts.filter(Boolean);
  if (!items.length) return null;
  return <div className="text-[11px] text-zinc-500 font-data mt-0.5">{items.join(" · ")}</div>;
}

function NotePersonEmbed({ person, state, navigate, fields, onConfigure }) {
  const show = (k) => fields.includes(k);
  const c = pal(person.color);
  const rel = relationMeta(state.peopleRelations, person.relation);
  const rc = pal(rel.color);
  const lvl = levelFromXp(person.xp);
  const debts = (state.transactions || []).filter(t => t.type === "debt" && t.personId === person.id);
  const debtBalance = debts.reduce((a, t) => a + (t.direction === "repay" ? -t.amount : t.amount), 0);
  const meta = [];
  if (show("уровень")) meta.push(`Уровень ${lvl.level} · ${lvl.xpIntoLevel}/${lvl.xpForNext} XP`);
  if (show("др")) meta.push(birthdayBlurb(person.birthday));
  if (show("квесты")) meta.push(`квестов: ${(state.quests || []).filter(q => questTouchesPerson(q, person.id)).length}`);
  if (show("привычки")) meta.push(`привычек: ${(state.habits || []).filter(h => h.personId === person.id).length}`);
  const note = show("заметка") && person.notes ? String(person.notes).split("\n").find(Boolean) : null;
  return (
    <NoteEmbedShell onClick={() => navigate && navigate("people", person.id)} onConfigure={onConfigure}>
      <PersonAvatar person={person} wrapClassName={`w-12 h-12 rounded-xl ${c.bgSoft} border ${c.border} flex items-center justify-center shrink-0`} iconClassName={`w-6 h-6 ${c.text}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-100 truncate">{person.name}</span>
          {show("отношения") && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${rc.bgSoft} ${rc.text} border ${rc.border} shrink-0`}>{rel.name}</span>}
        </div>
        <NoteEmbedMeta parts={meta} />
        {show("долг") && debtBalance !== 0 && (
          <div className={`text-[11px] font-data mt-0.5 ${debtBalance > 0 ? "text-cyan-400" : "text-rose-400"}`}>
            {debtBalance > 0 ? `Должны вам: ${fmtMoney(debtBalance)}` : `Вы должны: ${fmtMoney(Math.abs(debtBalance))}`}
          </div>
        )}
        {note && <div className="text-[11px] text-zinc-500 mt-0.5 truncate">{note}</div>}
        {show("прогресс") && <div className="mt-1.5"><ProgressBar value={lvl.ratio} colorClass={c.bgSolid} heightClass="h-1" /></div>}
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
    </NoteEmbedShell>
  );
}

function NoteSphereEmbed({ sphere, state, navigate, fields, onConfigure }) {
  const show = (k) => fields.includes(k);
  const c = pal(sphere.color);
  const Icon = IconFor(sphere.icon);
  const lvl = levelFromXp(sphere.xp);
  const meta = [];
  if (show("уровень")) meta.push(`Уровень ${lvl.level} · ${lvl.xpIntoLevel}/${lvl.xpForNext} XP`);
  if (show("квесты")) meta.push(`квестов: ${(state.quests || []).filter(q => questTouchesSphere(q, sphere.id)).length}`);
  if (show("привычки")) meta.push(`привычек: ${(state.habits || []).filter(h => h.sphereId === sphere.id).length}`);
  return (
    <NoteEmbedShell onClick={() => navigate && navigate("spheres", sphere.id)} onConfigure={onConfigure}>
      <span className={`w-12 h-12 rounded-xl ${c.bgSoft} border ${c.border} flex items-center justify-center shrink-0`}>
        <Icon className={`w-6 h-6 ${c.text}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-zinc-100 truncate">{sphere.name}</div>
        <NoteEmbedMeta parts={meta} />
        {show("прогресс") && <div className="mt-1.5"><ProgressBar value={lvl.ratio} colorClass={c.bgSolid} heightClass="h-1" /></div>}
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
    </NoteEmbedShell>
  );
}

function NoteLibraryEmbed({ libKind, item, state, navigate, fields, onConfigure }) {
  const show = (k) => fields.includes(k);
  const progress = show("прогресс") ? libraryProgressOf(libKind, item) : null;
  const sphere = show("сфера") ? (state.spheres || []).find(s => s.id === item.sphereId) : null;
  const lastNote = show("заметка") && Array.isArray(item.notes) && item.notes.length ? item.notes[item.notes.length - 1].text : null;
  const line = [libraryItemTypeLabel(libKind, item)];
  if (show("статус")) line.push(libraryStatusLabel(libKind, item.status));
  if (sphere) line.push(sphere.name);
  // Оценка рисуется тем же StarRating, что и в самой Библиотеке, а не текстовыми символами:
  // оценки бывают половинными, а "★".repeat(3.5) молча отбрасывает дробную часть и рисует
  // серым по цвету окружающей строки.
  const stars = show("оценка") && item.rating > 0;
  return (
    <NoteEmbedShell onClick={() => navigate && navigate("library", embedNavTarget({ kind: "library", libKind, item }).focus)} onConfigure={onConfigure}>
      <LibraryCover item={item} className="text-2xl shrink-0 w-11 aspect-[2/3] rounded-lg bg-zinc-900" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-zinc-100 truncate">{libraryDisplayTitle(item)}</div>
        {show("оригинал") && item.displayTitle && item.displayTitle.trim() && item.title && (
          <div className="text-[10px] text-zinc-600 truncate">{item.title}</div>
        )}
        <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>{line.join(" · ")}</span>
          {stars && <StarRating value={item.rating} readOnly sizePx={12} />}
        </div>
        {lastNote && <div className="text-[11px] text-zinc-500 mt-0.5 truncate">{lastNote}</div>}
        {progress && (
          <div className="mt-1.5">
            <ProgressBar value={progress.ratio} colorClass="bg-amber-500" heightClass="h-1" />
            <div className="text-[10px] text-zinc-600 font-data mt-0.5">{progress.value} / {progress.total}</div>
          </div>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
    </NoteEmbedShell>
  );
}

function NoteEmbedCard({ raw, state, navigate, onConfigure }) {
  const found = resolveEmbed(state, raw);
  if (!found) return <NoteEmbedMissing raw={raw} />;
  const fields = embedFieldsOf(found.kind, found.fields);
  const configure = onConfigure ? () => onConfigure(found) : null;
  if (found.kind === "person") return <NotePersonEmbed person={found.item} state={state} navigate={navigate} fields={fields} onConfigure={configure} />;
  if (found.kind === "sphere") return <NoteSphereEmbed sphere={found.item} state={state} navigate={navigate} fields={fields} onConfigure={configure} />;
  return <NoteLibraryEmbed libKind={found.libKind} item={found.item} state={state} navigate={navigate} fields={fields} onConfigure={configure} />;
}

// Строчная плашка: то же встраивание, но посреди абзаца — карточка там разорвала бы текст.
// Полей у неё нет намеренно: в строке текста уместно только название.
function NoteEmbedChip({ raw, state, navigate }) {
  const found = resolveEmbed(state, raw);
  if (!found) {
    const parsed = parseEmbedRef(raw);
    return <span className="text-[0.92em] px-1.5 py-0.5 rounded-md bg-zinc-800/60 text-zinc-500 border border-dashed border-zinc-700">{parsed ? parsed.ref : raw} — не найдено</span>;
  }
  const named = found.kind === "person" || found.kind === "sphere";
  const c = pal(found.item.color);
  const Icon = named ? IconFor(found.item.icon) : FileText;
  const label = named ? found.item.name : libraryDisplayTitle(found.item);
  const target = embedNavTarget(found);
  return (
    <button onClick={() => navigate && navigate(target.tab, target.focus)}
      className={`inline-flex items-center gap-1 align-baseline text-[0.92em] px-1.5 py-0.5 rounded-md ${named ? c.bgSoft : "bg-zinc-800/70"} ${named ? c.text : "text-zinc-300"} hover:brightness-125 transition`}>
      <Icon className="w-3 h-3 shrink-0" />{label}
    </button>
  );
}

function NoteEmbedFieldsModal({ open, onClose, target, onApply }) {
  const kind = target ? target.kind : null;
  const catalogue = (kind && EMBED_FIELDS[kind]) || [];
  // Ключ строкой, а не массивом: массив пересоздаётся на каждом разборе текста, и в зависимостях
  // эффекта он сбрасывал бы выбор пользователя при каждой перерисовке.
  const fieldsKey = target && target.fields ? target.fields.join(",") : "";
  const [sel, setSel] = useState([]);
  useEffect(() => {
    if (open && kind) setSel(embedFieldsOf(kind, target.fields));
  }, [open, kind, fieldsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!target) return null;
  const toggle = (key) => setSel(list => list.includes(key) ? list.filter(k => k !== key) : [...list, key]);
  return (
    <Modal open={open} onClose={onClose} title="Поля карточки" maxWidth="max-w-sm">
      <div className="space-y-3">
        <div className="text-xs text-zinc-500">Набор сохранится в тексте заметки, у остальных карточек он свой.</div>
        <div className="space-y-1">
          {catalogue.map(f => (
            <label key={f.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800/60 cursor-pointer">
              <input type="checkbox" checked={sel.includes(f.key)} onChange={() => toggle(f.key)} className="accent-amber-500" />
              <span className="text-sm text-zinc-300 flex-1">{f.label}</span>
              <span className="text-[10px] font-data text-zinc-600">{f.key}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-between gap-2 pt-1">
          <Button variant="ghost" onClick={() => { onApply(null); onClose(); }}>По умолчанию</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Отмена</Button>
            <Button onClick={() => { onApply(sel); onClose(); }}>Применить</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// В списке показываем отображаемое название (то же, что видно в самой Библиотеке), а настоящее —
// мелкой строкой под ним. Переключателя «какое показать» нет намеренно: видны сразу оба, и не
// приходится гадать, в каком режиме сейчас список.
export function libraryPickerItem(item) {
  const shown = libraryDisplayTitle(item);
  return { id: item.id, name: shown, alt: shown === item.title ? null : item.title };
}

// Выбор объекта для вставки. Нужен ровно затем, чтобы не угадывать написание имени: список
// подставляет его ровно так, как объект называется сейчас.
function NoteEmbedPicker({ open, onClose, state, collapsed, onToggleCollapse, onPick }) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const needle = q.trim().toLowerCase();
  const groups = [
    { alias: "человек", label: "Люди", items: (state.people || []).filter(p => !p.archived).map(p => ({ id: p.id, name: p.name })) },
    { alias: "сфера", label: "Сферы", items: (state.spheres || []).map(s => ({ id: s.id, name: s.name })) },
    { alias: "книга", label: "Книги", items: (state.books || []).map(libraryPickerItem) },
    { alias: "игра", label: "Игры", items: (state.games || []).map(libraryPickerItem) },
    { alias: "фильм", label: "Фильмы", items: (state.movies || []).map(libraryPickerItem) },
  ].map(g => {
    // Совпадение по названию категории показывает её целиком: «книги» в запросе означает «покажи
    // книги», а не «найди книгу с таким названием».
    const groupHit = needle && g.label.toLowerCase().includes(needle);
    // Записи библиотеки ищутся по обоим названиям: человек помнит либо то, что видит в списке,
    // либо настоящее из источника — заранее не угадать, какое именно.
    const items = !needle || groupHit ? g.items : g.items.filter(i => pickerItemMatches(i, needle));
    return { ...g, items, groupHit };
  }).filter(g => g.items.length > 0);

  return (
    <Modal open={open} onClose={onClose} title="Вставить объект" maxWidth="max-w-md">
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Название объекта или категории"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto lq-scroll space-y-1">
          {groups.length === 0 && <div className="text-sm text-zinc-600 py-4 text-center">Ничего не найдено.</div>}
          {groups.map(g => {
            // Во время поиска свёрнутость игнорируется: прятать найденное — ровно то, чего человек
            // не ждёт от поиска.
            const isOpen = needle ? true : !(collapsed || []).includes(g.alias);
            return (
              <div key={g.alias}>
                <button onClick={() => onToggleCollapse(g.alias)}
                  className="w-full flex items-center gap-1.5 px-1 py-1 text-left text-zinc-400 hover:text-zinc-200 transition">
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />}
                  <span className="text-[11px] uppercase tracking-wide flex-1">{g.label}</span>
                  <span className="text-[10px] font-data text-zinc-600">{g.items.length}</span>
                </button>
                {isOpen && (
                  <div className="space-y-0.5 pl-5">
                    {g.items.map(i => (
                      <button key={i.id} onClick={() => { onPick(embedSyntax(g.alias, i.name)); onClose(); }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition">
                        <div className="text-sm text-zinc-300 truncate">{i.name}</div>
                        {i.alt && <div className="text-[10px] text-zinc-600 truncate">{i.alt}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-zinc-600">
          Вставится строкой вида <span className="font-data text-zinc-500">![[сфера:Здоровье]]</span>. Набор полей потом настраивается на самой карточке.
        </div>
      </div>
    </Modal>
  );
}

// Выбор папки-получателя. Используется и переносом заметки, и переносом ветки — во втором случае
// список целей урезан canMoveFolder: папку нельзя положить внутрь себя самой или своего потомка.
function NoteFolderPicker({ folders, value, onChange, excludeFolderId, label }) {
  const options = [{ id: "", name: "Корень", depth: 0 }];
  function walk(parentId, depth) {
    childFolders(folders, parentId).forEach(f => {
      if (excludeFolderId && !canMoveFolder(folders, excludeFolderId, f.id)) return;
      options.push({ id: f.id, name: f.name, depth });
      walk(f.id, depth + 1);
    });
  }
  walk(null, 1);
  return (
    <div>
      {label && <label className="block text-xs text-zinc-500 mb-1">{label}</label>}
      <select value={value || ""} onChange={e => onChange(e.target.value || null)}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200">
        {options.map(o => <option key={o.id || "root"} value={o.id}>{"\u00A0".repeat(o.depth * 3)}{o.depth ? "└ " : ""}{o.name}</option>)}
      </select>
    </div>
  );
}

function NoteFolderModal({ open, onClose, folders, initial, presetParent, onSubmit }) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(null);
  useEffect(() => {
    if (!open) return;
    setName((initial && initial.name) || "");
    setParentId(initial ? (initial.parentId || null) : (presetParent || null));
  }, [open, initial, presetParent]);
  function submit() {
    const n = name.trim();
    if (!n) return;
    onSubmit({ name: n.slice(0, NOTE_MAX_TITLE), parentId: parentId || null });
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Переименовать папку" : "Новая папка"} maxWidth="max-w-md">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Название</label>
          <input autoFocus className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
            value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="Например, Работа" />
        </div>
        <NoteFolderPicker folders={folders} value={parentId} onChange={setParentId}
          excludeFolderId={initial ? initial.id : null} label="Внутри папки" />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={submit}>{initial ? "Сохранить" : "Создать"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function NoteMoveModal({ open, onClose, folders, title, currentParent, excludeFolderId, onMove }) {
  const [target, setTarget] = useState(null);
  useEffect(() => { if (open) setTarget(currentParent || null); }, [open, currentParent]);
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="space-y-3">
        <NoteFolderPicker folders={folders} value={target} onChange={setTarget} excludeFolderId={excludeFolderId} label="Переместить в" />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={() => { onMove(target || null); onClose(); }}>Переместить</Button>
        </div>
      </div>
    </Modal>
  );
}

function NoteTreeRow({ note, active, onSelect, onDragStart }) {
  return (
    <button draggable onDragStart={onDragStart} onClick={onSelect}
      className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left transition ${active ? "bg-amber-500/15 text-amber-200" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"}`}>
      <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
      <span className="text-xs truncate flex-1">{noteTitleOf(note)}</span>
      {note.pinned && <Pin className="w-3 h-3 shrink-0 text-amber-500/70" />}
    </button>
  );
}

function NoteTreeFolder({ folder, depth, state, prefs, actions, selectedId, onSelectNote, onNewNote, onNewFolder, onRename, onMove, onDownload, dragItem, setDragItem, onDropInto }) {
  const folders = state.noteFolders || [];
  const expanded = (prefs.expanded || []).includes(folder.id);
  const [dropActive, setDropActive] = useState(false);
  const kids = childFolders(folders, folder.id);
  const notes = sortNotesList(notesInFolder(state.notes, folder.id), prefs.sort);
  const count = folderNoteCount(state, folder.id, true);

  function handleDrop(e) {
    e.preventDefault(); e.stopPropagation();
    setDropActive(false);
    onDropInto(folder.id);
  }
  // Приём брошенного висит на ВСЕЙ ветке, а не только на строке заголовка: иначе бросок на
  // заметку внутри папки проваливался бы сквозь неё в корневую зону и молча уносил заметку в
  // корень. Вложенная папка перехватывает событие первой (stopPropagation), поэтому вложенность
  // разбирается сама собой. Подсветка при этом остаётся на заголовке — подсвечивать поддерево
  // целиком слишком шумно.
  return (
    <div
      onDragOver={e => { if (dragItem) { e.preventDefault(); e.stopPropagation(); setDropActive(true); } }}
      onDragLeave={e => { e.stopPropagation(); setDropActive(false); }}
      onDrop={handleDrop}>
      <div
        className={`group flex items-center gap-1 rounded-lg pr-1 ${dropActive ? "bg-amber-500/15 ring-1 ring-amber-500/40" : ""}`}
        style={{ paddingLeft: depth * 12 }}>
        <button
          draggable
          onDragStart={e => { e.stopPropagation(); setDragItem({ kind: "folder", id: folder.id }); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => setDragItem(null)}
          onClick={() => actions.toggleNoteFolderExpanded(folder.id)}
          className="flex-1 min-w-0 flex items-center gap-1.5 px-1 py-1 text-left text-zinc-300 hover:text-zinc-100 transition">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-zinc-600" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-zinc-600" />}
          {expanded ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-500/80" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500/80" />}
          <span className="text-xs truncate flex-1">{folder.name}</span>
          {count > 0 && <span className="text-[10px] text-zinc-600 font-data shrink-0">{count}</span>}
        </button>
        <div className="opacity-0 group-hover:opacity-100 transition shrink-0">
          <KebabMenu items={[
            { label: "Новая заметка", icon: FilePlus, onClick: () => onNewNote(folder.id) },
            { label: "Новая подпапка", icon: FolderPlus, onClick: () => onNewFolder(folder.id) },
            { label: "Переименовать", icon: Pencil, onClick: () => onRename(folder) },
            { label: "Переместить", icon: ArrowRight, onClick: () => onMove(folder) },
            { label: "Скачать ветку (.zip)", icon: Download, onClick: () => onDownload(folder) },
            { divider: true },
            { label: "Удалить с содержимым", icon: Trash2, onClick: () => actions.deleteNoteFolder(folder.id), danger: true },
          ]} buttonClassName="p-1 rounded text-zinc-600 hover:text-zinc-300" />
        </div>
      </div>
      {expanded && (
        <div>
          {kids.map(f => (
            <NoteTreeFolder key={f.id} folder={f} depth={depth + 1} state={state} prefs={prefs} actions={actions}
              selectedId={selectedId} onSelectNote={onSelectNote} onNewNote={onNewNote} onNewFolder={onNewFolder}
              onRename={onRename} onMove={onMove} onDownload={onDownload}
              dragItem={dragItem} setDragItem={setDragItem} onDropInto={onDropInto} />
          ))}
          <div style={{ paddingLeft: (depth + 1) * 12 + 6 }}>
            {notes.map(n => (
              <NoteTreeRow key={n.id} note={n} active={n.id === selectedId} onSelect={() => onSelectNote(n.id)}
                onDragStart={e => { e.stopPropagation(); setDragItem({ kind: "note", id: n.id }); e.dataTransfer.effectAllowed = "move"; }} />
            ))}
            {!kids.length && !notes.length && <div className="text-[11px] text-zinc-700 px-2 py-1">Пусто</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// Подписи рядом с иконками — не украшение: если в установленной версии lucide какой-то иконки
// не окажется, импорт молча вернёт undefined и кнопка сломает весь рендер. Текстовая подпись
// подхватывается вместо отсутствующей иконки и оставляет панель рабочей.
const NOTE_TOOLBAR_GROUPS = [
  [
    { id:"bold",   icon:Bold,          label:"Ж",   title:"Жирный (Ctrl+B)" },
    { id:"italic", icon:Italic,        label:"К",   title:"Курсив (Ctrl+I)" },
    { id:"strike", icon:Strikethrough, label:"S",   title:"Зачёркнутый" },
    { id:"mark",   icon:Highlighter,   label:"В",   title:"Выделить маркером" },
    { id:"code",   icon:Code,          label:"</>", title:"Код в строке (Ctrl+E)" },
  ],
  [
    { id:"h1", icon:Heading1, label:"H1", title:"Заголовок 1" },
    { id:"h2", icon:Heading2, label:"H2", title:"Заголовок 2" },
    { id:"h3", icon:Heading3, label:"H3", title:"Заголовок 3" },
  ],
  [
    { id:"ul",        icon:List,        label:"•",    title:"Маркированный список" },
    { id:"ol",        icon:ListOrdered, label:"1.",   title:"Нумерованный список" },
    { id:"todo",      icon:ListChecks,  label:"[ ]",  title:"Список дел" },
    { id:"quote",     icon:Quote,       label:">",    title:"Цитата" },
    { id:"codeblock", icon:FileCode,    label:"```",  title:"Блок кода" },
    { id:"hr",        icon:Minus,       label:"—",    title:"Разделитель" },
  ],
  [
    { id:"link", icon:Link2,    label:"URL",  title:"Ссылка (Ctrl+K)" },
    { id:"wiki", icon:FileText, label:"[[ ]]", title:"Ссылка на заметку" },
    { id:"embed", icon:Boxes,   label:"![[ ]]", title:"Вставить объект: человека, сферу, книгу" },
  ],
];

function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" && window.visualViewport;
    if (!vv) return;
    const update = () => setInset(keyboardInsetOf(window.innerHeight, vv.height, vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, []);
  return inset;
}

// Панель висит поверх текста у нижнего края поля ввода, а не занимает строку сверху: кнопка
// нужна там, где рука, а не там, где заголовок.
//   • на широком экране — absolute внутри области ввода: панель едет вместе с карточкой;
//   • на телефоне — fixed с поправкой на клавиатуру, иначе она оказывается ровно под ней, то есть
//     невидимой именно в тот момент, когда набирают текст.
// Ряд не переносится, а прокручивается вбок: так высота панели постоянна, и отступ снизу у поля
// ввода можно задать один раз, не подгоняя его под ширину экрана.
function NoteToolbar({ onAction, fixed, bottomOffset }) {
  return (
    <div
      className={`${fixed ? "fixed left-0 right-0" : "absolute left-0 right-0"} z-20 flex justify-center px-2 pointer-events-none`}
      style={fixed ? { bottom: (bottomOffset || 0) + 8 } : { bottom: 8 }}>
      <div className="pointer-events-auto max-w-full flex items-center gap-0.5 overflow-x-auto lq-scroll rounded-xl border border-zinc-700 bg-zinc-900/95 backdrop-blur px-1.5 py-1 shadow-lg shadow-black/50">
        {NOTE_TOOLBAR_GROUPS.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && <div className="w-px h-4 bg-zinc-800 mx-1.5 shrink-0" />}
            {/* onMouseDown с preventDefault обязателен: без него клик по кнопке сначала уводит
                фокус из поля ввода и сбрасывает выделение — то есть ровно то, к чему кнопка и
                применяется. */}
            {group.map(b => (
              <button key={b.id} type="button" title={b.title}
                onMouseDown={e => e.preventDefault()}
                onClick={() => onAction(b.id)}
                className="h-7 min-w-[28px] px-1.5 shrink-0 rounded-lg flex items-center justify-center text-zinc-400 hover:text-amber-300 hover:bg-zinc-800 transition">
                {b.icon ? <b.icon className="w-4 h-4" /> : <span className="text-[11px] font-data leading-none">{b.label}</span>}
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function NoteEditor({ note, state, actions, onBack, onSelectNote, onOpenTag, isDesktop, navigate }) {
  const folders = state.noteFolders || [];
  const prefs = { ...defaultNotesPrefs(), ...((state.uiPrefs && state.uiPrefs.notes) || {}) };
  const [body, setBody] = useState(note.body || "");
  const [title, setTitle] = useState(note.title || "");
  const [moveOpen, setMoveOpen] = useState(false);
  // Компонент монтируется заново на каждую заметку (key={note.id} у вызывающей стороны), поэтому
  // отдельная синхронизация черновика при смене заметки не нужна — и не может рассинхрониться.
  const savedRef = useRef({ body: note.body || "", title: note.title || "" });
  const latestRef = useRef({ body: note.body || "", title: note.title || "" });
  latestRef.current = { body, title };
  // actions — обычный объект, пересобираемый на каждом рендере App. Если положить его в
  // зависимости useCallback, commitDraft будет новым каждый рендер, дебаунс станет сбрасываться
  // без конца, а эффект-«дописать при уходе» начнёт срабатывать после каждого рендера — то есть
  // сохранение поедет на каждую букву, ровно то, от чего мы уходили. Держим в ref.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const taRef = useRef(null);
  const pendingSelRef = useRef(null);
  const embedCaretRef = useRef(0);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [fieldsTarget, setFieldsTarget] = useState(null);
  const keyboardInset = useKeyboardInset();
  const commitDraft = useCallback((b, t) => {
    if (b === savedRef.current.body && t === savedRef.current.title) return;
    savedRef.current = { body: b, title: t };
    actionsRef.current.updateNote(note.id, { body: b, title: t });
  }, [note.id]);

  // Набор текста не пишет состояние на каждое нажатие: черновик живёт локально, в общее состояние
  // (и, значит, в localStorage) уезжает через паузу. Иначе каждая буква пересериализовывала бы
  // всё сохранение целиком.
  useEffect(() => {
    const t = setTimeout(() => commitDraft(body, title), 800);
    return () => clearTimeout(t);
  }, [body, title, commitDraft]);
  // Уход с заметки (переключение, закрытие раздела) обязан дописать последнее — таймер до этого
  // момента мог не сработать, и без этого терялись бы последние секунды набора.
  useEffect(() => () => commitDraft(latestRef.current.body, latestRef.current.title), [commitDraft]);

  // Правка применяется точечной вставкой через штатный механизм браузера, а не заменой всего
  // текста: только так в поле ввода сохраняется собственная история отмены и Ctrl+Z продолжает
  // работать после нажатия кнопки на панели. Замена целиком её обнуляет.
  function applyEdit(res) {
    const ta = taRef.current;
    if (!ta || !res) return;
    ta.focus();
    ta.setSelectionRange(res.from, res.to);
    let inserted = false;
    try { inserted = !!(document.execCommand && document.execCommand("insertText", false, res.insert)); }
    catch (e) { inserted = false; }
    pendingSelRef.current = [res.selStart, res.selEnd];
    setBody(inserted ? ta.value : (ta.value.slice(0, res.from) + res.insert + ta.value.slice(res.to)));
  }
  function runAction(actionId) {
    const ta = taRef.current;
    if (!ta) return;
    // Вставка объекта — не преобразование текста, а выбор из списка: имя должно попасть в текст
    // ровно таким, какое оно сейчас, иначе встраивание не разрешится.
    if (actionId === "embed") { embedCaretRef.current = ta.selectionStart; setEmbedOpen(true); return; }
    applyEdit(applyMarkdownAction(ta.value, ta.selectionStart, ta.selectionEnd, actionId));
  }
  function onEditorKeyDown(e) {
    const ta = taRef.current;
    if (!ta) return;
    // Сочетания читаются по e.code, а не по e.key: на русской раскладке Ctrl+B — это буква «и»,
    // и проверка по символу молча перестала бы работать ровно у того, кто пишет по-русски.
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const id = { KeyB:"bold", KeyI:"italic", KeyK:"link", KeyE:"code" }[e.code];
      if (id) { e.preventDefault(); runAction(id); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && ta.selectionStart === ta.selectionEnd) {
      const res = continueListOnEnter(ta.value, ta.selectionStart);
      if (res) { e.preventDefault(); applyEdit(res); }
    }
  }
  // Выделение восстанавливается синхронно с отрисовкой — в обычном useEffect курсор успевает
  // мигнуть в конце текста.
  useLayoutEffect(() => {
    const p = pendingSelRef.current;
    if (!p) return;
    pendingSelRef.current = null;
    const ta = taRef.current;
    if (ta) { ta.focus(); ta.setSelectionRange(p[0], p[1]); }
  });

  const preview = !!prefs.preview;
  const toolbar = prefs.toolbar !== false;
  const tags = extractTags(body);
  const path = folderPathLabel(folders, note.folderId);

  function openWikiLink(name) {
    const target = (state.notes || []).find(n => noteTitleOf(n).toLowerCase() === name.toLowerCase());
    if (target) { commitDraft(body, title); onSelectNote(target.id); return; }
    // Ссылка в никуда создаёт заметку — это поведение Obsidian и главный способ растить базу:
    // сначала упоминаешь, потом наполняешь.
    const id = uid();
    commitDraft(body, title);
    actions.addNote({ id, title: name, body: "", folderId: note.folderId || null });
    onSelectNote(id);
  }
  // Настройка полей правит ту самую строку исходника — тем же способом, что и галочка в
  // просмотре. Текст остаётся единственным источником правды, отдельного хранилища настроек
  // виджетов не появляется.
  function openEmbedFields(line, found) {
    // В строку пишем то название, по которому объект и нашёлся: подменять его на другое из двух
    // значило бы менять текст заметки за человека.
    setFieldsTarget({ line, kind: found.kind, alias: found.alias, fields: found.fields, name: found.ref });
  }
  function applyEmbedFields(fields) {
    if (!fieldsTarget) return;
    const next = replaceEmbedLine(body, fieldsTarget.line, embedSyntax(fieldsTarget.alias, fieldsTarget.name, fields));
    setBody(next);
    commitDraft(next, title);
  }
  function toggleCheckbox(line) {
    const next = toggleMarkdownCheckbox(body, line);
    setBody(next);
    commitDraft(next, title);
  }
  function downloadOne() {
    const ok = downloadTextFile(buildNoteMarkdown({ ...note, body }), safeFileSegment(noteTitleOf({ ...note, title })) + ".md", "text/markdown;charset=utf-8");
    actions.notify(ok ? "Заметка скачана" : "Скачивание заблокировано браузером");
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-start gap-2 pb-2 border-b border-zinc-800">
        {!isDesktop && (
          <button onClick={() => { commitDraft(body, title); onBack(); }} className="mt-1 p-1 rounded text-zinc-500 hover:text-zinc-200 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-zinc-600 truncate flex items-center gap-1">
            <Folder className="w-3 h-3" />{path}
          </div>
          <input value={title} onChange={e => setTitle(e.target.value.slice(0, NOTE_MAX_TITLE))} placeholder="Без названия"
            className="w-full bg-transparent text-lg font-semibold text-zinc-100 outline-none placeholder:text-zinc-700" />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!preview && (
            <button onClick={() => actions.updateNotesPrefs({ toolbar: !toolbar })}
              title={toolbar ? "Скрыть панель форматирования" : "Показать панель форматирования"}
              className={`p-1.5 rounded-lg transition ${toolbar ? "bg-zinc-800 text-amber-300" : "text-zinc-500 hover:text-zinc-200"}`}>
              {Type ? <Type className="w-4 h-4" /> : <span className="text-[11px] font-data">Aa</span>}
            </button>
          )}
          <button onClick={() => actions.updateNotesPrefs({ preview: !preview })}
            className={`px-2 py-1 rounded-lg text-xs transition ${preview ? "bg-amber-500/15 text-amber-300" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
            {preview ? "Просмотр" : "Правка"}
          </button>
          <KebabMenu items={[
            { label: note.pinned ? "Открепить" : "Закрепить", icon: note.pinned ? PinOff : Pin, onClick: () => actions.toggleNotePinned(note.id) },
            { label: "Переместить", icon: ArrowRight, onClick: () => setMoveOpen(true) },
            { label: "Скачать (.md)", icon: Download, onClick: downloadOne },
            { divider: true },
            { label: "Удалить", icon: Trash2, onClick: () => { savedRef.current = { body, title }; actions.deleteNote(note.id); onBack(); }, danger: true },
          ]} />
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 py-2">
          {tags.map(t => (
            <button key={t} onClick={() => onOpenTag(t)}
              className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/25 hover:bg-sky-500/20 transition">#{t}</button>
          ))}
        </div>
      )}

      {/* pb-14 у поля ввода — отступ под саму панель: без него последние строки уезжают под неё
          и их не видно ровно там, где обычно и дописывают текст. */}
      <div className="flex-1 min-h-0 pt-2 relative">
        {preview ? (
          <div className="h-full overflow-y-auto lq-scroll pr-1">
            <MarkdownView text={body} onToggleCheckbox={toggleCheckbox} onOpenTag={onOpenTag} onOpenLink={openWikiLink}
              embedState={state} navigate={navigate} onConfigureEmbed={openEmbedFields} />
          </div>
        ) : (
          <textarea ref={taRef} value={body} onChange={e => setBody(e.target.value)} onKeyDown={onEditorKeyDown} spellCheck={false}
            placeholder={"# Заголовок\n\nТекст с **выделением**, ссылкой [[Другая заметка]] и тегом #идеи\n\n- [ ] пункт списка дел\n\n![[человек:Имя]] — карточка объекта"}
            className={`w-full h-full min-h-[320px] resize-none bg-transparent font-data text-sm text-zinc-300 leading-relaxed outline-none placeholder:text-zinc-700 ${toolbar ? "pb-14" : ""}`} />
        )}
        {!preview && toolbar && <NoteToolbar onAction={runAction} fixed={!isDesktop} bottomOffset={keyboardInset} />}
      </div>

      <div className="pt-2 text-[11px] text-zinc-600 font-data border-t border-zinc-800 flex items-center justify-between">
        <span>{body.length} симв.</span>
        <span>изменено {fmtDateWithYear(note.updatedAt || note.createdAt)}</span>
      </div>

      <NoteMoveModal open={moveOpen} onClose={() => setMoveOpen(false)} folders={folders}
        title="Переместить заметку" currentParent={note.folderId}
        onMove={(target) => actions.updateNote(note.id, { folderId: target })} />

      <NoteEmbedPicker open={embedOpen} onClose={() => setEmbedOpen(false)} state={state}
        collapsed={prefs.pickerCollapsed}
        onToggleCollapse={(alias) => {
          const list = prefs.pickerCollapsed || [];
          actions.updateNotesPrefs({ pickerCollapsed: list.includes(alias) ? list.filter(a => a !== alias) : [...list, alias] });
        }}
        onPick={(snippet) => applyEdit(insertEmbedEdit(taRef.current ? taRef.current.value : body, embedCaretRef.current, snippet))} />

      <NoteEmbedFieldsModal open={!!fieldsTarget} onClose={() => setFieldsTarget(null)}
        target={fieldsTarget} onApply={applyEmbedFields} />
    </div>
  );
}

export function NotesView({ state, actions, focus, setFocus, navigate }) {
  const isDesktop = useIsDesktop();
  const prefs = { ...defaultNotesPrefs(), ...((state.uiPrefs && state.uiPrefs.notes) || {}) };
  const folders = state.noteFolders || [];
  const [selectedId, setSelectedId] = useState(prefs.lastNoteId || null);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState([]);
  const [folderModal, setFolderModal] = useState(null);   // { initial } | { presetParent }
  const [moveFolder, setMoveFolder] = useState(null);
  const [dragItem, setDragItem] = useState(null);
  const [rootDrop, setRootDrop] = useState(false);
  const [showTags, setShowTags] = useState(false);

  // Явный переход извне (например, «открыть заметку» из другого раздела) перекрывает
  // восстановленный выбор — тот же приём, что в Библиотеке.
  useEffect(() => { if (focus) { setSelectedId(focus); setFocus(null); } }, [focus, setFocus]);

  const selected = (state.notes || []).find(n => n.id === selectedId) || null;
  useEffect(() => {
    const next = selected ? selected.id : null;
    if ((prefs.lastNoteId || null) !== next) actions.updateNotesPrefs({ lastNoteId: next });
  }, [selected && selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tagCloud = useMemo(() => allNoteTags(state.notes), [state.notes]);
  const searching = query.trim().length > 0 || activeTags.length > 0;
  const results = useMemo(() => (searching ? searchNotes(state, query, activeTags) : null), [state, query, activeTags, searching]);

  function newNote(folderId) {
    const id = uid();
    actions.addNote({ id, title: "", body: "", folderId: folderId || null });
    setSelectedId(id);
    if (folderId && !(prefs.expanded || []).includes(folderId)) actions.toggleNoteFolderExpanded(folderId);
  }
  function handleDropInto(folderId) {
    if (!dragItem) return;
    if (dragItem.kind === "note") actions.updateNote(dragItem.id, { folderId: folderId || null });
    else actions.moveNoteFolder(dragItem.id, folderId || null);
    setDragItem(null);
  }
  function downloadBranch(folder) {
    const files = buildBranchFiles(state, folder ? folder.id : null);
    if (!files.length) { actions.notify("В этой ветке пока нет заметок"); return; }
    const name = safeFileSegment(folder ? folder.name : "Заметки") + ".zip";
    const ok = downloadBinaryFile(zipStore(files), name, "application/zip");
    actions.notify(ok ? `Скачано файлов: ${files.length}` : "Скачивание заблокировано браузером");
  }
  function toggleTag(tag) {
    setActiveTags(list => list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag]);
  }

  const rootNotes = sortNotesList(notesInFolder(state.notes, null), prefs.sort);
  const rootFolders = childFolders(folders, null);

  const sidebar = (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-1.5 pb-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по заметкам и папкам"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600" />
          {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <button onClick={() => newNote(null)} title="Новая заметка" className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-amber-300 transition"><FilePlus className="w-4 h-4" /></button>
        <button onClick={() => setFolderModal({ presetParent: null })} title="Новая папка" className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-amber-300 transition"><FolderPlus className="w-4 h-4" /></button>
      </div>

      {tagCloud.length > 0 && (
        <div className="pb-2">
          <button onClick={() => setShowTags(v => !v)} className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300">
            <Hash className="w-3 h-3" />Теги ({tagCloud.length}){activeTags.length > 0 && <span className="text-sky-400">· выбрано {activeTags.length}</span>}
            {showTags ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {(showTags || activeTags.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tagCloud.map(({ tag, count }) => {
                const on = activeTags.includes(tag);
                return (
                  <button key={tag} onClick={() => toggleTag(tag)}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition ${on ? "bg-sky-500/25 text-sky-200 border-sky-500/50" : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"}`}>
                    #{tag}<span className="text-zinc-600 ml-1 font-data">{count}</span>
                  </button>
                );
              })}
              {activeTags.length > 0 && <button onClick={() => setActiveTags([])} className="text-[11px] px-2 py-0.5 text-zinc-500 hover:text-zinc-300">сбросить</button>}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto lq-scroll -mr-1 pr-1">
        {searching ? (
          <div className="space-y-1">
            {results.folders.length > 0 && (
              <div className="pb-1">
                <div className="text-[10px] uppercase tracking-wide text-zinc-600 px-1 py-1">Папки</div>
                {results.folders.map(f => (
                  <button key={f.id} onClick={() => { setQuery(""); if (!(prefs.expanded || []).includes(f.id)) actions.toggleNoteFolderExpanded(f.id); }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200">
                    <Folder className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
                    <span className="text-xs truncate">{folderPathLabel(folders, f.id)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="text-[10px] uppercase tracking-wide text-zinc-600 px-1 py-1">Заметки ({results.notes.length})</div>
            {results.notes.length === 0 && <div className="text-xs text-zinc-600 px-2 py-2">Ничего не найдено.</div>}
            {results.notes.map(({ note, snippet }) => (
              <button key={note.id} onClick={() => setSelectedId(note.id)}
                className={`w-full text-left px-2 py-1.5 rounded-lg transition ${note.id === selectedId ? "bg-amber-500/15" : "hover:bg-zinc-800/60"}`}>
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 shrink-0 text-zinc-600" />
                  <span className="text-xs text-zinc-200 truncate flex-1">{noteTitleOf(note)}</span>
                </div>
                <div className="text-[10px] text-zinc-600 truncate pl-5">{folderPathLabel(folders, note.folderId)}</div>
                {snippet && <div className="text-[11px] text-zinc-500 pl-5" style={{ display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{snippet}</div>}
              </button>
            ))}
          </div>
        ) : (
          <div
            onDragOver={e => { if (dragItem) { e.preventDefault(); setRootDrop(true); } }}
            onDragLeave={() => setRootDrop(false)}
            onDrop={e => { e.preventDefault(); setRootDrop(false); handleDropInto(null); }}
            className={`min-h-full rounded-lg ${rootDrop ? "bg-amber-500/10 ring-1 ring-amber-500/30" : ""}`}>
            {rootFolders.map(f => (
              <NoteTreeFolder key={f.id} folder={f} depth={0} state={state} prefs={prefs} actions={actions}
                selectedId={selectedId} onSelectNote={setSelectedId}
                onNewNote={newNote} onNewFolder={(pid) => setFolderModal({ presetParent: pid })}
                onRename={(folder) => setFolderModal({ initial: folder })}
                onMove={(folder) => setMoveFolder(folder)}
                onDownload={downloadBranch}
                dragItem={dragItem} setDragItem={setDragItem} onDropInto={handleDropInto} />
            ))}
            <div className="pt-1">
              {rootNotes.map(n => (
                <NoteTreeRow key={n.id} note={n} active={n.id === selectedId} onSelect={() => setSelectedId(n.id)}
                  onDragStart={e => { setDragItem({ kind: "note", id: n.id }); e.dataTransfer.effectAllowed = "move"; }} />
              ))}
            </div>
            {!rootFolders.length && !rootNotes.length && (
              <div className="text-xs text-zinc-600 px-2 py-6 text-center">Пока пусто. Создай первую заметку или папку.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const editorPane = selected ? (
    <NoteEditor key={selected.id} note={selected} state={state} actions={actions} navigate={navigate}
      onBack={() => setSelectedId(null)} onSelectNote={setSelectedId}
      onOpenTag={(t) => { setActiveTags([t]); setQuery(""); if (!isDesktop) setSelectedId(null); }}
      isDesktop={isDesktop} />
  ) : (
    <EmptyState icon={FileText} title="Заметка не выбрана"
      subtitle="Выбери заметку слева или создай новую. Поддерживается markdown, теги через #, ссылки через [[двойные скобки]]."
      action={<Button onClick={() => newNote(null)}><Plus className="w-4 h-4 mr-1" />Новая заметка</Button>} />
  );

  return (
    <div className="space-y-4">
      <SectionHeader eyebrow="Личное" title="Заметки" action={
        <KebabMenu items={[
          { label: "Скачать все (.zip)", icon: Download, onClick: () => downloadBranch(null) },
          { label: "Сортировка: по изменению", icon: prefs.sort === "updated" ? Check : Sliders, onClick: () => actions.updateNotesPrefs({ sort: "updated" }) },
          { label: "Сортировка: по названию", icon: prefs.sort === "title" ? Check : Sliders, onClick: () => actions.updateNotesPrefs({ sort: "title" }) },
          { label: "Сортировка: по созданию", icon: prefs.sort === "created" ? Check : Sliders, onClick: () => actions.updateNotesPrefs({ sort: "created" }) },
        ]} />
      } />

      {isDesktop ? (
        <Card className="p-4 flex gap-4" style={{ height: "calc(100vh - 190px)" }}>
          <div className="shrink-0 border-r border-zinc-800 pr-3" style={{ width: 300 }}>{sidebar}</div>
          <div className="flex-1 min-w-0 flex flex-col min-h-0">{editorPane}</div>
        </Card>
      ) : (
        <Card className="p-4 flex flex-col" style={{ height: "calc(100vh - 190px)" }}>
          {selected ? editorPane : sidebar}
        </Card>
      )}

      <NoteFolderModal open={!!folderModal} onClose={() => setFolderModal(null)} folders={folders}
        initial={folderModal && folderModal.initial} presetParent={folderModal && folderModal.presetParent}
        onSubmit={(data) => {
          if (folderModal && folderModal.initial) actions.updateNoteFolder(folderModal.initial.id, data);
          else actions.addNoteFolder({ id: uid(), ...data });
        }} />

      <NoteMoveModal open={!!moveFolder} onClose={() => setMoveFolder(null)} folders={folders}
        title="Переместить папку" currentParent={moveFolder && moveFolder.parentId}
        excludeFolderId={moveFolder && moveFolder.id}
        onMove={(target) => actions.moveNoteFolder(moveFolder.id, target)} />
    </div>
  );
}

export function NotesList({ notes, onAdd, onDelete, onEdit }) {
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  function startEdit(n) { setEditingId(n.id); setDraft(n.text); }
  function saveEdit() {
    const t = draft.trim();
    // Пустая заметка — не заметка: сохранять её нельзя, но и терять набранное молча тоже, поэтому
    // просто ничего не делаем и оставляем поле открытым.
    if (!t) return;
    onEdit(editingId, t);
    setEditingId(null);
  }
  function submit() {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
  }
  const ordered = (notes||[]).slice().reverse();
  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-start">
        <textarea className={inputCls} rows={2} value={text} onChange={e=>setText(e.target.value)} placeholder="Тезис, цитата или мысль..." />
        <Button variant="secondary" onClick={submit}><Plus className="w-4 h-4"/></Button>
      </div>
      {ordered.length === 0 ? (
        <div className="text-sm text-zinc-500">Пока нет заметок.</div>
      ) : (
        <div className="space-y-2">
          {ordered.map(n => (
            <div key={n.id} className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2 flex items-start gap-2">
              {editingId === n.id ? (
                <div className="flex-1 min-w-0 space-y-2">
                  <textarea autoFocus className={inputCls} rows={3} value={draft} onChange={e=>setDraft(e.target.value)} />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Отмена</Button>
                    <Button size="sm" onClick={saveEdit}>Сохранить</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 whitespace-pre-wrap">{n.text}</div>
                    <div className="text-xs text-zinc-600 mt-1 font-data">{fmtDateShort(n.date)}</div>
                  </div>
                  {onEdit && (
                    <button onClick={() => startEdit(n)} className="text-zinc-600 hover:text-amber-400 shrink-0"><Pencil className="w-3.5 h-3.5"/></button>
                  )}
                  <button onClick={() => onDelete(n.id)} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
