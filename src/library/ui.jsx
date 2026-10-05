// Интерфейс библиотеки: списки и карточки книг, игр и фильмов, а также коллекции — ветки,
// лента и всё, что их показывает. Модель лежит рядом, в library/constants.js и collections.js.

import { LibraryTitle } from "./title.jsx";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Check, ChevronLeft, ChevronRight, CornerDownRight, ExternalLink, Eye, EyeOff,
  GitBranch, GripVertical, Layers, LayoutGrid, List, Pencil, Plus, Repeat, Search, Share2,
  Sparkles, Target, Trash2, Trophy, X,
} from "lucide-react";
import { addDaysToDateStr, clamp, daysBetween, todayStr } from "../core/basics.js";
import { fmtDateWithYear } from "../core/format.js";
import { imagePosStyle } from "../core/images.js";
import {
  COLLECTION_MAIN_BRANCH, assignBranchOrder, branchNameOf, canAnchorBranch, canPlaceItemInBranch,
  collectionBranches, collectionById, collectionKindCounts, collectionProgress, collectionRefs,
  collectionStrip, collectionTree, itemCollection, refBranchId, reorderBranchList, reorderRefs,
} from "./collections.js";
import {
  LIBRARY_IMPACT, LIBRARY_KINDS, LIBRARY_KIND_ORDER, LIBRARY_SORT_COMMON, LIBRARY_SORT_EXTRA,
  LIBRARY_STATUS_COLOR, LIBRARY_STATUS_ORDER, libraryDisplayTitle, libraryItemTypeLabel,
  librarySeriesSuffix, libraryStatusLabel, sortLibraryItems, libraryPickerItem,
} from "./constants.js";
import { LibraryCover } from "./cover.jsx";
import { pickerItemMatches } from "../notes/model.js";
import { NotesList } from "../notes/ui.jsx";
import { ShareButtons, ShareExportModal, ShareImportModal } from "../share/ui.jsx";
import {
  Button, Card, EmptyState, KebabMenu, Modal, ProgressBar, SectionHeader, StarRating,
  StickyAddButton, inputCls, labelCls,
} from "../ui/atoms.jsx";
import { defaultEmojiAssignments, defaultEmojiPools } from "../ui/emoji-pools.js";
import { CoverPickerModal, CoverPreviewButton, EmojiPickerModal } from "../ui/pickers.jsx";
import { pal } from "../ui/theme.js";

// Статус кликабелен везде, где показан — открывает нативный список вариантов (работает
// одинаково на десктопе и на телефоне, без своей всплывашки). Смена статуса тут — просто
// правка поля, XP не начисляет: единственный способ получить награду — кнопка "Завершить".
function LibraryStatusBadge({ kind, status, onChange }) {
  const c = pal(LIBRARY_STATUS_COLOR[status]);
  return (
    <select value={status} onChange={e => onChange(e.target.value)}
      className={`text-xs pl-2 pr-1 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500/50 ${c.bgSoft} ${c.text}`}>
      {LIBRARY_STATUS_ORDER.map(s => <option key={s} value={s} className="bg-zinc-900 text-zinc-200">{libraryStatusLabel(kind, s)}</option>)}
    </select>
  );
}

// Маленькая кнопка-маркер рядом с полем: показывается только если поле было отредактировано
// руками и разошлось с последним найденным через поиск значением. Клик — перезаполнить и
// снова включить автослежение за этим полем.
function AutofillHint({ onClick }) {
  return (
    <button type="button" onClick={onClick} title="Обновить из найденных данных" className="absolute text-amber-400 hover:text-amber-300" style={{ right:10, top:"50%", transform:"translateY(-50%)" }}>
      <Repeat className="w-3.5 h-3.5" />
    </button>
  );
}

function LibraryItemForm({ kind, spheres, initial, apiKeys, librarySources, emojiPools, emojiAssignments, onAddPoolEmoji, onRemovePoolEmoji, onSubmit, onCancel }) {
  const meta = LIBRARY_KINDS[kind];
  const [title, setTitle] = useState((initial && initial.title) || "");
  // Отображаемое название — всегда только руками, автозаполнение из источников его не трогает
  // (в отличие от title, который автослежение перезаписывает).
  const [displayTitle, setDisplayTitle] = useState((initial && initial.displayTitle) || "");
  const [coverEmoji, setCoverEmoji] = useState((initial && initial.coverEmoji) || meta.defaultEmoji);
  const [coverImage, setCoverImage] = useState((initial && initial.coverImage) || null);
  const [coverPos, setCoverPos] = useState((initial && initial.coverPos) || null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [status, setStatus] = useState((initial && initial.status) || "want");
  const [rating, setRating] = useState((initial && initial.rating) || 0);
  const [sphereId, setSphereId] = useState((initial && initial.sphereId) || "");
  const [impact, setImpact] = useState((initial && initial.impact) || "noticeable");
  const [manualReward, setManualReward] = useState(!!(initial && initial.manualReward));
  const [rewardXp, setRewardXp] = useState((initial && initial.rewardXp) || LIBRARY_IMPACT.noticeable.xp);
  const [pagesRead, setPagesRead] = useState((initial && initial.pagesRead) || 0);
  const [pagesTotal, setPagesTotal] = useState((initial && initial.pagesTotal) || 0);
  const [hours, setHours] = useState((initial && initial.hours) || 0);
  const [achievementsGot, setAchievementsGot] = useState((initial && initial.achievementsGot) || 0);
  const [achievementsTotal, setAchievementsTotal] = useState((initial && initial.achievementsTotal) || 0);
  const [movieKind, setMovieKind] = useState((initial && initial.kind) || "movie");
  const [episodesTotal, setEpisodesTotal] = useState((initial && initial.episodesTotal) || 0);
  const [episodeAt, setEpisodeAt] = useState((initial && initial.episodeAt) || 0);
  const [productUrl, setProductUrl] = useState((initial && initial.productUrl) || "");

  // Маркеры автозаполнения: пока поле не тронуто руками (true), оно продолжает подстраиваться
  // под каждый новый выбор в поиске — не только под первый. lastPick — последние данные,
  // подобранные из источника, чтобы можно было сравнить с текущим (отредактированным) значением
  // и показать значок «обновить», если они разошлись (только для уже созданных записей —
  // при первом создании это не нужно, initial ещё нет).
  const [autoTitle, setAutoTitle] = useState(!(initial && initial.title));
  const [autoPagesTotal, setAutoPagesTotal] = useState(!(initial && initial.pagesTotal));
  const [autoEpisodesTotal, setAutoEpisodesTotal] = useState(!(initial && initial.episodesTotal));
  const [lastPick, setLastPick] = useState(null);

  useEffect(() => {
    if (!manualReward) setRewardXp(LIBRARY_IMPACT[impact].xp);
  }, [impact, manualReward]);

  function handlePick(v, pmeta) {
    setCoverImage(v);
    // Новая картинка — новая геометрия: прежняя точка кадрирования к ней отношения не имеет.
    setCoverPos(null);
    if (!pmeta) return;
    setLastPick(pmeta);
    if (pmeta.name) { if (autoTitle) setTitle(pmeta.name); }
    if (kind==="book" && pmeta.pagesTotal) { if (autoPagesTotal) setPagesTotal(pmeta.pagesTotal); }
    if (kind==="movie") {
      if (pmeta.isSeries) setMovieKind("series");
      if (pmeta.episodesTotal && autoEpisodesTotal) setEpisodesTotal(pmeta.episodesTotal);
    }
  }

  function submit() {
    if (!title.trim()) return;
    const base = { title: title.trim(), displayTitle: displayTitle.trim() || null, coverEmoji, coverImage, coverPos, status, rating, sphereId: sphereId || null, impact, manualReward, rewardXp: Number(rewardXp)||0, productUrl: productUrl.trim() || null };
    let extra = {};
    if (kind==="book") extra = { pagesRead: Number(pagesRead)||0, pagesTotal: Number(pagesTotal)||0 };
    if (kind==="game") extra = { hours: Number(hours)||0, achievementsGot: Number(achievementsGot)||0, achievementsTotal: Number(achievementsTotal)||0 };
    if (kind==="movie") extra = { kind: movieKind, episodesTotal: movieKind==="series" ? Number(episodesTotal)||0 : 0, episodeAt: movieKind==="series" ? Number(episodeAt)||0 : 0 };
    onSubmit({ ...base, ...extra });
  }

  const titleMismatch = !autoTitle && lastPick && lastPick.name && lastPick.name !== title;
  const pagesMismatch = kind==="book" && !autoPagesTotal && lastPick && lastPick.pagesTotal && Number(pagesTotal)!==Number(lastPick.pagesTotal);
  const episodesMismatch = kind==="movie" && !autoEpisodesTotal && lastPick && lastPick.episodesTotal && Number(episodesTotal)!==Number(lastPick.episodesTotal);

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div>
          <CoverPreviewButton rect onClick={() => setCoverPickerOpen(true)}>
            {coverImage ? <img src={coverImage} className="w-full h-full object-cover" style={imagePosStyle(coverPos)} alt="" /> : coverEmoji}
          </CoverPreviewButton>
          <CoverPickerModal open={coverPickerOpen} onClose={() => setCoverPickerOpen(false)} kind={kind}
            emoji={coverEmoji} onPickEmoji={(v) => { setCoverEmoji(v); setCoverImage(null); }}
            imageUrl={coverImage} onPickImage={handlePick}
            imagePos={coverPos} onPickPos={setCoverPos}
            apiKeys={apiKeys}
            sourcesEnabled={librarySources}
            titleValue={title} onTitleChange={(v) => { if (autoTitle) setTitle(v); }}
            emojiPools={emojiPools} emojiAssignments={emojiAssignments}
            onAddPoolEmoji={onAddPoolEmoji} onRemovePoolEmoji={onRemovePoolEmoji}
          />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="relative">
            <input className={inputCls} style={titleMismatch ? { paddingRight:36 } : undefined} value={title} onChange={e => { setTitle(e.target.value); setAutoTitle(false); }} placeholder="Название" autoFocus />
            {titleMismatch && <AutofillHint onClick={() => { setTitle(lastPick.name); setAutoTitle(true); }} />}
          </div>
          <div>
            <input className={inputCls} value={displayTitle} onChange={e => setDisplayTitle(e.target.value)} placeholder="Отображаемое название (необязательно)" />
            <div className="text-[11px] text-zinc-600 mt-1">Если задано — показывается вместо настоящего названия везде в списках; настоящее не потеряется, просто уйдёт мелким текстом под ним.</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select className={inputCls} style={{ width:"auto" }} value={status} onChange={e=>setStatus(e.target.value)}>
              {LIBRARY_STATUS_ORDER.map(s => <option key={s} value={s}>{libraryStatusLabel(kind, s)}</option>)}
            </select>
            <StarRating value={rating} onChange={setRating} sizePx={18} />
          </div>
          {kind==="movie" && (
            <div className="flex gap-2">
              <button type="button" onClick={()=>setMovieKind("movie")} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${movieKind==="movie" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>Фильм</button>
              <button type="button" onClick={()=>setMovieKind("series")} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${movieKind==="series" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>Сериал</button>
            </div>
          )}
        </div>
      </div>

      {kind==="book" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Страниц прочитано</label>
            <input type="number" min="0" max={Number(pagesTotal)>0 ? Number(pagesTotal) : undefined} className={inputCls} value={pagesRead} onChange={e=>setPagesRead(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Всего страниц</label>
            <div className="relative">
              <input type="number" min="0" className={inputCls} style={pagesMismatch ? { paddingRight:36 } : undefined} value={pagesTotal} onChange={e => { setPagesTotal(e.target.value); setAutoPagesTotal(false); }} />
              {pagesMismatch && <AutofillHint onClick={() => { setPagesTotal(lastPick.pagesTotal); setAutoPagesTotal(true); }} />}
            </div>
          </div>
        </div>
      )}

      {kind==="game" && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Часов наиграно</label>
            <input type="number" min="0" className={inputCls} value={hours} onChange={e=>setHours(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Ачивок получено</label>
              <input type="number" min="0" max={Number(achievementsTotal)>0 ? Number(achievementsTotal) : undefined} className={inputCls} value={achievementsGot} onChange={e=>setAchievementsGot(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Всего ачивок</label>
              <input type="number" min="0" className={inputCls} value={achievementsTotal} onChange={e=>setAchievementsTotal(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {kind==="movie" && movieKind==="series" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Серия, на которой остановились</label>
            <input type="number" min="0" max={Number(episodesTotal)>0 ? Number(episodesTotal) : undefined} className={inputCls} value={episodeAt} onChange={e=>setEpisodeAt(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Всего серий (если известно)</label>
            <div className="relative">
              <input type="number" min="0" className={inputCls} style={episodesMismatch ? { paddingRight:36 } : undefined} value={episodesTotal} onChange={e => { setEpisodesTotal(e.target.value); setAutoEpisodesTotal(false); }} />
              {episodesMismatch && <AutofillHint onClick={() => { setEpisodesTotal(lastPick.episodesTotal); setAutoEpisodesTotal(true); }} />}
            </div>
          </div>
        </div>
      )}


      <div>
        <label className={labelCls}>Сфера (необязательно)</label>
        <select className={inputCls} value={sphereId} onChange={e=>setSphereId(e.target.value)}>
          <option value="">Не привязано</option>
          {spheres.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {sphereId && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className={labelCls} style={{ marginBottom:0 }}>Награда при завершении</span>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={manualReward} onChange={e=>setManualReward(e.target.checked)} />
              Своя награда
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select className={inputCls} value={impact} onChange={e=>setImpact(e.target.value)} disabled={manualReward}>
              {Object.entries(LIBRARY_IMPACT).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className="relative">
              <Sparkles className="w-4 h-4 text-amber-400 absolute" style={{ left:12, top:"50%", transform:"translateY(-50%)" }} />
              <input type="number" min="0" disabled={!manualReward} className={inputCls + " disabled:opacity-60"} style={{ paddingLeft:36 }} value={rewardXp} onChange={e=>setRewardXp(e.target.value)} />
            </div>
          </div>
        </div>
      )}
      <div>
        <label className={labelCls}>Ссылка на продукт (необязательно)</label>
        <input className={inputCls} value={productUrl} onChange={e=>setProductUrl(e.target.value)} placeholder="https://..." />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>{initial ? "Сохранить" : "Добавить"}</Button>
      </div>
    </div>
  );
}

// Окно "уже 5 отслеживаемых" — предлагает заменить одно из текущих пятёрки на новое. tracked —
// массив { kind, item } по всей библиотеке сразу (лимит общий на книги/игры/фильмы, не по 5 на вид).
function TrackedReplaceModal({ open, onClose, tracked, newItem, onReplace }) {
  if (!newItem) return null;
  return (
    <Modal open={open} onClose={onClose} title="Уже 5 отслеживаемых">
      <div className="space-y-4">
        <div className="text-sm text-zinc-400">Одновременно можно отслеживать не больше 5 — они и попадают в «Сейчас в процессе» на Хабе. Выбери, кого заменить на «{libraryDisplayTitle(newItem.item)}»:</div>
        <div className="space-y-2">
          {tracked.map(f => (
            <button key={`${f.kind}-${f.item.id}`} onClick={() => onReplace(f.kind, f.item.id)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-sky-500/40 transition text-left">
              <LibraryCover item={f.item} className="text-lg shrink-0 w-8 aspect-[2/3] rounded-lg bg-zinc-900" />
              <span className="text-sm text-zinc-200 truncate flex-1">{libraryDisplayTitle(f.item)}</span>
              <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
        </div>
      </div>
    </Modal>
  );
}

function LibraryListRow({ kind, item, onClick, onStatusChange, onToggleTracked }) {
  return (
    <div onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 transition cursor-pointer">
      {item.productUrl ? (
        <a href={item.productUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="relative shrink-0" title="Открыть на сайте">
          <LibraryCover item={item} className="text-2xl w-11 aspect-[2/3] rounded-lg bg-zinc-900" />
          <span className="absolute -bottom-1 -right-1 bg-zinc-900 rounded-full p-0.5 border border-zinc-700"><ExternalLink className="w-2.5 h-2.5 text-amber-400"/></span>
        </a>
      ) : (
        <LibraryCover item={item} className="text-2xl shrink-0 w-11 aspect-[2/3] rounded-lg bg-zinc-900" />
      )}
      <div className="min-w-0 flex-1">
        <LibraryTitle item={item} className="text-sm font-medium text-zinc-100 truncate" />
        <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span onClick={e => e.stopPropagation()}><LibraryStatusBadge kind={kind} status={item.status} onChange={onStatusChange} /></span>
          {item.status!=="done" && item.status!=="dropped" && (
            <button onClick={e => { e.stopPropagation(); onToggleTracked(item); }} className={`shrink-0 ${item.tracked ? "text-sky-400" : "text-zinc-700 hover:text-zinc-400"}`} title={item.tracked ? "Убрать из отслеживаемого" : "Отслеживать"}>
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          {kind==="book" && <span>{item.pagesRead}{item.pagesTotal>0 ? `/${item.pagesTotal}` : ""} стр.</span>}
          {kind==="game" && <span>{item.hours} ч.{item.achievementsTotal>0 ? ` · ${item.achievementsGot}/${item.achievementsTotal} ачивок` : ""}</span>}
          {kind==="movie" && <span>{libraryItemTypeLabel(kind, item)}{librarySeriesSuffix(item)}</span>}
          {kind==="book" && item.readingGoal && <span className="text-amber-400 flex items-center gap-1"><Target className="w-3 h-3"/>{item.readingGoal.pagesPerDay} стр/день до {fmtDateWithYear(item.readingGoal.endDate)}</span>}
        </div>
      </div>
      {item.rating>0 && <StarRating value={item.rating} readOnly sizePx={14} />}
    </div>
  );
}

// Карточка-сетка. Ховер-превью позиционируется через getBoundingClientRect при наведении (не
// чистым CSS): у нижних/крайних карточек одного only-CSS "снизу по центру" неизбежно вылезает за
// край экрана. Меряем реальное место вокруг элемента и подставляем fixed-координаты, переворачивая
// карточку вверх через translateY(-100%) (сама компенсирует свою фактическую высоту, без догадок).
function LibraryGridCell({ kind, item, onClick, onToggleTracked }) {
  const statusColor = pal(LIBRARY_STATUS_COLOR[item.status]);
  const cellRef = useRef(null);
  const [hoverPos, setHoverPos] = useState(null);

  function handleMouseEnter() {
    const el = cellRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cardWidth = 192, margin = 8;
    const showAbove = window.innerHeight - rect.bottom < 160;
    let left = rect.left + rect.width/2 - cardWidth/2;
    left = Math.max(margin, Math.min(left, window.innerWidth - cardWidth - margin));
    setHoverPos({ top: showAbove ? rect.top-margin : rect.bottom+margin, left, showAbove });
  }

  return (
    <div ref={cellRef} className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={() => setHoverPos(null)}>
      <button onClick={onClick} className="flex flex-col items-center gap-2 p-2.5 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 transition w-full">
        <div className="relative w-full">
          <LibraryCover item={item} className="text-4xl w-full aspect-[2/3] rounded-lg bg-zinc-900" />
          {item.status!=="done" && item.status!=="dropped" && (
            <button onClick={e => { e.stopPropagation(); onToggleTracked(item); }} className={`absolute top-1 right-1 p-1 rounded-full bg-zinc-950/70 transition ${item.tracked ? "text-sky-400" : "text-zinc-500 hover:text-zinc-300"}`} title={item.tracked ? "Убрать из отслеживаемого" : "Отслеживать"}>
              <Eye className="w-3 h-3" />
            </button>
          )}
        </div>
        <span className="text-xs text-zinc-300 text-center truncate w-full">{libraryDisplayTitle(item)}</span>
        {item.readingGoal && <span className="text-[10px] text-amber-400 flex items-center gap-1 truncate w-full justify-center"><Target className="w-2.5 h-2.5 shrink-0"/>{item.readingGoal.pagesPerDay} стр/день</span>}
      </button>

      {hoverPos && (
        <div className="fixed z-50 w-48 p-3 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl pointer-events-none" style={{ top:hoverPos.top, left:hoverPos.left, transform: hoverPos.showAbove ? "translateY(-100%)" : "none" }}>
          <LibraryTitle item={item} className="text-sm font-medium text-zinc-100 truncate mb-1" />
          <div className={`inline-block text-xs px-2 py-0.5 rounded-full mb-1.5 ${statusColor.bgSoft} ${statusColor.text}`}>{libraryStatusLabel(kind, item.status)}</div>
          <div className="text-xs text-zinc-500 space-y-1">
            {kind==="book" && <div>{item.pagesRead}{item.pagesTotal>0 ? `/${item.pagesTotal}` : ""} стр.</div>}
            {kind==="game" && <div>{item.hours} ч.{item.achievementsTotal>0 ? ` · ${item.achievementsGot}/${item.achievementsTotal} ачивок` : ""}</div>}
            {kind==="movie" && <div>{libraryItemTypeLabel(kind, item)}{librarySeriesSuffix(item)}</div>}
            {item.rating>0 && <div className="pt-0.5"><StarRating value={item.rating} readOnly sizePx={12} /></div>}
          </div>
        </div>
      )}
    </div>
  );
}

// +1/+5/+10 одним и тем же экшеном — для страниц книги, серий сериала, часов игры.
export function QuickAddButtons({ onAdd }) {
  return (
    <span className="flex items-center gap-1">
      {[1,5,10].map(n => (
        <button key={n} type="button" onClick={() => onAdd(n)} className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-amber-300 hover:bg-zinc-700 transition">+{n}</button>
      ))}
    </span>
  );
}

// Цель по чтению книги — задаём ОДИН рычаг (дату ИЛИ темп), второй считается сам от оставшихся
// страниц (pagesTotal-pagesRead), чтобы не приходилось вручную сверять "10 стр/день × 3 дня" с
// реальным объёмом книги. Если у книги не указано общее число страниц — авто-расчёт недоступен,
// оба поля вводятся вручную (честно, а не по случайной прикидке).
function ReadingGoalModal({ open, onClose, item, onSave, onClear }) {
  const [mode, setMode] = useState("byDate"); // "byDate" — дата → темп; "byPages" — темп → дата
  const [endDate, setEndDate] = useState("");
  const [pagesPerDay, setPagesPerDay] = useState("");
  useEffect(() => {
    if (!open) return;
    setMode("byDate");
    setEndDate((item.readingGoal && item.readingGoal.endDate) || "");
    setPagesPerDay((item.readingGoal && item.readingGoal.pagesPerDay) || "");
  }, [open, item]);

  const hasTotal = (item.pagesTotal||0) > 0;
  const remaining = Math.max(0, (item.pagesTotal||0) - (item.pagesRead||0));
  // Сегодня тоже считается днём чтения, поэтому +1.
  const daysUntilEnd = endDate ? Math.max(1, daysBetween(todayStr(), endDate)+1) : null;
  const computedPagesPerDay = (mode==="byDate" && hasTotal && daysUntilEnd) ? Math.max(1, Math.ceil(remaining/daysUntilEnd)) : null;
  const computedEndDate = (mode==="byPages" && hasTotal && Number(pagesPerDay)>0) ? addDaysToDateStr(todayStr(), Math.max(0, Math.ceil(remaining/Number(pagesPerDay))-1)) : null;

  const finalPagesPerDay = mode==="byDate" ? (computedPagesPerDay || Number(pagesPerDay)||0) : Number(pagesPerDay)||0;
  const finalEndDate = mode==="byPages" ? (computedEndDate || endDate) : endDate;
  const canSubmit = !!finalEndDate && !!finalPagesPerDay;

  function submit() {
    if (!canSubmit) return;
    onSave({ endDate: finalEndDate, pagesPerDay: finalPagesPerDay });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Цель по чтению">
      <div className="space-y-4">
        {hasTotal && <div className="text-xs text-zinc-500 font-data">Осталось {remaining} стр. из {item.pagesTotal}</div>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={()=>setMode("byDate")} className={`py-2 rounded-xl text-xs font-medium border transition ${mode==="byDate" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>Считать по дате</button>
          <button type="button" onClick={()=>setMode("byPages")} className={`py-2 rounded-xl text-xs font-medium border transition ${mode==="byPages" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>Считать по темпу</button>
        </div>

        {mode==="byDate" ? (
          <div>
            <label className={labelCls}>Дочитать до какого числа</label>
            <input type="date" className={inputCls} value={endDate} onChange={e=>setEndDate(e.target.value)} />
            {endDate && (hasTotal
              ? <div className="text-xs text-zinc-600 mt-1">≈ {computedPagesPerDay} стр/день, чтобы успеть</div>
              : <div className="text-xs text-zinc-600 mt-1">У книги не указано общее число страниц — впиши темп вручную ниже</div>)}
            {!hasTotal && (
              <div className="mt-3">
                <label className={labelCls}>Страниц в день</label>
                <input type="number" min="1" className={inputCls} value={pagesPerDay} onChange={e=>setPagesPerDay(e.target.value)} placeholder="Например: 20" />
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className={labelCls}>Страниц в день</label>
            <input type="number" min="1" className={inputCls} value={pagesPerDay} onChange={e=>setPagesPerDay(e.target.value)} placeholder="Например: 20" />
            {Number(pagesPerDay)>0 && (hasTotal
              ? <div className="text-xs text-zinc-600 mt-1">Дочитаешь примерно к {fmtDateWithYear(computedEndDate)}</div>
              : <div className="text-xs text-zinc-600 mt-1">У книги не указано общее число страниц — впиши дату вручную ниже</div>)}
            {!hasTotal && (
              <div className="mt-3">
                <label className={labelCls}>Дочитать до какого числа</label>
                <input type="date" className={inputCls} value={endDate} onChange={e=>setEndDate(e.target.value)} />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {item.readingGoal ? <Button variant="ghost" onClick={() => { onClear(); onClose(); }}>Убрать цель</Button> : <span/>}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Отмена</Button>
            <Button onClick={submit} disabled={!canSubmit}>Сохранить</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function LibraryItemDetail({ kind, item, spheres, onBack, onEdit, actions, onToggleTracked, state, onOpenItem, onOpenCollection }) {
  const meta = LIBRARY_KINDS[kind];
  const sphere = item.sphereId ? spheres.find(s=>s.id===item.sphereId) : null;
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  // Меню-троеточие вместо кластера кнопок — тот же список действий, что был, просто не расталкивает
  // название по ширине и открыт для новых пунктов в будущем без переделки вёрстки.
  const menuItems = [
    ...(item.status!=="done" && item.status!=="dropped" ? [{ icon:Eye, label: item.tracked ? "Убрать из отслеживаемого" : "Отслеживать", onClick:() => onToggleTracked(item) }] : []),
    ...(item.productUrl ? [{ icon:ExternalLink, label:"Открыть на сайте", onClick:() => window.open(item.productUrl, "_blank", "noopener,noreferrer") }] : []),
    ...(item.status!=="done" ? [{ icon:Trophy, label:"Завершить", onClick:() => actions.completeLibraryItem(kind, item.id) }] : []),
    { icon:Pencil, label:"Изменить", onClick:onEdit },
    { divider:true },
    // deleteLibraryItem уже мягкое (тост с "Отменить"), поэтому отдельного подтверждения внутри
    // меню не нужно — тот же принцип, что и у остальных удалений в приложении.
    { icon:Trash2, label:"Удалить", danger:true, onClick:() => { actions.deleteLibraryItem(kind, item.id); onBack(); } },
  ];

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"><ChevronLeft className="w-3.5 h-3.5"/>Все {meta.label.toLowerCase()}</button>
      <Card className="p-6 relative">
        {/* Кнопка — в углу карточки, вне общего flex-потока: больше не соревнуется с названием за
            место, поэтому убрать её "убегание" при сужении окна не нужно отдельно чинить. Название
            растягивается на всё доступное место (flex-1), но не сжимается меньше заданного порога
            (min-width вместо min-w-0) — при нехватке места карточка просто аккуратно упрётся в этот
            порог (лёгкий horizontal-скролл на очень узких экранах), а не схлопнет текст в колонку
            по одной букве. pr-12 у ряда — чтобы текст не заезжал под кнопку в углу. */}
        <KebabMenu items={menuItems} buttonClassName="absolute top-4 right-4" />
        <div className="flex items-start gap-4 pr-12">
          <LibraryCover item={item} className="text-4xl w-20 aspect-[2/3] rounded-xl bg-zinc-900 shrink-0" />
          <div className="flex-1" style={{ minWidth:220 }}>
            <LibraryTitle item={item} className="font-display text-2xl text-zinc-100 tracking-wide" />
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <LibraryStatusBadge kind={kind} status={item.status} onChange={(s) => actions.updateLibraryItem(kind, item.id, { status: s })} />
              {kind==="movie" && <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{libraryItemTypeLabel(kind, item)}</span>}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <StarRating value={item.rating} onChange={(v) => actions.updateLibraryItem(kind, item.id, { rating: v })} sizePx={22} />
        </div>

        {kind==="book" && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1 font-data flex-wrap">
              <input type="number" min="0" max={item.pagesTotal>0 ? item.pagesTotal : undefined} value={item.pagesRead} onChange={e => actions.updateLibraryItem(kind, item.id, { pagesRead: Number(e.target.value)||0 })} className="w-16 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-200" />
              <span>/ {item.pagesTotal>0 ? item.pagesTotal : "?"} стр.</span>
              <QuickAddButtons onAdd={(n) => actions.updateLibraryItem(kind, item.id, { pagesRead: item.pagesRead+n })} />
            </div>
            {item.pagesTotal>0 && <ProgressBar value={clamp(item.pagesRead/item.pagesTotal,0,1)} colorClass="bg-violet-500" />}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {item.readingGoal ? (
                <>
                  <span className="text-xs text-zinc-500 font-data">Цель: {item.readingGoal.pagesPerDay} стр/день до {fmtDateWithYear(item.readingGoal.endDate)}</span>
                  <button onClick={() => setGoalModalOpen(true)} className="text-xs text-amber-400 hover:text-amber-300">Изменить</button>
                </>
              ) : (
                <button onClick={() => setGoalModalOpen(true)} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"><Target className="w-3.5 h-3.5"/>Задать цель по чтению</button>
              )}
            </div>
          </div>
        )}

        {kind==="game" && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-data flex-wrap">
              <input type="number" min="0" value={item.hours} onChange={e => actions.updateLibraryItem(kind, item.id, { hours: Number(e.target.value)||0 })} className="w-16 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-200" />
              <span>ч. наиграно</span>
              <QuickAddButtons onAdd={(n) => actions.updateLibraryItem(kind, item.id, { hours: item.hours+n })} />
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-data">
              <input type="number" min="0" max={item.achievementsTotal>0 ? item.achievementsTotal : undefined} value={item.achievementsGot} onChange={e => actions.updateLibraryItem(kind, item.id, { achievementsGot: Number(e.target.value)||0 })} className="w-16 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-200" />
              <span>/ {item.achievementsTotal>0 ? item.achievementsTotal : "?"} ачивок</span>
            </div>
            {item.achievementsTotal>0 && <ProgressBar value={clamp(item.achievementsGot/item.achievementsTotal,0,1)} colorClass="bg-cyan-500" />}
          </div>
        )}

        {kind==="movie" && item.kind==="series" && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1 font-data flex-wrap">
              <input type="number" min="0" max={item.episodesTotal>0 ? item.episodesTotal : undefined} value={item.episodeAt} onChange={e => actions.updateLibraryItem(kind, item.id, { episodeAt: Number(e.target.value)||0 })} className="w-16 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-200" />
              <span>/ {item.episodesTotal>0 ? item.episodesTotal : "?"} серий</span>
              <QuickAddButtons onAdd={(n) => actions.updateLibraryItem(kind, item.id, { episodeAt: item.episodeAt+n })} />
            </div>
            {item.episodesTotal>0 && <ProgressBar value={clamp(item.episodeAt/item.episodesTotal,0,1)} colorClass="bg-sky-500" />}
          </div>
        )}

        {sphere && <div className="text-xs text-zinc-600 mt-4">Сфера: {sphere.name}{item.rewardXp ? ` · +${item.rewardXp} XP при завершении` : ""}</div>}
      </Card>

      {state && onOpenItem && (
        <LibraryItemCollectionBlock state={state} actions={actions} libKind={kind} item={item}
          onOpenItem={onOpenItem} onOpenCollection={onOpenCollection} />
      )}

      <Card className="p-5">
        <div className="text-sm font-semibold text-zinc-200 mb-3">Заметки и тезисы</div>
        <NotesList notes={item.notes} onAdd={(text) => actions.addLibraryNote(kind, item.id, text)}
          onEdit={(noteId, text) => actions.updateLibraryNote(kind, item.id, noteId, text)}
          onDelete={(noteId) => actions.deleteLibraryNote(kind, item.id, noteId)} />
      </Card>
      {kind==="book" && (
        <ReadingGoalModal open={goalModalOpen} onClose={() => setGoalModalOpen(false)} item={item} onSave={(g) => actions.setBookReadingGoal(item.id, g)} onClear={() => actions.clearBookReadingGoal(item.id)} />
      )}
    </div>
  );
}

export function LibrarySectionView({ kind, state, actions, focusId, setFocusId, onOpenItem, onOpenCollection }) {
  const meta = LIBRARY_KINDS[kind];
  const items = state[meta.stateKey] || [];
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [trackedReplaceTarget, setTrackedReplaceTarget] = useState(null); // { kind, item } в ожидании замены
  const libPrefs = (state.uiPrefs && state.uiPrefs.library) || {};
  // Вид (список/сетка) и сортировка — отдельно на каждую вкладку (книги/игры/фильмы не делят
  // между собой ни то, ни другое) и запоминаются между сессиями по тому же принципу, что и
  // последняя открытая вкладка/карточка.
  const view = (libPrefs.viewByKind && libPrefs.viewByKind[kind]) || "list";
  const sortKey = (libPrefs.sortByKind && libPrefs.sortByKind[kind]) || "created_desc";
  const focused = focusId ? items.find(x => x.id===focusId) : null;

  function setView(v) { actions.updateLibraryPrefs({ viewByKind: { ...(libPrefs.viewByKind), [kind]:v } }); }
  function setSortKey(v) { actions.updateLibraryPrefs({ sortByKind: { ...(libPrefs.sortByKind), [kind]:v } }); }

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(item) { setEditing(item); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updateLibraryItem(kind, editing.id, data); else actions.addLibraryItem(kind, data);
    setModalOpen(false);
  }

  // Отслеживаемое общее на всю библиотеку (книги+игры+фильмы вместе), не по 5 на каждый вид —
  // ровно те 5, что попадают в "Сейчас в процессе" на Хабе.
  function allTracked() {
    return [
      ...(state.books||[]).filter(b=>b.tracked).map(x=>({ kind:"book", item:x })),
      ...(state.games||[]).filter(g=>g.tracked).map(x=>({ kind:"game", item:x })),
      ...(state.movies||[]).filter(m=>m.tracked).map(x=>({ kind:"movie", item:x })),
    ];
  }
  function handleToggleTracked(item) {
    if (item.tracked) { actions.setTracked(kind, item.id, false); return; }
    const tr = allTracked();
    if (tr.length >= 5) { setTrackedReplaceTarget({ kind, item }); return; }
    actions.setTracked(kind, item.id, true);
  }
  function handleReplaceTracked(oldKind, oldId) {
    if (!trackedReplaceTarget) return;
    actions.swapTracked(oldKind, oldId, trackedReplaceTarget.kind, trackedReplaceTarget.item.id);
    setTrackedReplaceTarget(null);
  }

  if (focused) {
    return (
      <>
        <LibraryItemDetail kind={kind} item={focused} spheres={state.spheres} onBack={() => setFocusId(null)} onEdit={() => openEdit(focused)} actions={actions} onToggleTracked={handleToggleTracked}
          state={state} onOpenItem={onOpenItem} onOpenCollection={onOpenCollection} />
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Изменить запись">
          <LibraryItemForm kind={kind} spheres={state.spheres} initial={editing} apiKeys={state.uiPrefs && state.uiPrefs.apiKeys} librarySources={state.uiPrefs && state.uiPrefs.librarySources && state.uiPrefs.librarySources[kind]} emojiPools={state.uiPrefs && state.uiPrefs.emojiPools} emojiAssignments={state.uiPrefs && state.uiPrefs.emojiAssignments} onAddPoolEmoji={actions.addPoolEmoji} onRemovePoolEmoji={actions.removePoolEmoji} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
        </Modal>
        <TrackedReplaceModal open={!!trackedReplaceTarget} onClose={() => setTrackedReplaceTarget(null)} tracked={allTracked()} newItem={trackedReplaceTarget} onReplace={handleReplaceTracked} />
      </>
    );
  }

  const sortOptions = [...LIBRARY_SORT_COMMON, ...LIBRARY_SORT_EXTRA[kind]];
  const filtered = statusFilter==="all" ? items : items.filter(x => x.status===statusFilter);
  const sorted = sortLibraryItems(filtered, sortKey);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">Все статусы</option>
          {LIBRARY_STATUS_ORDER.map(s => <option key={s} value={s}>{libraryStatusLabel(kind, s)}</option>)}
        </select>
        <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={sortKey} onChange={e=>setSortKey(e.target.value)}>
          {sortOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div className="flex items-center rounded-lg border border-zinc-800 overflow-hidden">
          <button onClick={() => setView("list")} className={`px-2.5 py-1.5 ${view==="list" ? "bg-amber-500/15 text-amber-300" : "text-zinc-500 hover:text-zinc-300"}`}><List className="w-3.5 h-3.5"/></button>
          <button onClick={() => setView("grid")} className={`px-2.5 py-1.5 ${view==="grid" ? "bg-amber-500/15 text-amber-300" : "text-zinc-500 hover:text-zinc-300"}`}><LayoutGrid className="w-3.5 h-3.5"/></button>
        </div>
      </div>

      {sorted.length === 0 ? (
        items.length === 0 ? (
          <EmptyState icon={meta.icon} title="Пока пусто" subtitle={`Добавь первую запись в «${meta.label}».`} action={<Button size="sm" onClick={openCreate}>Добавить</Button>} />
        ) : (
          <EmptyState icon={meta.icon} title="Нет записей с таким статусом" subtitle="Попробуй другой фильтр." />
        )
      ) : view==="grid" ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {sorted.map(item => <LibraryGridCell key={item.id} kind={kind} item={item} onClick={() => setFocusId(item.id)} onToggleTracked={handleToggleTracked} />)}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(item => <LibraryListRow key={item.id} kind={kind} item={item} onClick={() => setFocusId(item.id)} onStatusChange={(s) => actions.updateLibraryItem(kind, item.id, { status:s })} onToggleTracked={handleToggleTracked} />)}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Изменить запись" : "Новая запись"}>
        <LibraryItemForm kind={kind} spheres={state.spheres} initial={editing} apiKeys={state.uiPrefs && state.uiPrefs.apiKeys} librarySources={state.uiPrefs && state.uiPrefs.librarySources && state.uiPrefs.librarySources[kind]} emojiPools={state.uiPrefs && state.uiPrefs.emojiPools} emojiAssignments={state.uiPrefs && state.uiPrefs.emojiAssignments} onAddPoolEmoji={actions.addPoolEmoji} onRemovePoolEmoji={actions.removePoolEmoji} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
      <StickyAddButton onClick={openCreate} label="Добавить" />
      <TrackedReplaceModal open={!!trackedReplaceTarget} onClose={() => setTrackedReplaceTarget(null)} tracked={allTracked()} newItem={trackedReplaceTarget} onReplace={handleReplaceTracked} />
    </div>
  );
}

// Вкладка (книги/игры/фильмы) запоминается ВСЕГДА — какая была открыта, та и восстанавливается.
// А вот конкретная подробная карточка запоминается, только если она реально была открыта в момент
// закрытия/перезагрузки — простое пролистывание списка её не оставляет. Явная навигация извне
// (например, "открыть книгу X" из Хаба) всегда перекрывает восстановленное состояние.
export function LibraryView({ state, actions, focus, setFocus }) {
  const libPrefs = (state.uiPrefs && state.uiPrefs.library) || {};
  const [activeKind, setActiveKind] = useState(() => (focus && focus.kind) || libPrefs.lastKind || "book");
  const [localFocusId, setLocalFocusId] = useState(() => (!focus && libPrefs.lastKind && libPrefs.lastItemId) ? libPrefs.lastItemId : null);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [collectionsKey, setCollectionsKey] = useState(null);

  useEffect(() => {
    if (focus && focus.kind) {
      setActiveKind(focus.kind);
      setLocalFocusId(focus.id);
      actions.updateLibraryPrefs({ lastKind: focus.kind, lastItemId: focus.id||null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  function switchKind(k) {
    setActiveKind(k);
    setLocalFocusId(null);
    setFocus(null);
    // Клик по самой вкладке ведёт к списку коллекций, а не к той, в которую заходили раньше.
    setCollectionsKey(null);
    actions.updateLibraryPrefs({ lastKind:k, lastItemId:null });
  }
  function setFocusId(id) {
    setLocalFocusId(id);
    setFocus(null);
    actions.updateLibraryPrefs({ lastKind:activeKind, lastItemId:id||null });
  }
  // Переход к записи из коллекции: вид записи может быть любым, поэтому переключаем и вкладку.
  function openItem(libKind, id) {
    setActiveKind(libKind);
    setLocalFocusId(id);
    setFocus(null);
    actions.updateLibraryPrefs({ lastKind: libKind, lastItemId: id || null });
  }
  // Обратный переход — из карточки записи в её коллекцию. collectionsKey заставляет вкладку
  // открыть именно эту коллекцию: у неё собственное внутреннее состояние, и без пересоздания
  // она показала бы список, а не то, ради чего в неё шли.
  function openCollection(id) {
    setActiveKind("collections");
    setLocalFocusId(null);
    setFocus(null);
    setCollectionsKey(id);
    actions.updateLibraryPrefs({ lastKind:"collections", lastItemId:null });
  }

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Личный каталог" title="Библиотека" action={
        <div className="flex items-center gap-2 flex-wrap">
          <ShareButtons onShare={() => setShareOpen(true)} onImport={() => setImportOpen(true)} />
        </div>
      } />
      <div className="flex gap-2">
        {LIBRARY_KIND_ORDER.map(k => {
          const meta = LIBRARY_KINDS[k];
          const Icon = meta.icon;
          return (
            <button key={k} onClick={() => switchKind(k)} className={`flex-1 min-w-0 py-2.5 rounded-xl text-sm font-medium border transition flex items-center justify-center gap-2 ${activeKind===k ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>
              <Icon className="w-4 h-4 shrink-0"/><span className="truncate">{meta.label}</span>
            </button>
          );
        })}
        <button onClick={() => switchKind("collections")} title="Коллекции" aria-label="Коллекции"
          className={`shrink-0 w-11 py-2.5 rounded-xl border transition flex items-center justify-center ${activeKind==="collections" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>
          <Layers className="w-4 h-4"/>
        </button>
      </div>
      {activeKind === "collections" ? (
        <LibraryCollectionsView key={collectionsKey || "list"} state={state} actions={actions} onOpenItem={openItem} initialOpenId={collectionsKey} />
      ) : (
        <LibrarySectionView key={activeKind} kind={activeKind} state={state} actions={actions}
          focusId={localFocusId}
          setFocusId={setFocusId}
          onOpenItem={openItem}
          onOpenCollection={openCollection}
        />
      )}
      <ShareExportModal open={shareOpen} onClose={() => setShareOpen(false)} sectionId="library" state={state}
        initialSelectedIds={
          // Открыта карточка — предлагаем поделиться именно ей (самый частый сценарий: "скинь мне
          // вот эту книгу"). Иначе — записи текущей категории: она и так на экране, значит речь
          // скорее всего о ней, а не обо всей библиотеке разом.
          localFocusId
            ? [localFocusId]
            : activeKind === "collections"
              ? (state.libraryCollections || []).map(c => `collection:${c.id}`)
              : ((LIBRARY_KINDS[activeKind] && state[LIBRARY_KINDS[activeKind].stateKey]) || []).map(x => x.id)
        } />
      <ShareImportModal open={importOpen} onClose={() => setImportOpen(false)} sectionId="library" state={state} onImport={(parsed, reuse) => actions.importShared("library", parsed, reuse)} />
    </div>
  );
}

function CollectionFormModal({ open, onClose, initial, onSubmit, emojiPools, emojiAssignments, onAddPoolEmoji, onRemovePoolEmoji }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📦");
  const [pickerOpen, setPickerOpen] = useState(false);
  // Пул берётся через назначения категорий, как в формах книг, людей и продуктов. Здесь раньше
  // стоял выдуманный ключ "library": такого пула нет, поэтому список смайликов оказывался пустым,
  // а добавленный смайлик уезжал в несуществующий пул.
  const pools = emojiPools || defaultEmojiPools();
  const assignments = emojiAssignments || defaultEmojiAssignments();
  const poolId = assignments.collection || Object.keys(pools)[0];
  const pool = pools[poolId] || Object.values(pools)[0];
  useEffect(() => {
    if (!open) return;
    setName((initial && initial.name) || "");
    setEmoji((initial && initial.coverEmoji) || "📦");
  }, [open, initial]);
  function submit() {
    const n = name.trim();
    if (!n) return;
    onSubmit({ name: n, coverEmoji: emoji });
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Изменить коллекцию" : "Новая коллекция"} maxWidth="max-w-md">
      <div className="space-y-3">
        <div className="flex items-end gap-3">
          <button type="button" onClick={() => setPickerOpen(true)}
            className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 text-2xl flex items-center justify-center shrink-0 hover:border-zinc-700 transition">{emoji}</button>
          <div className="flex-1">
            <label className="block text-xs text-zinc-500 mb-1">Название</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }}
              placeholder="Например, Ведьмак"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={submit}>{initial ? "Сохранить" : "Создать"}</Button>
        </div>
      </div>
      <EmojiPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} value={emoji} onChange={setEmoji}
        poolEmojis={pool.emojis} onAdd={(e) => onAddPoolEmoji && onAddPoolEmoji(poolId, e)} onRemove={(e) => onRemovePoolEmoji && onRemovePoolEmoji(poolId, e)} />
    </Modal>
  );
}

// Добавление записей в коллекцию. Показываем всю библиотеку разом, а не по видам: коллекция
// затем и нужна, чтобы книга, игра и сериал лежали вместе.
function CollectionAddItemsModal({ open, onClose, state, collection, onAdd }) {
  const [q, setQ] = useState("");
  // Ключ вида "book:abc": id уникальны внутри своего списка, но не между ними, а выбирать можно
  // из всех трёх сразу.
  const [picked, setPicked] = useState([]);
  useEffect(() => { if (open) { setQ(""); setPicked([]); } }, [open]);
  const keyOf = (libKind, id) => `${libKind}:${id}`;
  const toggle = (libKind, id) => setPicked(list => {
    const k = keyOf(libKind, id);
    return list.includes(k) ? list.filter(x => x !== k) : [...list, k];
  });
  const needle = q.trim().toLowerCase();
  const groups = LIBRARY_KIND_ORDER.map(libKind => {
    const meta = LIBRARY_KINDS[libKind];
    const items = (state[meta.stateKey] || [])
      .filter(it => it.collectionId !== (collection && collection.id))
      .filter(it => !needle || pickerItemMatches(libraryPickerItem(it), needle));
    return { libKind, label: meta.label, items };
  }).filter(g => g.items.length > 0);

  // Порядок добавления — порядок отметок, а не порядок в списке: отмечая части по очереди,
  // человек как раз и задаёт очерёдность.
  const refs = picked.map(k => { const [libKind, ...rest] = k.split(":"); return { libKind, id: rest.join(":") }; });

  return (
    <Modal open={open} onClose={onClose} title="Добавить в коллекцию" maxWidth="max-w-md">
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по всей библиотеке"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto lq-scroll space-y-3">
          {groups.length === 0 && <div className="text-sm text-zinc-600 py-4 text-center">Нечего добавить.</div>}
          {groups.map(g => (
            <div key={g.libKind}>
              <div className="text-[10px] uppercase tracking-wide text-zinc-600 px-1 pb-1">{g.label}</div>
              <div className="space-y-0.5">
                {g.items.map(it => {
                  const other = it.collectionId ? collectionById(state.libraryCollections, it.collectionId) : null;
                  const on = picked.includes(keyOf(g.libKind, it.id));
                  return (
                    <button key={it.id} onClick={() => toggle(g.libKind, it.id)}
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition text-left ${on ? "bg-amber-500/10" : "hover:bg-zinc-800"}`}>
                      <span className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${on ? "bg-amber-500 border-amber-500" : "border-zinc-700"}`}>
                        {on && <Check className="w-3 h-3 text-zinc-950" />}
                      </span>
                      <LibraryCover item={it} className="text-base shrink-0 w-7 aspect-[2/3] rounded bg-zinc-900" />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm truncate ${on ? "text-zinc-100" : "text-zinc-300"}`}>{libraryDisplayTitle(it)}</div>
                        {other && <div className="text-[10px] text-amber-500/80 truncate">сейчас в коллекции «{other.name}»</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-zinc-500">{picked.length ? `Выбрано: ${picked.length}` : "Отметь записи"}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Отмена</Button>
            <Button disabled={!picked.length} onClick={() => { onAdd(refs); onClose(); }}>Добавить</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CollectionItemRow({ ref_, onOpen, onDragStart, onDrop, dragging, onRemove, onMove }) {
  const { libKind, item } = ref_;
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => { if (dragging) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); onDrop(item.id); }}
      className={`rounded-xl ${over ? "ring-1 ring-amber-500/50" : ""}`}>
      <div draggable onDragStart={e => { onDragStart(); e.dataTransfer.effectAllowed = "move"; }}
        onClick={() => onOpen(libKind, item.id)}
        className="flex items-center gap-3 p-2 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 transition cursor-pointer">
        <GripVertical className="w-4 h-4 text-zinc-700 shrink-0" />
        <LibraryCover item={item} className="text-lg shrink-0 w-8 aspect-[2/3] rounded bg-zinc-900" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-zinc-200 truncate">{libraryDisplayTitle(item)}</div>
          <div className="text-[11px] text-zinc-500 truncate">
            {libraryItemTypeLabel(libKind, item)} · {libraryStatusLabel(libKind, item.status)}
          </div>
        </div>
        {item.status === "done" && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
        {/* Клик по меню не должен открывать карточку: строка целиком кликабельна, поэтому
            событие останавливаем на обёртке. */}
        <span className="shrink-0" onClick={e => e.stopPropagation()}>
          <KebabMenu items={[
            { icon: ArrowRight, label: "Перенести в ветку", onClick: () => onMove(libKind, item) },
            { icon: X, label: "Убрать из коллекции", danger: true, onClick: () => onRemove(libKind, item.id) },
          ]} buttonClassName="p-1 rounded text-zinc-600 hover:text-zinc-300" />
        </span>
      </div>
    </div>
  );
}

// Ветка рисуется рекурсивно: привязанная к записи стоит прямо под этой записью со сдвигом, а не
// отдельным разделом внизу. Иначе связь «этот спин-офф относится вот к этому сезону» видна только
// в названии, то есть на честном слове.
function CollectionBranchNode({ node, depth, drag, setDrag, onDrop, onOpenItem, onAdd, onEditBranch, onDeleteBranch, onRenameMain, onRemove, onMove }) {
  return (
    <div
      onDragOver={e => { if (drag) { e.preventDefault(); e.stopPropagation(); } }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop(node.id, null); }}
      className={depth > 0 ? "pl-4 border-l border-zinc-800/80 ml-3 mt-1.5" : ""}>
      <div className="flex items-center gap-2 pb-1.5"
        draggable={!node.implicit}
        onDragStart={!node.implicit ? (e) => { e.stopPropagation(); setDrag({ kind: "branch", id: node.id }); e.dataTransfer.effectAllowed = "move"; } : undefined}
        onDragEnd={() => setDrag(null)}>
        {depth > 0
          ? <CornerDownRight className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
          : <GitBranch className={`w-3.5 h-3.5 shrink-0 ${node.implicit ? "text-zinc-600" : "text-zinc-600 cursor-grab"}`} />}
        <span className={`uppercase tracking-wide flex-1 truncate ${depth > 0 ? "text-[10px] text-zinc-600" : "text-xs text-zinc-500"}`}>{node.name}</span>
        <span className="text-[10px] font-data text-zinc-600">{node.refs.length}</span>
        <button onClick={() => onAdd(node.id)} title="Добавить запись"
          className="p-1 rounded-lg text-zinc-600 hover:text-amber-300 hover:bg-zinc-800 transition"><Plus className="w-3.5 h-3.5" /></button>
        {node.implicit ? (
          // У основной линии нет объекта ветки, поэтому и удалять нечего — только переименовать.
          <KebabMenu items={[
            { icon: Pencil, label: "Переименовать", onClick: () => onRenameMain(node.name) },
          ]} buttonClassName="p-1 rounded text-zinc-600 hover:text-zinc-300" />
        ) : (
          <KebabMenu items={[
            { icon: Pencil, label: "Настроить ветку", onClick: () => onEditBranch(node) },
            { icon: Trash2, label: "Удалить ветку", danger: true, onClick: () => onDeleteBranch(node.id) },
          ]} buttonClassName="p-1 rounded text-zinc-600 hover:text-zinc-300" />
        )}
      </div>
      <div className="space-y-1.5">
        {node.refs.map(r => (
          <React.Fragment key={r.item.id}>
            <CollectionItemRow ref_={r} onOpen={onOpenItem} dragging={!!drag}
              onDragStart={() => setDrag({ kind: "item", id: r.item.id })}
              onDrop={(beforeId) => onDrop(node.id, beforeId)}
              onRemove={onRemove} onMove={onMove} />
            {r.branches.map(child => (
              <CollectionBranchNode key={child.id} node={child} depth={depth + 1}
                drag={drag} setDrag={setDrag} onDrop={onDrop} onOpenItem={onOpenItem}
                onAdd={onAdd} onEditBranch={onEditBranch} onDeleteBranch={onDeleteBranch}
                onRenameMain={onRenameMain} onRemove={onRemove} onMove={onMove} />
            ))}
          </React.Fragment>
        ))}
        {node.refs.length === 0 && (
          <div className="text-[11px] text-zinc-700 border border-dashed border-zinc-800 rounded-xl py-3 text-center">
            Пусто — перетащи сюда запись или добавь плюсом
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionDetailView({ state, actions, collection, onBack, onOpenItem }) {
  const [drag, setDrag] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [mainName, setMainName] = useState(null);
  const [rootOver, setRootOver] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [addTo, setAddTo] = useState(null);      // id ветки, куда добавляем
  const [editOpen, setEditOpen] = useState(false);
  const [branchName, setBranchName] = useState(null); // { id, name } — переименование/создание
  const tree = collectionTree(state, collection);
  const progress = collectionProgress(state, collection.id);
  const showProgress = collection.showProgress !== false;

  // Ветка, брошенная НА ЗАПИСЬ, становится её ответвлением; брошенная на другую ветку — встаёт
  // рядом с ней на том же уровне; брошенная в зону под списком — поднимается на верхний уровень.
  // Три жеста покрывают и сортировку, и смену родителя, и отвязку.
  function handleBranchDrop(groupId, beforeItemId) {
    const branches = collectionBranches(collection);
    const ids = (list) => list.map(b => b.id);
    if (beforeItemId) {
      actions.moveCollectionBranch(collection.id, drag.id, beforeItemId, ids(branches));
    } else if (groupId === COLLECTION_MAIN_BRANCH) {
      actions.moveCollectionBranch(collection.id, drag.id, null, ids(reorderBranchList(branches, drag.id, null)));
    } else if (groupId !== drag.id) {
      const target = branches.find(b => b.id === groupId);
      actions.moveCollectionBranch(collection.id, drag.id, (target && target.anchorId) || null,
        ids(reorderBranchList(branches, drag.id, groupId)));
    }
    setDrag(null);
  }

  function handleDrop(groupId, beforeId) {
    if (!drag) return;
    if (drag.kind === "branch") return handleBranchDrop(groupId, beforeId);
    const all = collectionRefs(state, collection.id);
    const dragged = all.find(r => r.item.id === drag.id);
    if (!dragged) { setDrag(null); return; }
    // Кольцо с другой стороны: запись нельзя уронить в ветку, которая к ней же и привязана.
    if (!canPlaceItemInBranch(state, collection, drag.id, groupId)) {
      actions.notify("Запись нельзя положить в ветку, привязанную к ней самой");
      setDrag(null);
      return;
    }
    const sameBranch = refBranchId(dragged.item, collection) === groupId;
    const inGroup = all.filter(r => refBranchId(r.item, collection) === groupId);
    const base = sameBranch ? inGroup : [...inGroup, dragged];
    const ordered = reorderRefs(base, drag.id, beforeId);
    actions.applyCollectionOrder(assignBranchOrder(ordered),
      sameBranch ? null : { id: drag.id, branchId: groupId === COLLECTION_MAIN_BRANCH ? null : groupId });
    setDrag(null);
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
        <ChevronLeft className="w-3.5 h-3.5" />Все коллекции
      </button>

      <Card className="p-5 relative">
        <KebabMenu items={[
          { icon: Pencil, label: "Переименовать", onClick: () => setEditOpen(true) },
          { icon: GitBranch, label: "Добавить ветку", onClick: () => setBranchName({ id: null, name: "" }) },
          { icon: showProgress ? EyeOff : Eye, label: showProgress ? "Скрыть прогресс" : "Показывать прогресс",
            onClick: () => actions.updateLibraryCollection(collection.id, { showProgress: !showProgress }) },
          { icon: Share2, label: "Поделиться", onClick: () => setShareOpen(true) },
          { divider: true },
          { icon: Trash2, label: "Удалить коллекцию", danger: true, onClick: () => { actions.deleteLibraryCollection(collection.id); onBack(); } },
        ]} buttonClassName="absolute top-4 right-4" />
        <div className="flex items-center gap-4 pr-12">
          <span className="w-16 h-16 rounded-xl bg-zinc-900 border border-zinc-800 text-3xl flex items-center justify-center shrink-0">{collection.coverEmoji || "📦"}</span>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold text-zinc-100 truncate">{collection.name}</div>
            {/* Выключённый прогресс убирает и счётчик: у коллекции из мультиплеерных игр «пройдено
                0 из 4» не нейтральная цифра, а неверное утверждение — их нельзя пройти в принципе. */}
            {showProgress && <div className="text-xs text-zinc-500 font-data mt-0.5">пройдено {progress.done} из {progress.total}</div>}
            {showProgress && progress.total > 0 && <div className="mt-2"><ProgressBar value={progress.done / progress.total} colorClass="bg-amber-500" heightClass="h-1.5" /></div>}
          </div>
        </div>
      </Card>

      {tree.map(node => (
        <CollectionBranchNode key={node.id} node={node} depth={0}
          drag={drag} setDrag={setDrag} onDrop={handleDrop} onOpenItem={onOpenItem}
          onAdd={setAddTo}
          onEditBranch={(n) => setBranchName({ id: n.id, name: n.name })}
          onDeleteBranch={(id) => actions.deleteCollectionBranch(collection.id, id)}
          onRenameMain={(current) => setMainName(current)}
          onRemove={(libKind, id) => actions.removeItemFromCollection(libKind, id)}
          onMove={(libKind, it) => setMoveTarget({ libKind, item: it })} />
      ))}

      {/* Та же модалка, что и в списках книг и фильмов: коллекция для неё — просто ещё одна
          отмеченная строка в списке выгрузки, только отмеченная заранее. */}
      <ShareExportModal open={shareOpen} onClose={() => setShareOpen(false)} sectionId="library" state={state}
        onNotify={(t) => actions.notify(t)} initialSelectedIds={[`collection:${collection.id}`]} />

      <CollectionFormModal open={editOpen} onClose={() => setEditOpen(false)} initial={collection}
        emojiPools={state.uiPrefs && state.uiPrefs.emojiPools} emojiAssignments={state.uiPrefs && state.uiPrefs.emojiAssignments}
        onAddPoolEmoji={actions.addPoolEmoji} onRemovePoolEmoji={actions.removePoolEmoji}
        onSubmit={(data) => actions.updateLibraryCollection(collection.id, data)} />

      <CollectionAddItemsModal open={!!addTo} onClose={() => setAddTo(null)} state={state} collection={collection}
        onAdd={(refs) => actions.addItemsToCollection(collection.id, addTo === COLLECTION_MAIN_BRANCH ? null : addTo, refs)} />

      <div
        onDragOver={e => { if (drag && drag.kind === "branch") { e.preventDefault(); setRootOver(true); } }}
        onDragLeave={() => setRootOver(false)}
        onDrop={e => { e.preventDefault(); setRootOver(false); if (drag && drag.kind === "branch") handleBranchDrop(COLLECTION_MAIN_BRANCH, null); }}
        className={`rounded-xl border border-dashed transition ${rootOver ? "border-amber-500/50 bg-amber-500/5" : "border-zinc-800"}`}>
        <button onClick={() => setBranchName({ id: null, name: "" })}
          className="w-full py-2.5 text-sm text-zinc-500 hover:text-amber-300 transition flex items-center justify-center gap-1.5">
          <Plus className="w-4 h-4" />{drag && drag.kind === "branch" ? "Отпусти, чтобы вынести ветку наверх" : "Добавить ветку"}
        </button>
      </div>

      {moveTarget && (
        <CollectionPickerModal open onClose={() => setMoveTarget(null)} state={state} actions={actions}
          libKind={moveTarget.libKind} item={moveTarget.item} />
      )}

      <SimpleNameModal open={mainName !== null} onClose={() => setMainName(null)}
        title="Название основной линии" initial={mainName || ""} placeholder="Основная линия"
        hint="Пустое поле вернёт название по умолчанию."
        allowEmpty
        onSubmit={(name) => actions.updateLibraryCollection(collection.id, { mainBranchName: name || null })} />

      <BranchNameModal open={!!branchName} onClose={() => setBranchName(null)} initial={branchName}
        state={state} collection={collection}
        onSubmit={(name, anchorId) => {
          if (branchName && branchName.id) actions.updateCollectionBranch(collection.id, branchName.id, { name, anchorId });
          else actions.addCollectionBranch(collection.id, name, anchorId);
        }} />
    </div>
  );
}

function SimpleNameModal({ open, onClose, title, initial, placeholder, hint, allowEmpty, onSubmit }) {
  const [name, setName] = useState("");
  useEffect(() => { if (open) setName(initial || ""); }, [open, initial]);
  function submit() {
    const n = name.trim();
    if (!n && !allowEmpty) return;
    onSubmit(n);
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      <div className="space-y-3">
        <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder={placeholder}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        {hint && <div className="text-[11px] text-zinc-600">{hint}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={submit}>Сохранить</Button>
        </div>
      </div>
    </Modal>
  );
}

function BranchNameModal({ open, onClose, initial, state, collection, onSubmit }) {
  const [name, setName] = useState("");
  const [anchorId, setAnchorId] = useState("");
  const branchId = initial && initial.id;
  useEffect(() => {
    if (!open) return;
    setName((initial && initial.name) || "");
    const branch = branchId ? collectionBranches(collection).find(b => b.id === branchId) : null;
    setAnchorId((branch && branch.anchorId) || "");
  }, [open, initial, branchId, collection]);
  function submit() { const n = name.trim(); if (!n) return; onSubmit(n, anchorId || null); onClose(); }

  // Записи, лежащие внутри самой ветки, в список не попадают: привязка к ним завязала бы кольцо.
  const options = collectionRefs(state, collection && collection.id)
    .filter(r => !branchId || canAnchorBranch(state, collection, branchId, r.item.id));

  return (
    <Modal open={open} onClose={onClose} title={branchId ? "Настроить ветку" : "Новая ветка"} maxWidth="max-w-sm">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Название</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="Например, Спин-оффы первого сезона"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Относится к записи</label>
          <select value={anchorId} onChange={e => setAnchorId(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">Ни к какой — параллельная ветка</option>
            {options.map(r => <option key={r.item.id} value={r.item.id}>{libraryDisplayTitle(r.item)}</option>)}
          </select>
          <div className="text-[11px] text-zinc-600 mt-1">
            Привязанная ветка встаёт под своей записью и показывается только в её карточке.
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={submit}>Сохранить</Button>
        </div>
      </div>
    </Modal>
  );
}

function LibraryCollectionsView({ state, actions, onOpenItem, initialOpenId }) {
  const [openId, setOpenId] = useState(initialOpenId || null);
  const [createOpen, setCreateOpen] = useState(false);
  const collections = [...(state.libraryCollections || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const open = openId ? collectionById(collections, openId) : null;

  if (open) return <CollectionDetailView state={state} actions={actions} collection={open} onBack={() => setOpenId(null)} onOpenItem={onOpenItem} />;


  return (
    <div className="space-y-4">
      {collections.length === 0 ? (
        <EmptyState icon={Layers} title="Коллекций пока нет"
          subtitle="Коллекция собирает части, сезоны и ответвления одной истории — книги, игры и сериалы вместе."
          action={<Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" />Новая коллекция</Button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {collections.map(c => {
            const progress = collectionProgress(state, c.id);
            const byKind = collectionKindCounts(state, c.id);
            return (
              <button key={c.id} onClick={() => setOpenId(c.id)}
                className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 transition text-left">
                <span className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 text-2xl flex items-center justify-center shrink-0">{c.coverEmoji || "📦"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-100 truncate">{c.name}</div>
                  <div className="text-[11px] text-zinc-500 font-data mt-0.5">
                    {c.showProgress !== false && `${progress.done}/${progress.total} · `}
                    {byKind.map(x => `${x.label}: ${x.count}`).join(", ") || "пусто"}
                    {(c.branches || []).length > 0 && ` · веток: ${c.branches.length}`}
                  </div>
                  {c.showProgress !== false && progress.total > 0 && <div className="mt-1.5"><ProgressBar value={progress.done / progress.total} colorClass="bg-amber-500" heightClass="h-1" /></div>}
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      <CollectionFormModal open={createOpen} onClose={() => setCreateOpen(false)}
        emojiPools={state.uiPrefs && state.uiPrefs.emojiPools} emojiAssignments={state.uiPrefs && state.uiPrefs.emojiAssignments}
        onAddPoolEmoji={actions.addPoolEmoji} onRemovePoolEmoji={actions.removePoolEmoji}
        onSubmit={(data) => actions.addLibraryCollection(data)} />
      {collections.length > 0 && <StickyAddButton onClick={() => setCreateOpen(true)} label="Коллекция" />}
    </div>
  );
}

// Плитка ленты. Название важнее эмодзи: значок в ряду одинаковых квадратов ничего не говорит о
// том, что за объект перед тобой, а название говорит. Поэтому эмодзи здесь не используется вовсе,
// и не загрузившаяся картинка тоже уступает место названию — иначе на её месте остаётся пустота.
function CollectionStripCover({ item }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [item.coverImage]);
  if (item.coverImage && !failed) {
    return <img src={item.coverImage} className="w-full h-full object-cover" style={imagePosStyle(item.coverPos)} onError={() => setFailed(true)} alt="" />;
  }
  return (
    <span className="w-full h-full flex items-center justify-center p-1.5 overflow-hidden">
      <span className="text-[10px] leading-tight text-center text-zinc-300"
        style={{ display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {libraryDisplayTitle(item)}
      </span>
    </span>
  );
}

// Блок в карточке записи: где она стоит в серии и что рядом. Соседи считаются по ветке, поэтому
// «следующая» после третьей книги саги — четвёртая книга, а не первая серия ответвления.
function LibraryItemCollectionBlock({ state, actions, libKind, item, onOpenItem, onOpenCollection }) {
  const [pickOpen, setPickOpen] = useState(false);
  const collection = itemCollection(state, item);
  if (!collection) {
    return (
      <>
        <button onClick={() => setPickOpen(true)}
          className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-zinc-800 text-sm text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition">
          <Layers className="w-4 h-4" />Добавить в коллекцию
        </button>
        <CollectionPickerModal open={pickOpen} onClose={() => setPickOpen(false)} state={state} actions={actions} libKind={libKind} item={item} />
      </>
    );
  }
  const strip = collectionStrip(state, collection, item);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => onOpenCollection(collection.id)}
          className="min-w-0 flex-1 text-left text-sm font-medium text-zinc-200 truncate hover:text-amber-300 transition">
          {collection.name}
        </button>
        <KebabMenu items={[
          { icon: ArrowRight, label: "Перенести в другую ветку", onClick: () => setPickOpen(true) },
          { icon: X, label: "Убрать из коллекции", onClick: () => actions.removeItemFromCollection(libKind, item.id) },
        ]} buttonClassName="p-1 rounded text-zinc-600 hover:text-zinc-300 shrink-0" />
      </div>

      {strip.length > 0 && (
        <div className="flex items-start gap-2 overflow-x-auto lq-scroll pb-1">
          {strip.map(r => {
            const current = r.item.id === item.id;
            // Толщина рамки одна на все состояния, и никакого ring поверх: подсветка выбранного
            // должна ЗАМЕНЯТЬ пунктир вложенного, а не проступать за ним второй линией.
            const frame = current ? "border-amber-500"
              : r.nested ? "border-dashed border-zinc-700"
              : "border-zinc-800";
            return (
              <button key={`${r.branchId}-${r.item.id}`} onClick={() => onOpenItem(r.libKind, r.item.id)}
                title={libraryDisplayTitle(r.item)}
                className={`shrink-0 w-20 text-left ${current ? "" : "opacity-70 hover:opacity-100"} transition`}>
                <div className={`w-20 h-[120px] shrink-0 rounded-lg overflow-hidden bg-zinc-900 border-2 ${frame}`}>
                  <CollectionStripCover item={r.item} />
                </div>
                {/* Подпись стоит всегда, даже одинаковая у всех: без неё блок прыгал бы по высоте
                    при каждом переключении записи, а это шумит сильнее самой подписи. */}
                <div className="text-[10px] text-zinc-600 truncate pt-1">{branchNameOf(collection, r.branchId)}</div>
              </button>
            );
          })}
        </div>
      )}

      <CollectionPickerModal open={pickOpen} onClose={() => setPickOpen(false)} state={state} actions={actions} libKind={libKind} item={item} />
    </Card>
  );
}

// Выбор коллекции и ветки для одной записи. Создание новой коллекции прямо отсюда — иначе первую
// связь пришлось бы заводить в другом разделе и возвращаться.
function CollectionPickerModal({ open, onClose, state, actions, libKind, item }) {
  const [createOpen, setCreateOpen] = useState(false);
  const collections = [...(state.libraryCollections || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  return (
    <Modal open={open} onClose={onClose} title="Коллекция и ветка" maxWidth="max-w-md">
      <div className="space-y-3">
        {collections.length === 0 && <div className="text-sm text-zinc-600 py-2">Коллекций пока нет — создай первую.</div>}
        <div className="max-h-[50vh] overflow-y-auto lq-scroll space-y-2">
          {collections.map(c => {
            const branches = [{ id: COLLECTION_MAIN_BRANCH, name: branchNameOf(c, COLLECTION_MAIN_BRANCH) }, ...collectionBranches(c)];
            return (
              <div key={c.id} className="rounded-xl border border-zinc-800 p-2">
                <div className="flex items-center gap-2 px-1 pb-1.5">
                  <span className="text-base">{c.coverEmoji || "📦"}</span>
                  <span className="text-sm text-zinc-200 truncate">{c.name}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {branches.map(b => {
                    const active = item.collectionId === c.id && refBranchId(item, c) === b.id;
                    return (
                      <button key={b.id}
                        onClick={() => { actions.setItemCollection(libKind, item.id, c.id, b.id === COLLECTION_MAIN_BRANCH ? null : b.id); onClose(); }}
                        className={`text-xs px-2 py-1 rounded-lg border transition ${active ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="ghost" onClick={() => setCreateOpen(true)} className="w-full"><Plus className="w-4 h-4 mr-1" />Новая коллекция</Button>
      </div>
      <CollectionFormModal open={createOpen} onClose={() => setCreateOpen(false)}
        emojiPools={state.uiPrefs && state.uiPrefs.emojiPools} emojiAssignments={state.uiPrefs && state.uiPrefs.emojiAssignments}
        onAddPoolEmoji={actions.addPoolEmoji} onRemovePoolEmoji={actions.removePoolEmoji}
        onSubmit={(data) => actions.addLibraryCollection(data)} />
    </Modal>
  );
}
