// Оболочка: боковое меню, верхняя панель и поздравление с новым уровнем.

import { imagePosStyle } from "../core/images.js";
import { visibleTabsOf } from "../core/tabs.js";
import { overallOf } from "../core/xp.js";
import { Button, ProgressBar } from "../ui/atoms.jsx";
import { PEOPLE_ICONS } from "../ui/icons.js";
import { Coins, Compass, Menu, Settings, Star, X } from "lucide-react";

export function Sidebar({ tab, onNavigate, open, onClose, state, onOpenSettings }) {
  const overall = overallOf(state);
  const content = (
    <div className="h-full flex flex-col bg-zinc-950 border-r border-zinc-800" style={{ width:256 }}>
      <div className="px-5 py-5 flex items-center gap-2.5 border-b border-zinc-800">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0" style={{ boxShadow:"0 0 16px rgba(245,158,11,0.4)" }}><Compass className="w-5 h-5 text-zinc-950" strokeWidth={2.5}/></div>
        <div className="font-display text-lg tracking-wide text-zinc-100">QuestLife</div>
        <button onClick={onClose} className="ml-auto md:hidden text-zinc-500 hover:text-zinc-200"><X className="w-5 h-5"/></button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto lq-scroll">
        {visibleTabsOf(state).map(t => {
          const Icon = t.icon;
          const active = tab===t.id;
          return (
            <button key={t.id} onClick={() => onNavigate(t.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition border ${active ? "bg-amber-500/10 text-amber-300 border-amber-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border-transparent"}`}>
              <Icon className="w-5 h-5" strokeWidth={active ? 2.3 : 2} />
              {t.label}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-zinc-800 space-y-1">
        <button onClick={onOpenSettings} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition"><Settings className="w-5 h-5"/>Настройки</button>
        {/* Плашка персонажа — вход в свой раздел: это самое очевидное место, куда человек тычет,
            когда хочет посмотреть на себя. */}
        <button onClick={() => onNavigate("profile")} title="Профиль персонажа"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition ${tab==="profile" ? "bg-amber-500/10" : "hover:bg-zinc-900"}`}>
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center" style={{ boxShadow:"0 0 12px rgba(245,158,11,0.35)" }}>
              {state.profile.avatarImage
                ? <img src={state.profile.avatarImage} className="w-full h-full object-cover" style={imagePosStyle(state.profile.avatarPos)} alt="" />
                : (() => { const AvatarIcon = PEOPLE_ICONS[state.profile.avatarIcon] || Star; return <AvatarIcon className="w-5 h-5 text-zinc-950" strokeWidth={2.5} />; })()}
            </div>
            <span className="absolute -bottom-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-zinc-950 border-2 border-zinc-950 flex items-center justify-center">
              <span className="text-[9px] font-data font-bold text-amber-300 leading-none">{overall.level}</span>
            </span>
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-xs text-zinc-300 truncate font-medium">{state.profile.name}</div>
            <ProgressBar value={overall.ratio} heightClass="h-1" />
          </div>
        </button>
      </div>
    </div>
  );
  return (
    <>
      <div className="hidden md:block shrink-0" style={{ position:"sticky", top:0, height:"100vh" }}>{content}</div>
      {open && (
        <div className="fixed inset-0 md:hidden flex" style={{ zIndex:50 }}>
          <div className="absolute inset-0 bg-zinc-950/70" onClick={onClose} />
          <div className="relative">{content}</div>
        </div>
      )}
    </>
  );
}

export function TopBar({ tab, onMenu, state }) {
  const titles = { hub:"Хаб", quests:"Квесты", habits:"Ежедневные привычки", spheres:"Сферы жизни", people:"Люди", library:"Библиотека", nutrition:"Питание", finance:"Финансы", rewards:"Награды", achievements:"Достижения" };
  return (
    <div className="sticky top-0 backdrop-blur bg-zinc-950/80 border-b border-zinc-800 px-4 md:px-8 py-4 flex items-center gap-4" style={{ zIndex:30 }}>
      <button onClick={onMenu} className="md:hidden text-zinc-400 hover:text-zinc-100"><Menu className="w-5 h-5"/></button>
      <h1 className="font-display text-xl tracking-wide text-zinc-100">{titles[tab]}</h1>
      <div className="ml-auto flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-1.5 text-amber-300 font-data text-sm"><Coins className="w-4 h-4"/>{state.profile.currency}</div>
      </div>
    </div>
  );
}

export function LevelUpModal({ level, onClose }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex:55 }}>
      <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative lq-pop text-center">
        <div className="mx-auto w-28 h-28 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center mb-5" style={{ boxShadow:"0 0 60px rgba(245,158,11,0.5)" }}>
          <span className="font-display text-5xl text-zinc-950">{level}</span>
        </div>
        <div className="font-display text-3xl text-amber-300 tracking-wide mb-1">Новый уровень!</div>
        <div className="text-zinc-400 text-sm mb-6">Ты достиг {level} уровня. Так держать.</div>
        <Button onClick={onClose}>Продолжить</Button>
      </div>
    </div>
  );
}
