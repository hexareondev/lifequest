// Общие атомы интерфейса: кнопка, карточка, модальное окно, заглушка пустого списка, полоса
// прогресса, заголовок раздела, тосты и глобальные стили. Ни одного знания о предметной области
// здесь нет — поэтому на них может опираться любой раздел, не таща за собой соседей.

import { useState, useEffect, useRef } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical, MoreVertical, Plus, Star,
  StarHalf, Trash2, X,
} from "lucide-react";
import { clamp } from "../core/basics.js";

export function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      .font-display { font-family: 'Cinzel', ui-serif, serif; }
      .font-body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
      .font-data { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      .lq-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
      .lq-scroll::-webkit-scrollbar-track { background: transparent; }
      .lq-scroll::-webkit-scrollbar-thumb { background: rgba(161,161,170,0.25); border-radius: 8px; }
      .lq-scroll::-webkit-scrollbar-thumb:hover { background: rgba(161,161,170,0.4); }
      @keyframes lq-toast-in { from { opacity:0; transform: translateY(10px) scale(0.96);} to {opacity:1; transform:translateY(0) scale(1);} }
      @keyframes lq-pop { 0% { opacity:0; transform: scale(0.85);} 60% { opacity:1; transform: scale(1.03);} 100% { opacity:1; transform: scale(1);} }
      @keyframes lq-pulse-soft { 0%,100% { opacity:0.55; } 50% { opacity:0.9; } }
      .lq-toast { animation: lq-toast-in 0.25s ease-out; }
      .lq-pop { animation: lq-pop 0.35s cubic-bezier(.2,.9,.3,1.2); }
      .lq-pulse { animation: lq-pulse-soft 2.6s ease-in-out infinite; }
      /* Празднование завершённой кампании: конфетти, лучи и «дыхание» медали. Всё на CSS —
         никаких библиотек и канваса, частицы это обычные div-ы с рандомными параметрами. */
      @keyframes lq-confetti { 0% { transform: translate3d(0,-10vh,0) rotate(0deg); opacity:0; } 8% { opacity:1; } 100% { transform: translate3d(var(--lq-dx,0px),105vh,0) rotate(var(--lq-rot,540deg)); opacity:0; } }
      @keyframes lq-rays { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes lq-medal { 0% { transform: scale(0.4) rotate(-12deg); opacity:0; } 55% { transform: scale(1.12) rotate(4deg); opacity:1; } 100% { transform: scale(1) rotate(0deg); opacity:1; } }
      @keyframes lq-glow { 0%,100% { box-shadow: 0 0 40px rgba(245,158,11,0.35); } 50% { box-shadow: 0 0 80px rgba(245,158,11,0.65); } }
      @keyframes lq-rise-in { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform: translateY(0); } }
      @keyframes lq-shine { from { background-position: -160% 0; } to { background-position: 260% 0; } }
      .lq-confetti-piece { position:absolute; top:0; border-radius:2px; animation-name: lq-confetti; animation-timing-function: cubic-bezier(.25,.6,.4,1); animation-fill-mode: forwards; }
      .lq-rays { animation: lq-rays 26s linear infinite; }
      .lq-medal { animation: lq-medal 0.8s cubic-bezier(.2,.9,.3,1.3) both, lq-glow 2.8s ease-in-out 0.8s infinite; }
      .lq-rise { animation: lq-rise-in 0.5s ease-out both; }
      .lq-shine { background-image: linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.22) 45%, transparent 60%); background-size: 200% 100%; animation: lq-shine 2.4s ease-in-out infinite; }
      input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }
    `}</style>
  );
}

export const inputCls = "w-full bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition";
export const labelCls = "text-xs text-zinc-500 uppercase tracking-wide font-data mb-1.5 block";

export function Card({ children, className="", ...rest }) {
  return <div className={`bg-zinc-900/70 border border-zinc-800 rounded-2xl ${className}`} {...rest}>{children}</div>;
}

export function ProgressBar({ value, colorClass="bg-amber-500", trackClass="bg-zinc-800", heightClass="h-2" }) {
  const v = clamp(value,0,1)*100;
  return (
    <div className={`w-full ${trackClass} rounded-full overflow-hidden ${heightClass}`}>
      <div className={`${colorClass} h-full rounded-full transition-all duration-500 ease-out`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Pips({ count, total=4, colorClass="bg-amber-400" }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({length: total}).map((_,i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < count ? colorClass : "bg-zinc-700"}`} />
      ))}
    </span>
  );
}

// Постраничная навигация для списков с лимитом (10/20/50 и т.п.) — стрелки листают группами по `limit`.
export function Pager({ page, limit, total, onChange }) {
  if (limit===Infinity || total<=limit) return null;
  const totalPages = Math.max(1, Math.ceil(total/limit));
  const from = total===0 ? 0 : (page-1)*limit + 1;
  const to = Math.min(total, page*limit);
  return (
    <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
      <div className="text-xs text-zinc-600">Показано {from}–{to} из {total}</div>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(1, page-1))} disabled={page<=1} className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition"><ChevronLeft className="w-4 h-4"/></button>
        <span className="text-xs font-data text-zinc-500" style={{ minWidth:64, textAlign:"center" }}>Стр. {page} из {totalPages}</span>
        <button onClick={() => onChange(Math.min(totalPages, page+1))} disabled={page>=totalPages} className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition"><ChevronRight className="w-4 h-4"/></button>
      </div>
    </div>
  );
}

export function EmptyState({ icon:Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 border border-dashed border-zinc-800 rounded-2xl">
      {Icon && <Icon className="w-9 h-9 text-zinc-600 mb-3" strokeWidth={1.5} />}
      <div className="text-zinc-300 font-medium mb-1">{title}</div>
      {subtitle && <div className="text-zinc-500 text-sm max-w-sm mb-4">{subtitle}</div>}
      {action}
    </div>
  );
}

// Сворачиваемая карточка — для длинных страниц вроде "Финансы", где не всё нужно держать развёрнутым.
// По умолчанию — неуправляемая (сама помнит open внутри себя, как и было в Финансах). Если
// передать open+onToggle — переходит в управляемый режим, чтобы состояние можно было хранить
// снаружи и сохранять между сессиями (нужно для сворачиваемых секций в карточке человека).
export function CollapsibleCard({ title, headerExtra, defaultOpen=true, open:controlledOpen, onToggle, children }) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : localOpen;
  function toggle() { isControlled ? onToggle(!open) : setLocalOpen(o => !o); }
  return (
    <Card className="p-5">
      <button onClick={toggle} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        <span className="flex items-center gap-3 shrink-0">
          {headerExtra}
          <ChevronDown className="w-4 h-4 text-zinc-500 transition-transform duration-200" style={{ transform: open ? "none" : "rotate(-90deg)" }} />
        </span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </Card>
  );
}

export function Button({ children, variant="primary", size="md", className="", ...rest }) {
  const sizes = { sm:"px-3 py-1.5 text-xs gap-1.5", md:"px-4 py-2.5 text-sm gap-2", lg:"px-5 py-3 text-sm gap-2" };
  const variants = {
    primary:   "bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold shadow-lg shadow-amber-500/20",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700",
    ghost:     "hover:bg-zinc-800/70 text-zinc-300",
    danger:    "bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30",
  };
  return (
    <button className={`inline-flex items-center justify-center rounded-xl transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, children, maxWidth="max-w-lg" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex:50 }}>
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl lq-pop flex flex-col`} style={{ maxHeight:"88vh" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <h3 className="font-display text-lg text-zinc-100 tracking-wide">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800"><X className="w-5 h-5"/></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto lq-scroll">{children}</div>
      </div>
    </div>
  );
}

export function ToastStack({ toasts, onUndo }) {
  return (
    // zIndex намеренно выше всего остального (модалки — 50, меню и подсказки — 30/50): тост с
    // «Отменить» живёт считанные секунды, и если его перекроет открытое окно или контекстное
    // меню, откат станет недоступен именно тогда, когда он нужнее всего.
    // Отступ снизу больше обычного — чтобы стопка не наезжала на плавающую кнопку «Добавить»,
    // которая теперь есть в каждом разделе в том же правом нижнем углу.
    <div className="fixed right-4 flex flex-col gap-2 items-end" style={{ bottom:"5.5rem", zIndex:100, maxWidth:"22rem", pointerEvents:"none" }}>
      {toasts.map(t => (
        <div key={t.id} className="lq-toast bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3" style={{ pointerEvents:"auto" }}>
          {t.icon}
          <div className="text-sm text-zinc-100 flex-1">{t.text}</div>
          {t.undo && <button onClick={() => onUndo(t.id)} className="text-xs font-semibold text-amber-400 hover:text-amber-300 shrink-0">Отменить</button>}
        </div>
      ))}
    </div>
  );
}

export function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
      <div>
        {eyebrow && <div className="font-data text-xs tracking-widest text-zinc-500 uppercase mb-1">{eyebrow}</div>}
        <h2 className="font-display text-2xl text-zinc-100 tracking-wide">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// 5 звёзд с половинками (клик по левой половине иконки — пол-звезды, по правой — целая),
// повторный клик по уже стоящей оценке снимает её. sizePx вместо Tailwind-класса, чтобы
// геометрия кликабельных половинок совпадала с реальным размером иконки.
export function StarRating({ value, onChange, sizePx=20, readOnly=false }) {
  const [hover, setHover] = useState(null);
  function handleClick(i, half) {
    if (readOnly) return;
    const v = half ? i - 0.5 : i;
    onChange(value === v ? 0 : v);
  }
  const display = hover !== null ? hover : value;
  const previewing = hover !== null;
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
      {[1,2,3,4,5].map(i => {
        const filled = display >= i;
        const half = !filled && display >= i - 0.5;
        return (
          <span key={i} className="relative inline-block shrink-0" style={{ width:sizePx, height:sizePx }}>
            {!readOnly && (
              <>
                <button type="button" onClick={() => handleClick(i, true)} onMouseEnter={() => setHover(i-0.5)} className="absolute inset-y-0 left-0" style={{ width:sizePx/2, zIndex:1 }} />
                <button type="button" onClick={() => handleClick(i, false)} onMouseEnter={() => setHover(i)} className="absolute inset-y-0 right-0" style={{ width:sizePx/2, zIndex:1 }} />
              </>
            )}
            {filled
              ? <Star className={`text-amber-400 fill-amber-400 absolute inset-0 transition-opacity ${previewing ? "opacity-50" : ""}`} style={{ width:sizePx, height:sizePx }} />
              : half
                ? (
                  <>
                    <Star className="text-zinc-700 absolute inset-0" style={{ width:sizePx, height:sizePx }} />
                    <StarHalf className={`text-amber-400 fill-amber-400 absolute inset-0 transition-opacity ${previewing ? "opacity-50" : ""}`} style={{ width:sizePx, height:sizePx }} />
                  </>
                )
                : <Star className="text-zinc-700 absolute inset-0" style={{ width:sizePx, height:sizePx }} />}
          </span>
        );
      })}
      {display > 0 && <span className="text-xs text-zinc-500 font-data ml-1 inline-block text-right" style={{ width:20 }}>{display}</span>}
    </div>
  );
}

// Компактное меню-троеточие: список команд (иконка + подпись), не занимает место сам по себе и
// не выталкивает соседний контент, сколько бы команд туда ни добавили в будущем. Переиспользуемо
// за пределами библиотеки, если где-то ещё разрастётся кластер кнопок. Позиционируется через
// getBoundingClientRect (не чистым CSS): у кнопки, оказавшейся близко к левому краю экрана (узкое
// окно/телефон, когда карточка переносится в столбец), простое "справа от кнопки" вылезло бы за
// границу — меряем реальное место и подставляем fixed-координаты с зажимом по обеим осям, тем же
// приёмом, что и у ховер-карточки в сетке библиотеки.
export function KebabMenu({ items, buttonClassName }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  function toggle() {
    if (open) { setOpen(false); return; }
    const el = btnRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const menuWidth = 224, margin = 8;
      const showAbove = window.innerHeight - rect.bottom < 200;
      let left = rect.right - menuWidth; // по умолчанию прижато к правому краю кнопки
      left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));
      setPos({ top: showAbove ? rect.top-margin : rect.bottom+margin, left, showAbove });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <>
      <button ref={btnRef} onClick={toggle} className={`p-2 rounded-xl border transition shrink-0 ${open ? "border-zinc-600 text-zinc-200 bg-zinc-800" : "border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"} ${buttonClassName||""}`}>
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && pos && (
        <div ref={menuRef} className="fixed z-30 w-56 py-1.5 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl" style={{ top:pos.top, left:pos.left, transform: pos.showAbove ? "translateY(-100%)" : "none" }}>
          {items.map((it, i) => it.divider ? (
            <div key={i} className="my-1 border-t border-zinc-800" />
          ) : (
            <button key={i} onClick={() => { it.onClick(); setOpen(false); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition ${it.danger ? "text-red-400 hover:bg-red-500/10" : "text-zinc-200 hover:bg-zinc-800"}`}>
              <it.icon className="w-4 h-4 shrink-0" />{it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// Плавающая кнопка добавления: всегда на экране в правом нижнем углу. Живёт здесь, а не в шапке
// раздела, по двум причинам — шапки разгружаются (там остаются только настроечные кнопки и
// кебаб), и главное действие доступно из любой точки длинного списка, не возвращаясь наверх.
// Плавающая кнопка действия. По умолчанию это «добавить», но иконку можно заменить: в профиле
// той же кнопкой открывается правка — место у неё одно и то же, и искать его не приходится.
export function StickyAddButton({ onClick, label, icon:Icon=Plus }) {
  return (
    <button onClick={onClick} title={label}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-amber-500 text-zinc-950 font-medium text-sm shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition">
      <Icon className="w-4 h-4"/><span className="hidden sm:inline">{label}</span>
    </button>
  );
}
