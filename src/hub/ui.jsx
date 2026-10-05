// Хаб: сводка дня — уровень, сферы-розетка, привычки, ближайшие квесты, тепловая карта активности.

import { LibraryTitle } from "../library/title.jsx";
import { LinkedHabitCompactRow } from "../habits/ui.jsx";
import { useMemo, useState } from "react";
import { addDaysStr, clamp, todayStr } from "../core/basics.js";
import { fmtDateShort } from "../core/format.js";
import { imagePosStyle } from "../core/images.js";
import { continuousLevel, levelFromXp, overallOf } from "../core/xp.js";
import { computeStreak, isLogHabit } from "../habits/model.js";
import { LibraryCover } from "../library/cover.jsx";
import { AchievementCard } from "../profile/achievements-ui.jsx";
import { achievementProgress } from "../profile/achievements.js";
import { campaignNextQuest, campaignQuestsOf, campaignStats } from "../quests/campaigns.js";
import { questMainSphere } from "../quests/links.js";
import { QuestRow } from "../quests/quest-row.jsx";
import { compareCampaignPlan, sortByDeadlineFirst } from "../quests/sorting.js";
import { questStartOf } from "../quests/spans.js";
import { Button, Card, EmptyState, ProgressBar } from "../ui/atoms.jsx";
import { PEOPLE_ICONS } from "../ui/icons.js";
import { pal } from "../ui/theme.js";
import { Check, ChevronDown, Coins, Flame, ScrollText, Star } from "lucide-react";

/* ============================ ACTIVITY HEATMAP ============================ */

function ActivityHeatmap({ habits }) {
  const days = 84;
  const cells = useMemo(() => {
    const arr = [];
    for (let i = days-1; i >= 0; i--) {
      const ds = addDaysStr(-i);
      const total = habits.length;
      const done = habits.filter(h => (h.logs||[]).includes(ds)).length;
      arr.push({ date: ds, ratio: total ? done/total : 0 });
    }
    return arr;
  }, [habits]);

  if (habits.length === 0) {
    return <div className="text-sm text-zinc-500">Добавь привычки во вкладке «Привычки» — здесь появится карта активности.</div>;
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  function shade(ratio) {
    if (ratio <= 0) return "bg-zinc-800/60";
    if (ratio < 0.34) return "bg-emerald-900";
    if (ratio < 0.67) return "bg-emerald-700";
    if (ratio < 1) return "bg-emerald-500";
    return "bg-emerald-400";
  }

  return (
    <div className="overflow-x-auto lq-scroll pb-1">
      <div className="inline-flex gap-1">
        {weeks.map((w,wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {w.map(c => <div key={c.date} title={`${c.date}: ${Math.round(c.ratio*100)}%`} className={`w-3 h-3 rounded-sm ${shade(c.ratio)}`} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ ATTRIBUTE ROSETTE ============================ */

function AttributeRosette({ spheres, onSelectSphere }) {
  const cx = 220, cy = 190, maxR = 100;
  const N = Math.max(spheres.length, 1);
  const rings = [0.25, 0.5, 0.75, 1];
  const maxContinuous = Math.max(0.001, ...spheres.map(continuousLevel));

  function polar(i, r) {
    const theta = i * (2*Math.PI/N);
    return { x: cx + r*Math.sin(theta), y: cy - r*Math.cos(theta), thetaDeg: (theta*180/Math.PI) };
  }
  function anchorFor(thetaDeg) {
    const t = ((thetaDeg % 360) + 360) % 360;
    if (t < 15 || t > 345) return { anchor:"middle", dy:-8 };
    if (t > 165 && t < 195) return { anchor:"middle", dy:18 };
    if (t <= 165) return { anchor:"start", dy:4 };
    return { anchor:"end", dy:4 };
  }
  function ratioOf(sphere) {
    return clamp(continuousLevel(sphere) / maxContinuous, 0.08, 1);
  }

  const ringPts = rings.map(f => spheres.map((_,i) => { const p = polar(i, maxR*f); return `${p.x},${p.y}`; }).join(" "));
  const valuePts = spheres.map((s,i) => { const p = polar(i, maxR*ratioOf(s)); return `${p.x},${p.y}`; }).join(" ");

  return (
    <svg viewBox="0 0 440 400" className="w-full h-auto" style={{ maxWidth: 440 }}>
      <defs>
        <radialGradient id="lq-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={maxR*0.55} fill="url(#lq-core-glow)" className="lq-pulse" />
      {ringPts.map((pts,ri) => <polygon key={ri} points={pts} fill="none" stroke="#3f3f46" strokeOpacity="0.6" strokeWidth="1" />)}
      {spheres.map((s,i) => { const p = polar(i, maxR); return <line key={s.id} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#3f3f46" strokeOpacity="0.6" strokeWidth="1" />; })}
      <polygon points={valuePts} fill="#f59e0b" fillOpacity="0.18" stroke="#fbbf24" strokeWidth="2" strokeLinejoin="round" />
      {spheres.map((s,i) => {
        const p = polar(i, maxR*ratioOf(s));
        const lp = polar(i, maxR + 38);
        const a = anchorFor(lp.thetaDeg);
        const c = pal(s.color);
        const lvl = levelFromXp(s.xp);
        return (
          <g key={s.id} className="cursor-pointer" onClick={() => onSelectSphere && onSelectSphere(s.id)}>
            <circle cx={p.x} cy={p.y} r="5.5" fill={c.hex} stroke="#09090b" strokeWidth="2" />
            <text x={lp.x} y={lp.y + a.dy} textAnchor={a.anchor} fill="#d4d4d8" fontSize="12" fontWeight="600" className="font-body">{s.name}</text>
            <text x={lp.x} y={lp.y + a.dy + 14} textAnchor={a.anchor} fill={c.hex} fontSize="10" className="font-data">Ур. {lvl.level}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ================================== HUB ================================== */


export function HubView({ state, actions, navigate }) {
  const overall = overallOf(state);
  // «Активные квесты» — только СВОИ квесты, вне кампаний: у кампаний свой блок ниже, и мешать их
  // в общую кучу незачем — иначе большая кампания вытесняет с главного экрана всё остальное.
  const activeQuests = useMemo(
    () => state.quests.filter(q => q.status==="active" && !q.campaignId).sort(sortByDeadlineFirst).slice(0,4),
    [state.quests]
  );
  // До трёх активных кампаний с прогрессом — крупные цели должны быть видны с главного экрана.
  const liveCampaigns = useMemo(() => (state.campaigns||[]).filter(c => c.status==="active").slice(0,3), [state.campaigns]);
  // Раскрытая на Хабе кампания показывает свои квесты НА СЕГОДНЯ — то есть те, чей диапазон
  // накрывает текущий день, плюс просроченные (они тоже требуют внимания именно сегодня).
  const [openCampaignId, setOpenCampaignId] = useState(null);
  function campaignTodayQuests(campaignId) {
    const today = todayStr();
    const indexOf = (q) => state.quests.indexOf(q);
    return campaignQuestsOf(state.quests, campaignId)
      .filter(q => q.status==="active" && q.deadline && (questStartOf(q) <= today))
      .sort((a,b) => compareCampaignPlan(a, b, state.campaigns, indexOf));
  }
  const doneToday = state.habits.filter(h => (h.logs||[]).includes(todayStr())).length;
  const bestStreak = state.habits.filter(h => !isLogHabit(h)).reduce((m,h) => Math.max(m, computeStreak(h.logs||[])), 0);
  const libraryInProgress = useMemo(() => {
    const items = [
      ...(state.books||[]).filter(b => b.status==="active" && b.tracked).map(x => ({ ...x, libKind:"book" })),
      ...(state.games||[]).filter(g => g.status==="active" && g.tracked).map(x => ({ ...x, libKind:"game" })),
      ...(state.movies||[]).filter(m => m.status==="active" && m.tracked).map(x => ({ ...x, libKind:"movie" })),
    ];
    return items.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,5);
  }, [state.books, state.games, state.movies]);
  const topSphere = useMemo(() => {
    if (state.spheres.length===0) return null;
    return state.spheres.reduce((best,s) => continuousLevel(s) > continuousLevel(best) ? s : best, state.spheres[0]);
  }, [state.spheres]);
  const hubAchievements = useMemo(() => {
    const list = state.achievements || [];
    const withProg = list.map(a => ({ a, prog: achievementProgress(a, state) }));
    const unlocked = withProg.filter(x => x.a.unlockedAt).sort((x,y) => y.a.unlockedAt.localeCompare(x.a.unlockedAt));
    const locked = withProg.filter(x => !x.a.unlockedAt).sort((x,y) => (y.prog.current/(y.prog.target||1)) - (x.prog.current/(x.prog.target||1)));
    return [...unlocked.slice(0,3), ...locked.slice(0,3)].slice(0,6).map(x => x.a);
  }, [state.achievements, state.spheres, state.quests, state.habits, state.profile, state.transactions]);

  return (
    <div className="space-y-6">
      {/* Character status bar — first, as requested */}
      <Card className="p-5">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center" style={{ boxShadow:"0 0 24px rgba(245,158,11,0.35)" }}>
                {state.profile.avatarImage
                  ? <img src={state.profile.avatarImage} className="w-full h-full object-cover" style={imagePosStyle(state.profile.avatarPos)} alt="" />
                  : (() => { const AvatarIcon = PEOPLE_ICONS[state.profile.avatarIcon] || Star; return <AvatarIcon className="w-7 h-7 text-zinc-950" strokeWidth={2.3} />; })()}
              </div>
              <span className="absolute -bottom-1.5 -right-1.5 min-w-[24px] h-[24px] px-1.5 rounded-full bg-zinc-950 border-2 border-zinc-900 flex items-center justify-center">
                <span className="text-xs font-data font-bold text-amber-300 leading-none">{overall.level}</span>
              </span>
            </div>
            <div>
              <div className="text-zinc-100 font-semibold">{state.profile.name}</div>
              <div className="text-xs text-zinc-500 font-data">{overall.xpIntoLevel} / {overall.xpForNext} XP</div>
            </div>
          </div>
          <div className="flex-1" style={{ minWidth:160 }}><ProgressBar value={overall.ratio} colorClass="bg-gradient-to-r from-amber-500 to-amber-300" /></div>
          <div className="flex items-center gap-5 shrink-0">
            <div className="flex items-center gap-2 text-amber-300"><Coins className="w-5 h-5"/><span className="font-data font-semibold text-lg">{state.profile.currency}</span></div>
            <div className="flex items-center gap-2 text-orange-400"><Flame className="w-5 h-5"/><span className="font-data font-semibold text-lg">{bestStreak}</span><span className="text-xs text-zinc-500">дн.</span></div>
          </div>
        </div>
      </Card>

      {/* Sphere balance rosette — second */}
      <Card className="p-6 flex flex-col items-center">
        <div className="w-full flex items-start justify-between mb-1 flex-wrap gap-1">
          <div className="font-data text-xs tracking-widest text-zinc-500 uppercase">Баланс сфер жизни</div>
          {topSphere && <div className="text-xs text-zinc-600">Шкала — по сфере «{topSphere.name}»</div>}
        </div>
        <AttributeRosette spheres={state.spheres} onSelectSphere={(id) => navigate("spheres", id)} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-zinc-200">Сегодня</div>
            <div className="font-data text-xs text-zinc-500">{doneToday}/{state.habits.length}</div>
          </div>
          {state.habits.length === 0 ? (
            <div className="text-sm text-zinc-500">Нет ежедневных задач. Добавь их во вкладке «Привычки».</div>
          ) : (
            <div className="space-y-2 overflow-y-auto lq-scroll pr-1" style={{ maxHeight:224 }}>
              {state.habits.map(h => {
                if (h.linkedKind) return <LinkedHabitCompactRow key={h.id} habit={h} state={state} actions={actions} navigate={navigate} />;
                const done = (h.logs||[]).includes(todayStr());
                const sphere = state.spheres.find(s => s.id===h.sphereId);
                const c = pal(sphere && sphere.color);
                return (
                  <button key={h.id} onClick={() => actions.toggleHabitToday(h.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition text-left ${done ? "bg-zinc-800/40 border-zinc-800" : "bg-zinc-950/40 border-zinc-800 hover:border-zinc-700"}`}>
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${done ? c.bgSolid + " border-transparent" : "border-zinc-600"}`}>{done && <Check className="w-3.5 h-3.5 text-zinc-950"/>}</span>
                    <span className={`text-sm flex-1 ${done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{h.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-zinc-200">Активные квесты</div>
            <button onClick={() => navigate("quests")} className="text-xs text-amber-400 hover:text-amber-300 font-medium">Все квесты →</button>
          </div>
          {activeQuests.length === 0 ? (
            <EmptyState icon={ScrollText} title="Нет активных квестов"
              subtitle={(state.quests||[]).some(q => q.status==="active" && q.campaignId)
                ? "Свободных квестов нет — всё активное сейчас внутри кампаний, они ниже."
                : "Создай первый квест и получи опыт с наградой."}
              action={<Button size="sm" onClick={() => navigate("quests")}>Создать квест</Button>} />
          ) : (
            <div className="space-y-2">
              {activeQuests.map(q => <QuestRow key={q.id} quest={q} sphere={questMainSphere(state.spheres, q)} onComplete={() => actions.completeQuest(q.id)} />)}
            </div>
          )}
        </Card>
      </div>

      {/* Активные кампании — только если они есть: пустая карточка «у вас нет кампаний» на Хабе
          не нужна, для этого есть сама вкладка. */}
      {liveCampaigns.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-zinc-200">Кампании</div>
            <button onClick={() => { actions.updateQuestsPrefs({ view:"campaigns" }); navigate("quests"); }}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium">Открыть →</button>
          </div>
          <div className="space-y-3">
            {liveCampaigns.map(c => {
              const st = campaignStats(state.quests, c);
              const next = campaignNextQuest(state.quests, c.id);
              const sphere = state.spheres.find(sp => sp.id===c.sphereId);
              const cc = pal(c.color || (sphere && sphere.color));
              const open = openCampaignId === c.id;
              const todayQuests = open ? campaignTodayQuests(c.id) : [];
              return (
                <div key={c.id}>
                  <button onClick={() => setOpenCampaignId(open ? null : c.id)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className={`text-sm truncate flex items-center gap-1.5 ${cc.text}`}>
                        {c.title}
                        <ChevronDown className="w-3 h-3 shrink-0 opacity-60 transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }}/>
                      </span>
                      <span className="text-xs font-data text-zinc-500 shrink-0">{st.done}/{st.total}</span>
                    </div>
                    <ProgressBar value={st.progress} colorClass={cc.bgSolid} heightClass="h-1.5" />
                    {!open && next && <div className="text-xs text-zinc-600 truncate mt-1">Дальше: {next.title}{next.deadline ? ` · ${fmtDateShort(questStartOf(next))}` : ""}</div>}
                  </button>
                  {open && (
                    <div className="mt-2 space-y-2">
                      {todayQuests.length === 0 ? (
                        <div className="text-xs text-zinc-600">
                          На сегодня в этой кампании ничего нет.
                          {next && <> Ближайший шаг — «{next.title}»{next.deadline ? ` ${fmtDateShort(questStartOf(next))}` : ""}.</>}
                        </div>
                      ) : todayQuests.map(q => (
                        <QuestRow key={q.id} quest={q} sphere={questMainSphere(state.spheres, q)}
                          onComplete={() => actions.completeQuest(q.id)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="text-sm font-semibold text-zinc-200 mb-3">Активность за 12 недель</div>
        <ActivityHeatmap habits={state.habits} />
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-zinc-200">Сейчас в процессе</div>
          <button onClick={() => navigate("library")} className="text-xs text-amber-400 hover:text-amber-300 font-medium">Библиотека →</button>
        </div>
        {libraryInProgress.length === 0 ? (
          <div className="text-sm text-zinc-500">Отметь глазом то, что сейчас читаешь, проходишь или смотришь — до 5 штук, появится здесь.</div>
        ) : (
          <div className="space-y-2">
            {libraryInProgress.map(item => {
              const quickField = item.libKind==="book" ? "pagesRead" : item.libKind==="game" ? "hours" : (item.kind==="series" ? "episodeAt" : null);
              return (
                <div key={`${item.libKind}-${item.id}`} onClick={() => navigate("library", { kind:item.libKind, id:item.id })} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 transition cursor-pointer">
                  <LibraryCover item={item} className="text-xl shrink-0 w-9 aspect-[2/3] rounded-lg bg-zinc-900" />
                  <div className="min-w-0 flex-1">
                    <LibraryTitle item={item} className="text-sm text-zinc-200 truncate" />
                    <div className="text-xs text-zinc-500">
                      {item.libKind==="book" && `${item.pagesRead}${item.pagesTotal>0 ? `/${item.pagesTotal}` : ""} стр.`}
                      {item.libKind==="game" && `${item.hours} ч.`}
                      {item.libKind==="movie" && (item.kind==="series" ? `Серия ${item.episodeAt}${item.episodesTotal>0 ? `/${item.episodesTotal}` : ""}` : "Фильм")}
                    </div>
                  </div>
                  {quickField && (
                    <button onClick={(e) => { e.stopPropagation(); actions.updateLibraryItem(item.libKind, item.id, { [quickField]: (item[quickField]||0) + 1 }); }}
                      className="shrink-0 text-xs px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-amber-300 hover:bg-zinc-700 transition">+1</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-zinc-200">Достижения</div>
          <button onClick={() => navigate("achievements")} className="text-xs text-amber-400 hover:text-amber-300 font-medium">Все достижения →</button>
        </div>
        {hubAchievements.length === 0 ? (
          <div className="text-sm text-zinc-500">Пока нет достижений — загляни во вкладку «Достижения».</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto lq-scroll pb-1">
            {hubAchievements.map(a => <AchievementCard key={a.id} achievement={a} state={state} compact />)}
          </div>
        )}
      </Card>
    </div>
  );
}
