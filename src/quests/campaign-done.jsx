import { useEffect, useMemo, useState } from "react";
import { clamp } from "../core/basics.js";
import { pluralRu } from "../core/format.js";
import { levelFromXp } from "../core/xp.js";
import { Button, ProgressBar } from "../ui/atoms.jsx";
import { pal } from "../ui/theme.js";
import { Coins, Flag, Sparkles } from "lucide-react";

/* ===================== ПРАЗДНОВАНИЕ ЗАВЕРШЁННОЙ КАМПАНИИ ===================== */
// Событие крупнее обычного левелапа, поэтому у него своя модалка: подводит итог (что закрыто,
// сколько квестов, за сколько дней) и красиво доначисляет опыт — счётчик XP едет вверх, а бейдж
// уровня и полоса прогресса пересчитываются прямо из промежуточного значения счётчика, поэтому
// момент взятия уровня виден глазом, а не «постфактум». Обычный LevelUpModal при завершении
// кампании не показывается (см. completeQuest) — иначе на одно действие вылезали бы две модалки.

// Плавный счётчик: ease-out по requestAnimationFrame, без библиотек.
function useCountUp(target, duration = 1200, delay = 250) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0, cancelled = false;
    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now()) + delay;
    function tick(now) {
      if (cancelled) return;
      const p = clamp((now - t0) / duration, 0, 1);
      setValue(Math.round((target || 0) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [target, duration, delay]);
  return value;
}

function ConfettiBurst({ count = 34 }) {
  // Параметры частиц считаются один раз на монтирование — иначе конфетти «перерождалось» бы на
  // каждом кадре счётчика XP, дёргаясь на месте.
  const pieces = useMemo(() => {
    const colors = ["#f59e0b","#fbbf24","#a78bfa","#34d399","#38bdf8","#fb7185","#e4e4e7"];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      dx: Math.round((Math.random() - 0.5) * 220),
      rot: Math.round(360 + Math.random() * 720),
      w: 5 + Math.round(Math.random() * 6),
      h: 8 + Math.round(Math.random() * 10),
      delay: Math.random() * 1.1,
      dur: 2.4 + Math.random() * 1.8,
      color: colors[i % colors.length],
    }));
  }, [count]);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map(p => (
        <span key={p.id} className="lq-confetti-piece"
          style={{
            left: `${p.left}%`, width: p.w, height: p.h, backgroundColor: p.color,
            animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
            "--lq-dx": `${p.dx}px`, "--lq-rot": `${p.rot}deg`,
          }} />
      ))}
    </div>
  );
}

export function CampaignDoneModal({ data, onClose }) {
  const xp = useCountUp(data.xp || 0, 1400, 500);
  const gold = useCountUp(data.gold || 0, 1400, 700);
  // Уровень и полоса считаются из промежуточного значения счётчика — планка растёт вместе с ним.
  const live = levelFromXp((data.prevTotalXp || 0) + xp);
  const gainedLevel = (data.newLevel || 0) > (data.prevLevel || 0);
  const c = pal(data.color || "amber");
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex:60 }}>
      <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="lq-rays absolute" style={{
          left:"50%", top:"50%", width:900, height:900, marginLeft:-450, marginTop:-450, opacity:0.18,
          background:"repeating-conic-gradient(from 0deg, rgba(245,158,11,0.55) 0deg 8deg, transparent 8deg 22deg)",
          maskImage:"radial-gradient(circle, black 0%, transparent 68%)",
          WebkitMaskImage:"radial-gradient(circle, black 0%, transparent 68%)",
        }} />
      </div>
      <ConfettiBurst />

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-amber-500/30 bg-zinc-950/85 p-6 text-center lq-pop">
          <div className="lq-medal mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center mb-4">
            <Flag className="w-11 h-11 text-zinc-950" />
          </div>
          <div className="text-xs uppercase tracking-[0.2em] text-amber-400/80 font-data mb-1">Кампания завершена</div>
          <div className={`font-display text-2xl ${c.text} tracking-wide mb-4 break-words`}>{data.title}</div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-xl border border-zinc-800 py-2.5 lq-rise" style={{ animationDelay:"0.15s" }}>
              <div className="font-data text-lg text-zinc-100">{data.questCount || 0}</div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-600">{pluralRu(data.questCount||0, "квест", "квеста", "квестов")}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 py-2.5 lq-rise" style={{ animationDelay:"0.25s" }}>
              <div className="font-data text-lg text-zinc-100">{data.days || 0}</div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-600">{pluralRu(data.days||0, "день", "дня", "дней")} пути</div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-5 mb-5">
            <span className="flex items-center gap-1.5 font-data text-xl text-amber-300"><Sparkles className="w-5 h-5"/>+{xp}</span>
            <span className="flex items-center gap-1.5 font-data text-xl text-amber-300"><Coins className="w-5 h-5"/>+{gold}</span>
          </div>

          <div className="rounded-xl border border-zinc-800 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-display text-sm ${gainedLevel && live.level >= (data.newLevel||0) ? "bg-amber-500 text-zinc-950 lq-pulse" : "bg-zinc-800 text-zinc-300"}`}>{live.level}</span>
                <span className="text-xs text-zinc-500">Уровень персонажа</span>
              </div>
              <span className="font-data text-[11px] text-zinc-500">{live.xpIntoLevel}/{live.xpForNext}</span>
            </div>
            <div className="relative">
              <ProgressBar value={live.ratio} colorClass="bg-amber-500" />
              <div className="lq-shine absolute inset-0 rounded-full pointer-events-none" />
            </div>
            {gainedLevel && (
              <div className="text-xs text-amber-300 mt-2">
                {live.level >= (data.newLevel||0) ? `Новый уровень: ${data.newLevel}!` : "Уровень растёт…"}
              </div>
            )}
          </div>

          <Button className="mt-5 w-full" onClick={onClose}>Отлично</Button>
        </div>
      </div>
    </div>
  );
}
