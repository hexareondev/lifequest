// Вкладка «Отчёты»: боевой отчёт за месяц и архив всех прошлых. Отчёт собирается из журналов
// на лету (см. reports/model.js), здесь только показ.

import { useEffect, useMemo, useState } from "react";
import { MedalCard, T, anim } from "./medal.jsx";
import { todayStr } from "../core/basics.js";
import { fmtDateShort, fmtMoney, monthNameGen, pluralRu } from "../core/format.js";
import { Card, EmptyState, ProgressBar } from "../ui/atoms.jsx";
import { pal } from "../ui/theme.js";
import {
  buildMonthReport, comparisonReport, monthDays, monthOf, reportMedals, reportMonths,
  reportTitle, shiftMonth, sphereDrops,
} from "./model.js";
import {
  BookOpen, CheckSquare, Compass, Dumbbell, Flag, Flame, Hourglass, Lock, Medal, RotateCcw,
  ScrollText, TrendingDown, TrendingUp, Utensils, Wallet,
} from "lucide-react";



/* ----------------------------- Анимация ----------------------------- */
// При первом открытии отчёта за завершённый месяц он «вскрывается»: числа набегают от нуля, медали
// появляются одна за другой, звёзды загораются по очереди. Повторно — только по кнопке.
// Тайминги в одном месте, чтобы последовательность читалась целиком.
const medalDelay = (i) => T.medalsStart + i * T.medalStep;
const revealEnd = (medalCount) => medalDelay(Math.max(0, medalCount - 1)) + T.starsAfter + 3 * T.starStep + 300;

const KEYFRAMES = `
@keyframes lq-medal-pop { 0% { transform: scale(.3); opacity: 0 } 60% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
@keyframes lq-ring { 0% { transform: scale(.6); opacity: .9 } 100% { transform: scale(1.9); opacity: 0 } }
@keyframes lq-star-in { 0% { transform: scale(0) rotate(-120deg); opacity: 0 } 65% { transform: scale(1.6) rotate(10deg); opacity: 1 } 100% { transform: scale(1) rotate(0); opacity: 1 } }
@keyframes lq-fade-up { 0% { transform: translateY(10px); opacity: 0 } 100% { transform: none; opacity: 1 } }
`;


function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
}

// Число, набегающее от нуля. Без анимации — сразу итоговое.
function CountUp({ value, animate, delay = 0, duration = T.count }) {
  const [shown, setShown] = useState(animate ? 0 : value);
  useEffect(() => {
    if (!animate) { setShown(value); return; }
    let raf, start = null;
    const tick = (t) => {
      if (start === null) start = t + delay;
      const k = Math.min(1, Math.max(0, (t - start) / duration));
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, animate]);
  return <>{shown.toLocaleString("ru-RU")}</>;
}

/* ------------------------------ Мелочи ------------------------------ */

// Разница с прошлым месяцем: ▲ +5 / ▼ −2. Без прошлого месяца — ничего. invert — для чисел, где
// рост плохо (расходы): стрелка та же, цвет наоборот.
function Delta({ value, prev, unit = "", invert = false }) {
  if (prev == null) return null;
  const d = value - prev;
  if (d === 0) return <span className="text-[11px] text-zinc-600 font-data">как в прошлом</span>;
  const up = d > 0, good = invert ? !up : up;
  return (
    <span className={`text-[11px] font-data ${good ? "text-emerald-400" : "text-rose-400"}`}>
      {up ? "▲" : "▼"} {up ? "+" : "−"}{Math.abs(d).toLocaleString("ru-RU")}{unit}
    </span>
  );
}

function StatTile({ icon: Icon, label, value, prev, color, animate }) {
  const c = pal(color);
  return (
    <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/40">
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 uppercase tracking-wide font-data"><Icon className={`w-3.5 h-3.5 ${c.text}`} />{label}</div>
      <div className="font-data text-2xl text-zinc-100 mt-1"><CountUp value={value} animate={animate} /></div>
      <span style={animate ? anim("lq-fade-up", 400, T.count, "ease-out") : undefined} className="inline-block"><Delta value={value} prev={prev} /></span>
    </div>
  );
}

function Block({ icon: Icon, title, children, color = "amber" }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${pal(color).text}`} />
        <div className="text-sm font-semibold text-zinc-200">{title}</div>
      </div>
      {children}
    </Card>
  );
}

// Строка блока: подпись слева, значение справа, разница с прошлым месяцем — перед значением.
const Row = ({ label, value, sub }) => (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <span className="text-sm text-zinc-400">{label}</span>
    <span className="flex items-baseline gap-2 shrink-0">{sub}<span className="font-data text-sm text-zinc-100">{value}</span></span>
  </div>
);

/* ------------------------------ Бюджет ------------------------------ */
// Бюджет месяца в отчёте — те же категории, что отслеживались в финансах в этом месяце, с пометками
// об изменениях плана относительно прошлого месяца.
function BudgetReport({ budget }) {
  if (!budget.rows.length) return null;
  const ch = budget.changes;
  const mark = (cat) => {
    if (ch.added.includes(cat)) return <span className="text-[10px] font-data px-1 rounded bg-emerald-500/15 text-emerald-300">новая</span>;
    const c = ch.changed.find(x => x.category === cat);
    return c ? <span className="text-[10px] font-data px-1 rounded bg-sky-500/15 text-sky-300">было {fmtMoney(c.from)}</span> : null;
  };
  return (
    <div className="mt-2 pt-2 border-t border-zinc-800">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-data">Бюджет</span>
        <span className={`text-xs font-data ${budget.spentInBudget > budget.planned ? "text-rose-400" : "text-zinc-300"}`}>{fmtMoney(budget.spentInBudget)} / {fmtMoney(budget.planned)}</span>
      </div>
      <div className="space-y-1.5">
        {budget.rows.map(r => {
          const over = r.limit > 0 && r.spent > r.limit;
          return (
            <div key={r.category}>
              <div className="flex items-baseline justify-between text-xs gap-2">
                <span className="text-zinc-400 flex items-center gap-1.5 min-w-0"><span className="truncate">{r.category}</span>{mark(r.category)}</span>
                <span className={`font-data shrink-0 ${over ? "text-rose-400" : "text-zinc-300"}`}>{fmtMoney(r.spent)} / {r.limit ? fmtMoney(r.limit) : "—"}</span>
              </div>
              <ProgressBar value={r.limit ? Math.min(1, r.spent / r.limit) : 0} colorClass={over ? "bg-rose-500" : "bg-amber-500"} heightClass="h-1" />
            </div>
          );
        })}
      </div>
      {ch.removed.length > 0 && <div className="text-[11px] text-zinc-600 mt-1.5">Убраны из бюджета в этом месяце: {ch.removed.join(", ")}.</div>}
      {budget.outside > 0 && <div className="text-[11px] text-zinc-600 mt-1">Вне бюджета потрачено {fmtMoney(budget.outside)}.</div>}
    </div>
  );
}

/* -------------------------- Идущий месяц -------------------------- */
// Отчёт за идущий месяц закрыт: отчёт — итог, а не цель, на которую работают. Под размытием —
// заготовка без настоящих чисел (сквозь размытие настоящие можно угадать), сверху — когда откроется.
function SealedMonth({ ym, today }) {
  const opens = shiftMonth(ym, 1);
  const left = monthDays(ym) - Number(today.slice(8, 10)) + 1;
  const bar = (w) => <div className="h-1.5 rounded-full bg-zinc-700" style={{ width: `${w}%` }} />;
  return (
    <div className="relative">
      <div aria-hidden className="space-y-6 pointer-events-none select-none" style={{ filter: "blur(9px)", opacity: 0.55 }}>
        <Card className="p-6">
          <div className="h-3 w-28 rounded bg-amber-500/40" />
          <div className="h-7 w-52 rounded bg-zinc-600 mt-3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl border border-zinc-700 bg-zinc-800/60" />)}
          </div>
        </Card>
        <Card className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {["amber", "indigo", "emerald", "violet", "sky"].map(col => (
              <div key={col} className="h-36 rounded-2xl border border-zinc-800 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full" style={{ border: `2px solid ${pal(col).hex}`, background: `${pal(col).hex}33` }} />
              </div>
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1].map(k => <Card key={k} className="p-5 space-y-3">{[80, 55, 65, 30, 45].map((w, i) => <div key={i}>{bar(w)}</div>)}</Card>)}
        </div>
      </div>
      <div className="absolute inset-x-0 top-10 flex justify-center px-4">
        <Card className="p-6 max-w-md text-center" style={{ boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
          <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ border: "2px solid #f59e0b", boxShadow: "0 0 20px rgba(245,158,11,.3)" }}>
            <Lock className="w-6 h-6 text-amber-300" />
          </div>
          <div className="font-data text-xs tracking-[0.3em] text-amber-400/80 uppercase">Ещё считается</div>
          <div className="font-display text-2xl text-zinc-100 mt-1">{reportTitle(ym)}</div>
          <p className="text-sm text-zinc-400 mt-3 leading-relaxed">
            Отчёт — это итог месяца, а не цель, на которую работают. Живи и отмечай как обычно —
            {" "}итоги и медали откроются, когда месяц закончится.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-xs font-data text-zinc-500">
            <Hourglass className="w-3.5 h-3.5 text-amber-400" />
            откроется 1 {monthNameGen(opens)} · {left === 1 ? "завтра" : `через ${left} ${pluralRu(left, "день", "дня", "дней")}`}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------ Отчёт ------------------------------ */

export function ReportsView({ state, actions, focus, setFocus }) {
  const today = todayStr();
  const months = useMemo(() => reportMonths(state, today), [state, today]);
  // По умолчанию — последний завершённый месяц: идущий интересен меньше, его итоги ещё не итоги.
  const fallback = months.find(m => m !== monthOf(today)) || months[0] || null;
  const ym = focus && months.includes(focus) ? focus : fallback;
  const seen = state.reportsSeen || [];

  const { report, prev, medals, drops } = useMemo(() => {
    if (!ym) return {};
    const cache = {};
    const report = cache[ym] = buildMonthReport(state, ym, today);
    // Сравнение — с прошлым месяцем; для идущего — с теми же днями прошлого (см. comparisonReport).
    // В кэш медалей кладётся только полный прошлый месяц: обрезанный для звёзд не годится.
    const prev = comparisonReport(state, ym, today);
    if (prev && !prev.partial) cache[prev.ym] = prev;
    return { report, prev, medals: reportMedals(state, ym, today, cache), drops: sphereDrops(report, prev) };
  }, [state, ym, today, months]);

  // Первое открытие отчёта за завершённый месяц: проигрываем вскрытие и отмечаем отчёт открытым —
  // на Хабе он больше не объявляется. play.key пересоздаёт анимированные элементы при повторе.
  const [play, setPlay] = useState(null);
  const startPlay = () => setPlay(prefersReducedMotion() ? null : { ym, key: Date.now() });
  useEffect(() => {
    if (ym && ym !== monthOf(today) && !seen.includes(ym)) { startPlay(); actions.markReportSeen(ym); }
  }, [ym]);
  const animate = !!play && play.ym === ym;
  // Когда последняя звезда загорелась, кнопка «Пропустить» больше не нужна.
  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setPlay(null), revealEnd(medals.length) + 200);
    return () => clearTimeout(t);
  }, [animate, play && play.key]);

  if (!ym) {
    return <EmptyState icon={Medal} title="Отчётов пока нет"
      subtitle="Отчёт за месяц собирается из выполненных квестов, привычек, тренировок и других записей. Начни — и в начале следующего месяца придёт первый." />;
  }

  const m = report.metrics, pm = prev && prev.metrics;
  const sealed = report.ongoing;
  const k = animate ? play.key : "static";
  const after = animate ? anim("lq-fade-up", 500, revealEnd(medals.length) - 300, "ease-out") : undefined;
  const maxSphereXp = Math.max(1, ...report.spheres.map(s => s.xp), ...(prev ? prev.spheres.map(s => s.xp) : []));

  return (
    <div className="space-y-6">
      {/* Архив: все месяцы, новые первыми. Точка — отчёт ещё не открывали. */}
      <div className="flex gap-2 overflow-x-auto lq-scroll pb-1">
        {months.map(mo => {
          const active = mo === ym, ongoing = mo === monthOf(today);
          return (
            <button key={mo} onClick={() => setFocus(mo)}
              className={`shrink-0 px-3 py-1.5 rounded-lg border text-xs font-data transition flex items-center gap-1.5 ${active ? "border-amber-500/50 bg-amber-500/10 text-amber-200" : "border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"}`}>
              {reportTitle(mo)}
              {ongoing && <Lock className="w-3 h-3 text-zinc-500" />}
              {!ongoing && !seen.includes(mo) && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </button>
          );
        })}
      </div>

      <style>{KEYFRAMES}</style>

      {sealed ? <SealedMonth ym={ym} today={today} /> : (<>
      {/* Шапка отчёта */}
      <Card className="p-6 relative overflow-hidden">
        {report.hasData && (
          <button onClick={() => (animate ? setPlay(null) : startPlay())}
            className="absolute top-4 right-4 z-10 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-amber-300 transition">
            {animate ? "Пропустить" : <><RotateCcw className="w-3.5 h-3.5" />Показать снова</>}
          </button>
        )}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 85% 0%, rgba(245,158,11,0.12), transparent 50%)" }} />
        <div className="relative">
          <div className="font-data text-xs tracking-[0.3em] text-amber-400/80 uppercase">Боевой отчёт</div>
          <h2 className="font-display text-3xl text-zinc-100 tracking-wide mt-1">{report.title}</h2>
          <div className="text-xs text-zinc-500 mt-1">
            {prev ? `В сравнении с прошлым месяцем.` : `Первый отчёт — сравнивать пока не с чем, звёзды появятся со следующего.`}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <StatTile icon={ScrollText} label="Квестов" value={m.quests} prev={pm && pm.quests} color="amber" animate={animate} key={"q"+k} />
            <StatTile icon={TrendingUp} label="Опыта" value={m.xp} prev={pm && pm.xp} color="indigo" animate={animate} key={"x"+k} />
            <StatTile icon={Flame} label="Активных дней" value={m.activeDays} prev={pm && pm.activeDays} color="orange" animate={animate} key={"a"+k} />
            <StatTile icon={Dumbbell} label="Тренировок" value={m.workouts} prev={pm && pm.workouts} color="emerald" animate={animate} key={"w"+k} />
          </div>
        </div>
      </Card>

      {!report.hasData ? (
        <Card className="p-8 text-center text-sm text-zinc-500">В этом месяце ничего не записано.</Card>
      ) : (<>
        {/* Медали */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><Medal className="w-4 h-4 text-amber-400" /><div className="text-sm font-semibold text-zinc-200">Медали</div></div>
            <div className="text-xs font-data text-zinc-500">{medals.length}</div>
          </div>
          {medals.length === 0 ? (
            <div className="text-sm text-zinc-500">В этом месяце без медалей. Звёзды даются за рост относительно своих прошлых месяцев.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {medals.map((md, i) => <MedalCard key={md.id + k} medal={md} animate={animate} delay={medalDelay(i)} />)}
            </div>
          )}
        </Card>

        <div key={"blocks" + k} className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={after}>
          {/* Сферы */}
          <Block icon={Compass} title="Опыт по сферам" color="indigo">
            <div className="space-y-2.5">
              {report.spheres.map(s => {
                const p = prev && prev.spheres.find(x => x.id === s.id);
                const c = pal(s.color);
                return (
                  <div key={s.id}>
                    <div className="flex items-baseline justify-between text-xs mb-1">
                      <span className={c.text}>{s.name}</span>
                      <span className="flex items-baseline gap-2"><span className="font-data text-zinc-200">{s.xp} XP</span><Delta value={s.xp} prev={p ? p.xp : null} /></span>
                    </div>
                    <ProgressBar value={s.xp / maxSphereXp} colorClass={c.bgSolid} heightClass="h-1.5" />
                  </div>
                );
              })}
            </div>
            {drops.length > 0 && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-xl border border-rose-500/20 bg-rose-500/5">
                <TrendingDown className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-300">
                  Просела сфера «{drops[0].name}»: {drops[0].xp} XP против {drops[0].prevXp} в прошлом месяце.
                  {drops.length > 1 && <span className="text-zinc-500"> Ещё ниже прошлого: {drops.slice(1).map(d => d.name).join(", ")}.</span>}
                </div>
              </div>
            )}
            <div className="text-[11px] text-zinc-600 mt-3">Из квестов, привычек, закрытых кампаний и завершённого в библиотеке.</div>
          </Block>

          {/* Квесты и кампании */}
          <Block icon={ScrollText} title="Квесты" color="amber">
            <Row label="Выполнено" value={report.quests.done} sub={<Delta value={report.quests.done} prev={prev && prev.quests.done} />} />
            <Row label="Провалено" value={report.quests.failed} />
            <Row label="Золота за квесты" value={report.quests.gold} />
            {report.campaignsDone.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[11px] text-zinc-500 uppercase tracking-wide font-data">Закрытые кампании</div>
                {report.campaignsDone.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className={`flex items-center gap-1.5 ${pal(c.color).text}`}><Flag className="w-3.5 h-3.5" />{c.title}</span>
                    {c.xp > 0 && <span className="font-data text-xs text-zinc-400">+{c.xp} XP</span>}
                  </div>
                ))}
              </div>
            )}
            {report.bestDay && (
              <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-400">
                Лучший день месяца — <span className="text-amber-300">{fmtDateShort(report.bestDay.date)}</span>: больше всего сделано за один день.
              </div>
            )}
          </Block>

          {/* Привычки */}
          <Block icon={CheckSquare} title="Привычки" color="sky">
            {report.habits.length === 0 ? <div className="text-sm text-zinc-500">Привычек нет.</div> : (
              <div className="space-y-2.5">
                {report.habits.map(h => (
                  <div key={h.id}>
                    <div className="flex items-baseline justify-between text-xs mb-1 gap-2">
                      <span className="text-zinc-300 truncate">{h.title}</span>
                      <span className="font-data text-zinc-400 shrink-0">{h.days}/{report.countedDays}{h.bestStreak > 1 && <span className="text-orange-400"> · серия {h.bestStreak}</span>}</span>
                    </div>
                    <ProgressBar value={report.countedDays ? h.days / report.countedDays : 0} colorClass={h.perfect ? "bg-sky-400" : "bg-sky-500/60"} heightClass="h-1.5" />
                  </div>
                ))}
              </div>
            )}
          </Block>

          {/* Спорт */}
          <Block icon={Dumbbell} title="Спорт" color="emerald">
            <Row label="Тренировок" value={report.sport.sessions} sub={<Delta value={report.sport.sessions} prev={prev && prev.sport.sessions} />} />
            <Row label="Минут" value={report.sport.minutes.toLocaleString("ru-RU")} />
            <Row label="Тоннаж" value={`${report.sport.volume.toLocaleString("ru-RU")} кг`} sub={<Delta value={report.sport.volume} prev={prev && prev.sport.volume} unit=" кг" />} />
            {report.sport.km > 0 && <Row label="Дистанция" value={`${report.sport.km} км`} />}
          </Block>

          {/* Библиотека */}
          <Block icon={BookOpen} title="Чтение и библиотека" color="violet">
            <Row label="Страниц прочитано" value={report.pages} sub={<Delta value={report.pages} prev={prev && prev.pages} />} />
            {report.finished.length > 0 ? (
              <div className="mt-2 space-y-1">
                <div className="text-[11px] text-zinc-500 uppercase tracking-wide font-data">Завершено</div>
                {report.finished.map(f => <div key={`${f.kind}-${f.id}`} className="text-sm text-zinc-300">{f.emoji} {f.title}</div>)}
              </div>
            ) : <div className="text-xs text-zinc-600 mt-1">Ничего не завершено.</div>}
          </Block>

          {/* Питание */}
          <Block icon={Utensils} title="Питание" color="rose">
            <Row label="Дней с записями" value={report.nutrition.daysLogged} sub={<Delta value={report.nutrition.daysLogged} prev={prev && prev.nutrition.daysLogged} />} />
            <Row label="Калорий в день, в среднем" value={report.nutrition.avgCalories ? report.nutrition.avgCalories.toLocaleString("ru-RU") : "—"} />
          </Block>

          {/* Финансы */}
          <Block icon={Wallet} title="Финансы" color="amber">
            <Row label="Доходы" value={fmtMoney(report.finance.income)} />
            <Row label="Расходы" value={fmtMoney(report.finance.expense)} sub={<Delta value={report.finance.expense} prev={prev && prev.finance.expense} invert />} />
            <Row label="Отложено" value={fmtMoney(report.finance.saved)} />
            <BudgetReport budget={report.finance.budget} />
            {report.finance.budget.rows.length === 0 && report.finance.topCategories.length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-800">
                <div className="text-[11px] text-zinc-500 uppercase tracking-wide font-data mb-1">Больше всего ушло на</div>
                {report.finance.topCategories.map(cat => (
                  <div key={cat.name} className="flex justify-between text-sm"><span className="text-zinc-400">{cat.name}</span><span className="font-data text-zinc-200">{fmtMoney(cat.amount)}</span></div>
                ))}
              </div>
            )}
          </Block>
        </div>
      </>)}
      </>)}
    </div>
  );
}
