// Медаль боевого отчёта — общая для экрана отчёта и профиля. Отдельным маленьким файлом: профиль
// показывает лучшие медали месяца, и тянуть ради этого весь экран отчёта незачем.

import { pluralRu } from "../core/format.js";
import { pal } from "../ui/theme.js";
import {
  BookOpen, CalendarCheck, CheckSquare, Compass, Dumbbell, Flag, Flame, Medal, PiggyBank, ScrollText,
  Star, TrendingUp, Trophy, Wallet, Zap,
} from "lucide-react";

const MEDAL_ICONS = { ScrollText, TrendingUp, CheckSquare, Dumbbell, BookOpen, Flame, CalendarCheck, Flag, Compass, Zap, PiggyBank, Trophy, Wallet };

// Тайминги вскрытия отчёта — в одном месте, чтобы последовательность читалась целиком.
export const T = {
  count: 1100,          // набег чисел в шапке
  medalsStart: 1000,    // первая медаль — когда числа почти добежали
  medalStep: 220,       // между медалями
  starsAfter: 380,      // первая звезда — после того, как медаль встала
  starStep: 170,        // между звёздами одной медали
};
export const anim = (name, ms, delay, easing = "cubic-bezier(.2,1.3,.4,1)") => ({ animation: `${name} ${ms}ms ${easing} ${delay}ms both` });

export function Stars({ count, size = 14, animate, delay = 0 }) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      {[1, 2, 3].map(i => {
        const lit = i <= count;
        return (
          <Star key={i} style={{ width: size, height: size, ...(animate && lit ? anim("lq-star-in", 450, delay + (i - 1) * T.starStep) : {}),
            ...(lit ? { filter: "drop-shadow(0 0 4px rgba(252,211,77,.7))" } : {}) }}
            className={lit ? "text-amber-300 fill-amber-300" : "text-zinc-700"} />
        );
      })}
    </div>
  );
}

// compact — для профиля: медаль меньше, подпись короче (без «было»).
export function MedalCard({ medal, animate, delay = 0, compact = false }) {
  const c = pal(medal.color);
  const Icon = MEDAL_ICONS[medal.icon] || Medal;
  return (
    <div className="flex flex-col items-center text-center gap-2 p-3 rounded-2xl border border-zinc-800 bg-zinc-950/40"
      style={animate ? anim("lq-medal-pop", 600, delay) : undefined}>
      <div className={`relative ${compact ? "w-12 h-12" : "w-16 h-16"} rounded-full flex items-center justify-center`}
        style={{ background: `radial-gradient(circle at 35% 30%, ${c.hex}55, ${c.hex}11 70%)`, border: `2px solid ${c.hex}`, boxShadow: `0 0 18px ${c.hex}33` }}>
        {animate && <span className="absolute inset-0 rounded-full pointer-events-none" style={{ border: `2px solid ${c.hex}`, ...anim("lq-ring", 900, delay + 150, "ease-out") }} />}
        <Icon className={`${compact ? "w-5 h-5" : "w-7 h-7"} ${c.text}`} />
      </div>
      {medal.stars ? <Stars count={medal.stars} size={compact ? 12 : 14} animate={animate} delay={delay + T.starsAfter} /> : <div className="text-[10px] font-data uppercase tracking-widest text-zinc-500">особая</div>}
      <div className="text-sm font-semibold text-zinc-100 leading-tight">{medal.title}</div>
      <div className="text-[11px] text-zinc-500 leading-snug">
        {medal.stars
          ? <>{medal.value.toLocaleString("ru-RU")} {pluralRu(medal.value, ...medal.unit)}{!compact && medal.prev != null && <> · было {medal.prev.toLocaleString("ru-RU")}</>}</>
          : medal.detail}
      </div>
    </div>
  );
}
