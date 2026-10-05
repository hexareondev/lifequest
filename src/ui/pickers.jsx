// Пикеры: иконка, цвет, смайлик, кадрирование картинки и общая модалка обложки. Один набор на
// все разделы — обложка книги, аватар человека и смайлик продукта выбираются одинаково.
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { clamp } from "../core/basics.js";
import { imagePosOf } from "../core/images.js";
import {
  LIBRARY_SEARCH_HINT, LIBRARY_SEARCH_SOURCES, fetchTMDBEpisodeCount, runLibrarySourceSearch,
} from "../library/search.js";
import { Button, Modal, inputCls, labelCls } from "./atoms.jsx";
import { defaultEmojiAssignments, defaultEmojiPools } from "./emoji-pools.js";
import { ICONS, ICON_KEYS, PEOPLE_ICONS, PEOPLE_ICON_KEYS } from "./icons.js";
import { PALETTE, PALETTE_KEYS } from "./theme.js";

export function IconPicker({ value, onChange, keys=ICON_KEYS, icons=ICONS }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {keys.map(name => {
        const Icon = icons[name];
        const active = value === name;
        return (
          <button key={name} type="button" onClick={() => onChange(name)} className={`aspect-square rounded-xl border flex items-center justify-center transition ${active ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"}`}>
            <Icon className="w-5 h-5"/>
          </button>
        );
      })}
    </div>
  );
}

export function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE_KEYS.map(key => {
        const c = PALETTE[key];
        const active = value === key;
        return (
          <button key={key} type="button" onClick={() => onChange(key)} className="rounded-full transition"
            style={{ width:30, height:30, backgroundColor:c.hex, boxShadow: active ? `0 0 0 2px #09090b, 0 0 0 4px ${c.hex}` : "none" }} />
        );
      })}
    </div>
  );
}

// poolEmojis — редактируемый пул (state.uiPrefs.emojiPools[poolId].emojis) — единственный
// источник истины что для выбора, что для редактирования: onAdd/onRemove пишут прямо в него, а
// не в отдельный "личный" список, поэтому Настройки и любая форма всегда показывают одно и то
// же и правки видны в обе стороны без досинхронизации.
export function EmojiPicker({ value, onChange, poolEmojis, onAdd, onRemove }) {
  const [editMode, setEditMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const list = poolEmojis || [];

  function submitCustom() {
    const v = draft.trim();
    if (!v) { setAdding(false); return; }
    // Уже есть в пуле — просто выбираем, а не дублируем.
    if (!list.includes(v)) onAdd && onAdd(v);
    onChange(v);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="space-y-2">
      {onRemove && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setEditMode(v => !v)} className="text-xs text-zinc-500 hover:text-zinc-300">{editMode ? "Готово" : "Изменить набор"}</button>
        </div>
      )}
      <div className="grid grid-cols-8 gap-1.5">
        {list.map((e,i) => (
          <button key={`${e}-${i}`} type="button" onClick={() => editMode ? onRemove(e) : onChange(e)}
            className={`relative aspect-square rounded-lg border flex items-center justify-center text-lg transition ${editMode ? "border-red-500/30 hover:bg-red-500/10" : value===e ? "bg-amber-500/15 border-amber-500/40" : "border-zinc-800 hover:border-zinc-700"}`}>
            {e}
            {editMode && <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-red-500 text-white flex items-center justify-center text-[9px] leading-none">×</span>}
          </button>
        ))}
        {!editMode && onAdd && (
          <button type="button" onClick={() => setAdding(true)} title="Добавить смайлик" className="aspect-square rounded-lg border border-dashed border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition">
            <Plus className="w-4 h-4"/>
          </button>
        )}
      </div>
      {adding && (
        <div className="flex gap-2">
          <input autoFocus className={inputCls} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Вставь любой эмодзи" maxLength={8} onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); submitCustom(); } }} />
          <Button variant="secondary" size="sm" onClick={submitCustom}>Добавить</Button>
        </div>
      )}
    </div>
  );
}

// Квадратное превью обложки/аватара в форме — кружок "+" в углу сигналит, что по клику можно
// сменить (смайлик/иконку, ссылку или найти через проверенный источник).
export function CoverPreviewButton({ onClick, children, rect=false }) {
  return (
    <button type="button" onClick={onClick} className={`relative rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition flex items-center justify-center overflow-hidden shrink-0 ${rect ? "w-24 h-36 text-4xl" : "w-16 h-16 text-3xl"}`}>
      {children}
      <span className={`absolute -bottom-1 -right-1 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center border-2 border-zinc-950 ${rect ? "w-6 h-6" : "w-5 h-5"}`}><Plus className="w-3.5 h-3.5" strokeWidth={3}/></span>
    </button>
  );
}

// Общая модалка выбора обложки — для библиотеки (kind: book/game/movie) три вкладки
// (смайлик/ссылка/проверенный источник), для человека (kind: "person") только две
// (иконка/ссылка) — верифицированного источника аватаров не существует.
// Точка выбирается прямо на картинке, а не ползунками: показать пальцем, где важное, проще,
// чем подбирать два числа. Картинка выводится в своём натуральном размере (без object-contain),
// поэтому прямоугольник элемента совпадает с нарисованным изображением и координаты клика
// переводятся в проценты один в один.
function ImageFocusPicker({ url, pos, onChange, square }) {
  const p = imagePosOf(pos);
  const [dragging, setDragging] = useState(false);
  function pick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const t = e.touches && e.touches[0];
    const cx = (t ? t.clientX : e.clientX) - rect.left;
    const cy = (t ? t.clientY : e.clientY) - rect.top;
    onChange({ x: Math.round(clamp(cx / rect.width * 100, 0, 100)), y: Math.round(clamp(cy / rect.height * 100, 0, 100)) });
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-zinc-500">Нажми на картинке точку, которая должна оставаться в кадре.</div>
      <div className="flex gap-4 items-start">
        <div className="relative inline-block select-none cursor-crosshair"
          onMouseDown={e => { e.preventDefault(); setDragging(true); pick(e); }}
          onMouseMove={e => { if (dragging) pick(e); }}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
          onTouchStart={e => pick(e)}
          onTouchMove={e => { e.preventDefault(); pick(e); }}>
          <img src={url} className="block max-w-full max-h-56 rounded-lg border border-zinc-800" draggable={false} alt="" />
          <span className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-amber-400 bg-amber-400/30 pointer-events-none"
            style={{ left: `${p.x}%`, top: `${p.y}%` }} />
        </div>
        <div className="space-y-2 shrink-0">
          <div className="text-[11px] text-zinc-600">Как будет выглядеть</div>
          <div className={`${square ? "w-20 h-20" : "w-20 h-[120px]"} rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900`}>
            <img src={url} className="w-full h-full object-cover" style={{ objectPosition: `${p.x}% ${p.y}%` }} alt="" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>По центру</Button>
        </div>
      </div>
    </div>
  );
}

export function CoverPickerModal({ open, onClose, kind, emoji, onPickEmoji, iconValue, onPickIcon, imageUrl, onPickImage, imagePos, onPickPos, apiKeys, sourcesEnabled, titleValue, onTitleChange, emojiPools, emojiAssignments, onAddPoolEmoji, onRemovePoolEmoji }) {
  const [tab, setTab] = useState("emoji");
  const [linkDraft, setLinkDraft] = useState(imageUrl || "");
  const [linkError, setLinkError] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const requestIdRef = useRef(0);

  const isPerson = kind === "person";
  useEffect(() => {
    if (open) { setTab(isPerson ? "icon" : "emoji"); setLinkDraft(imageUrl || ""); setLinkError(false); setQuery(""); setResults(null); setSearchError(""); setSearching(false); }
  }, [open]);
  useEffect(() => { if (!imageUrl) setTab(t => t === "frame" ? (isPerson ? "icon" : "emoji") : t); }, [imageUrl, isPerson]);
  // Поле ссылки следует за текущей картинкой: после выбора из поиска в нём иначе остаётся то, что
  // было при открытии окна, и вкладка «Ссылка» показывает не ту картинку, что стоит на самом деле.
  // Набор текста сюда не попадает: меняется только linkDraft, а imageUrl остаётся прежним.
  useEffect(() => { setLinkDraft(imageUrl || ""); setLinkError(false); }, [imageUrl]);

  const allSources = !isPerson ? (LIBRARY_SEARCH_SOURCES[kind]||[]) : [];
  const activeSources = allSources.filter(s => (sourcesEnabled && sourcesEnabled[s.id]) !== false && (!s.needsKey || (apiKeys && apiKeys[s.needsKey])));
  const sourceAvailable = activeSources.length > 0;

  // Пул смайликов для этой категории (Настройки → Смайлики) — тот же массив и читается, и
  // пишется (двусторонняя синхронизация "из коробки": один источник данных, а не копия).
  const pools = emojiPools || defaultEmojiPools();
  const assignments = emojiAssignments || defaultEmojiAssignments();
  const poolId = assignments[kind] || Object.keys(pools)[0];
  const pool = pools[poolId] || Object.values(pools)[0];

  // Название карточки и поисковый запрос дублируют друг друга, если один из них пуст —
  // удобно не вбивать название дважды. При переходе на вкладку поиска подтягиваем название
  // в запрос, если запрос ещё пуст. При вводе запроса — живьём копируем в название на каждый
  // символ (не только на первый!), а решение "применять ли" отдаём родителю через onTitleChange
  // — он сам знает, включено ли ещё автослежение за названием (пока его не редактировали руками).
  useEffect(() => {
    if (tab==="source" && !query.trim() && titleValue && titleValue.trim()) setQuery(titleValue);
  }, [tab]);
  function handleQueryChange(v) {
    setQuery(v);
    if (onTitleChange) onTitleChange(v);
  }

  // Живой поиск с debounce по ВСЕМ включённым источникам сразу (Настройки → Библиотека) —
  // не нужно жать кнопку. requestIdRef защищает от гонки: если пока ждали ответ пользователь
  // допечатал запрос, старый (более медленный) ответ не перезапишет уже новый результат.
  // Promise.allSettled — если один источник упал, остальные всё равно покажутся.
  useEffect(() => {
    if (tab!=="source" || !sourceAvailable) return;
    const q = query.trim();
    if (q.length < 2) { setResults(null); setSearchError(""); setSearching(false); return; }
    const myId = ++requestIdRef.current;
    setSearching(true);
    setSearchError("");
    const timer = setTimeout(async () => {
      const settled = await Promise.allSettled(activeSources.map(s => runLibrarySourceSearch(s.id, q, apiKeys||{})));
      if (requestIdRef.current !== myId) return;
      const merged = [];
      settled.forEach(r => { if (r.status==="fulfilled") merged.push(...r.value); });
      setResults(merged);
      if (merged.length===0) setSearchError("Ничего не нашлось. Попробуй на другом языке (обычно оригинальное название надёжнее) или вставь ссылку вручную.");
      setSearching(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [query, tab, kind, apiKeys, sourcesEnabled]);

  // Выбор картинки — не конец работы, а её середина: почти всегда следом хочется поправить кадр.
  // Поэтому вместо закрытия переходим на «Кадр». Если кадрирование недоступно (окно вызвано без
  // onPickPos), поведение прежнее — закрыть.
  function afterImagePick() {
    if (onPickPos) setTab("frame"); else onClose();
  }

  async function pickResult(r) {
    let meta = { name: r.name, pagesTotal: r.pagesTotal || null, episodesTotal: r.episodesTotal || null, isSeries: !!r.isSeries };
    if (r.source==="TMDB" && r.isSeries && r.tmdbId && apiKeys && apiKeys.tmdb) {
      const count = await fetchTMDBEpisodeCount(r.tmdbId, apiKeys.tmdb);
      if (count) meta.episodesTotal = count;
    }
    onPickImage(r.imageUrl, meta);
    afterImagePick();
  }

  function applyLink() {
    const v = linkDraft.trim();
    if (!v) return;
    onPickImage(v);
    afterImagePick();
  }

  const tabCls = (active) => `py-2 rounded-xl text-sm font-medium border transition ${active ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`;

  return (
    <Modal open={open} onClose={onClose} title="Обложка" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {isPerson && <button type="button" onClick={() => setTab("icon")} className={tabCls(tab==="icon")}>Иконка</button>}
          <button type="button" onClick={() => setTab("emoji")} className={tabCls(tab==="emoji")}>Смайлик</button>
          <button type="button" onClick={() => setTab("link")} className={tabCls(tab==="link")}>Ссылка</button>
          {imageUrl && onPickPos && <button type="button" onClick={() => setTab("frame")} className={tabCls(tab==="frame")}>Кадр</button>}
          {!isPerson && <button type="button" onClick={() => setTab("source")} className={tabCls(tab==="source")}>Поиск</button>}
        </div>

        {tab==="icon" && isPerson && (
          <IconPicker value={iconValue} onChange={(v) => { onPickIcon(v); onClose(); }} keys={PEOPLE_ICON_KEYS} icons={PEOPLE_ICONS} />
        )}

        {tab==="emoji" && (
          <EmojiPicker value={emoji} onChange={(v) => { onPickEmoji(v); onClose(); }}
            poolEmojis={pool.emojis}
            onAdd={onAddPoolEmoji ? (v) => onAddPoolEmoji(poolId, v) : undefined}
            onRemove={onRemovePoolEmoji ? (v) => onRemovePoolEmoji(poolId, v) : undefined}
          />
        )}

        {tab==="link" && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Ссылка на картинку</label>
              <input className={inputCls} value={linkDraft} onChange={e => { setLinkDraft(e.target.value); setLinkError(false); }} placeholder="https://..." />
            </div>
            {linkDraft.trim() && (
              <div className="flex items-center gap-3">
                <span className="w-16 h-16 rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                  {!linkError
                    ? <img src={linkDraft.trim()} className="w-full h-full object-cover" onError={() => setLinkError(true)} alt="" />
                    : <span className="text-[10px] text-zinc-600 text-center px-1">не загрузилось</span>}
                </span>
                <span className="text-xs text-zinc-500">{linkError ? "Ссылка не открылась — проверь её или попробуй другую." : "Похоже, всё в порядке."}</span>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={applyLink} disabled={!linkDraft.trim()}>Использовать</Button>
            </div>
          </div>
        )}

        {tab==="frame" && imageUrl && onPickPos && (
          <ImageFocusPicker url={imageUrl} pos={imagePos} onChange={onPickPos} square={isPerson} />
        )}

        {tab==="source" && !isPerson && (
          <div className="space-y-3">
            {!sourceAvailable ? (
              <div className="text-sm text-zinc-500">
                {allSources.every(s => !sourcesEnabled || sourcesEnabled[s.id]===false)
                  ? "Все источники для этого раздела выключены — включи хотя бы один в Настройки → Библиотека."
                  : "Нужен бесплатный API-ключ — добавь его в Настройки → Библиотека."}
              </div>
            ) : (
              <>
                <div className="relative">
                  <input className={inputCls} value={query} onChange={e=>handleQueryChange(e.target.value)} placeholder="Начни вводить название..." autoFocus />
                  {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">Ищу…</span>}
                </div>
                <div className="text-xs text-zinc-600">{LIBRARY_SEARCH_HINT[kind]} Ищем сразу по: {activeSources.map(s=>s.label.replace(" (экспериментально)","")).join(", ")}.</div>
                {kind==="game" && <div className="text-xs text-zinc-600">RAWG экспериментален — поддержка браузерного поиска у них нестабильна, при ошибке просто вставь ссылку вручную.</div>}
                {query.trim().length > 0 && query.trim().length < 2 && (
                  <div className="text-xs text-zinc-600">Введи ещё хотя бы пару символов.</div>
                )}
                {searchError && <div className="text-xs text-amber-400">{searchError}</div>}
                {results && results.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 overflow-y-auto lq-scroll" style={{ maxHeight:260 }}>
                    {results.map(r => (
                      <button key={r.id} type="button" onClick={() => pickResult(r)} className="text-left group">
                        <span className="relative block aspect-[2/3] rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 group-hover:border-amber-500/50 transition">
                          <img src={r.imageUrl} className="w-full h-full object-cover" alt="" />
                          <span className="absolute bottom-0 inset-x-0 bg-zinc-950/80 text-[9px] text-zinc-400 text-center py-0.5">{r.source}</span>
                        </span>
                        <span className="text-[10px] text-zinc-500 line-clamp-2 mt-1 block">{r.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Лёгкая модалка на один смайлик-пикер — без вкладок Ссылка/Источник, как у Библиотеки:
// продуктам/блюдам/инвентарю Питания это не нужно, только сам смайлик + свои добавленные.
export function EmojiPickerModal({ open, onClose, value, onChange, poolEmojis, onAdd, onRemove }) {
  return (
    <Modal open={open} onClose={onClose} title="Смайлик" maxWidth="max-w-sm">
      <EmojiPicker value={value} onChange={(v) => { onChange(v); onClose(); }} poolEmojis={poolEmojis} onAdd={onAdd} onRemove={onRemove} />
    </Modal>
  );
}
