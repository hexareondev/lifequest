// Интерфейс финансов: счета, операции, бюджеты, долги и графики движения денег.

import { useEffect, useMemo, useRef, useState } from "react";
import { clamp, daysBetween, todayStr } from "../core/basics.js";
import { fmtDateShort, fmtMoney, monthKey, monthLabel } from "../core/format.js";
import { categoryMeta } from "../core/lists.js";
import { endOfWeekSunday, startOfWeekMonday } from "../core/week.js";
import { activePeople } from "../people/model.js";
import {
  Button, Card, CollapsibleCard, KebabMenu, Modal, Pager, ProgressBar, SectionHeader,
  StickyAddButton, inputCls, labelCls,
} from "../ui/atoms.jsx";
import { EditableListRow } from "../ui/editable-list.jsx";
import { MonthNav } from "../ui/month-nav.jsx";
import { ColorPicker } from "../ui/pickers.jsx";
import { PALETTE, pal } from "../ui/theme.js";
import {
  ACCOUNT_KINDS, DEBT_SOURCES, FINANCE_TABLE_FIELDS, SAVINGS_SOURCES, TRANSFER_CATEGORY,
  accountBalanceOf, accountMeta, accountMetricOf, accountsTotal, activeAccounts, balanceEffectOf,
  debtMovesBalance, debtSourceOf, debtsByPerson, defaultFinanceTableFields, savingsCountsAsIncome,
  savingsMovesBalance, savingsSourceOf, totalDebtOf, totalSavingsOf,
} from "./model.js";
import {
  AlertCircle, Archive, ArchiveRestore, ArrowDownRight, ArrowRight, ArrowUpRight, Check,
  ChevronDown, ChevronUp, DollarSign, Eye, EyeOff, Palette, Pencil, PiggyBank, Plus, Repeat,
  Search, Sliders, Trash2, TrendingDown, TrendingUp, Users, Wallet,
} from "lucide-react";
import {
  Bar, BarChart, Brush, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

function StatCard({ label, value, icon:Icon, tone="zinc" }) {
  const c = pal(tone);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2"><Icon className="w-3.5 h-3.5"/>{label}</div>
      <div className={`font-data text-lg font-semibold ${c.text}`}>{value}</div>
    </Card>
  );
}

function IncomeExpenseBar({ transactions }) {
  const data = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      if (t.type==="debt") return; // этот график про доходы/расходы/сбережения, долги сюда не входят
      if (t.type==="savings" && savingsSourceOf(t)==="opening") return; // "до начала учёта" не создаёт точку
      const k = monthKey(t.date);
      if (!map[k]) map[k] = { month:k, income:0, expense:0, savings:0 };
      if (t.type==="income") map[k].income += t.amount;
      else if (t.type==="expense") map[k].expense += t.amount;
      else if (t.type==="savings") {
        if (savingsCountsAsIncome(t)) map[k].income += t.amount;
        if (savingsMovesBalance(t)) map[k].savings += (t.direction==="withdraw" ? -t.amount : t.amount);
      }
    });
    return Object.values(map).sort((a,b) => a.month.localeCompare(b.month)).slice(-6).map(d => ({ ...d, label: monthLabel(d.month) }));
  }, [transactions]);
  if (data.length === 0) return <div className="text-sm text-zinc-500">Нет данных за последние месяцы.</div>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} barGap={6}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="label" stroke="#71717a" fontSize={11} tickLine={false} axisLine={{ stroke:"#27272a" }} />
        <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => v>=1000 ? `${Math.round(v/1000)}k` : v} />
        <Tooltip contentStyle={{ background:"#18181b", border:"1px solid #3f3f46", borderRadius:10, fontSize:12 }} labelStyle={{ color:"#e4e4e7" }} formatter={(v,n) => [fmtMoney(v), n==="income"?"Доходы":n==="expense"?"Расходы":"Сбережения"]} />
        <Legend wrapperStyle={{ fontSize:12 }} formatter={(v) => v==="income" ? "Доходы" : v==="expense" ? "Расходы" : "Сбережения"} />
        <Bar dataKey="income" fill="#34d399" radius={[4,4,0,0]} />
        <Bar dataKey="expense" fill="#fb7185" radius={[4,4,0,0]} />
        <Bar dataKey="savings" fill="#a78bfa" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CategoryPieTooltip({ active, payload, categories }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const meta = categoryMeta(categories, "expense", d.name);
  const c = pal(meta.color);
  return (
    <div className="rounded-lg px-3 py-2 shadow-2xl" style={{ background:"#18181b", border:`1px solid ${c.hex}66` }}>
      <div className={`text-xs font-semibold ${c.text}`}>{meta.name}</div>
      <div className="text-sm font-data text-zinc-100 mt-0.5">{fmtMoney(d.value)}</div>
    </div>
  );
}

function ExpenseByCategoryPie({ transactions, month, categories }) {
  const data = useMemo(() => {
    const map = {};
    transactions.filter(t => t.type==="expense" && monthKey(t.date)===month).forEach(t => {
      const name = categoryMeta(categories, "expense", t.category).name;
      map[name] = (map[name]||0) + t.amount;
    });
    return Object.entries(map).map(([name,value]) => ({ name, value })).sort((a,b) => b.value-a.value);
  }, [transactions, month, categories]);
  if (data.length === 0) return <div className="text-sm text-zinc-500">Нет расходов за этот месяц.</div>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((d) => <Cell key={d.name} fill={pal(categoryMeta(categories, "expense", d.name).color).hex} stroke="#09090b" strokeWidth={1} />)}
        </Pie>
        <Tooltip content={(props) => <CategoryPieTooltip {...props} categories={categories} />} />
        <Legend wrapperStyle={{ fontSize:11 }} />
      </PieChart>
    </ResponsiveContainer>

  );
}

function MoneyFlowPieTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const c = pal(d.color);
  return (
    <div className="rounded-lg px-3 py-2 shadow-2xl" style={{ background:"#18181b", border:`1px solid ${c.hex}66` }}>
      <div className={`text-xs font-semibold ${c.text}`}>{d.name}</div>
      <div className="text-sm font-data text-zinc-100 mt-0.5">{fmtMoney(d.value)}</div>
    </div>
  );
}

// Пул месяца = баланс на начало месяца + доход + то, что ЧИСТЫМ ИТОГОМ вернулось в бюджет из
// сбережений и долгов. Сегменты показывают, куда этот пул делся: потрачено / отложено / дано в
// долг / остаток.
//
// Ключевой момент — «чистым итогом». Раньше сбережения учитывались двумя встречными потоками
// сразу: снятые деньги увеличивали пул, а вся сумма пополнений уходила в сегмент «Отложено».
// Одни и те же деньги при этом проходили через диаграмму дважды — сняли 5 000 и положили 20 000
// выглядело как «пул больше на 5 000» и «отложено 20 000», хотя реально за месяц отложено 15 000.
// Теперь считается netSaved = пополнения − снятия, и он попадает ровно в одну сторону:
// положительный — в сегмент «Отложено», отрицательный — в пул как источник денег.
//
// Отсюда прямой ответ на вопрос «а если сняли больше, чем положили»: да, в такой месяц ничего не
// отложено — сегмента «Отложено» просто нет, а сбережения выступили источником, а не тратой.
// Ровно та же логика применена к долгам (выдал/вернули).
//
// Формула по-прежнему сходится с «Балансом месяца»: max(0,−x) − max(0,x) = −x, поэтому
// остаток = баланс на начало + доход − расход − netSaved − netLent = баланс на начало + баланс месяца.
function MoneyFlowPie({ transactions, month }) {
  const data = useMemo(() => {
    const monthStart = `${month}-01`;
    const startBalance = transactions.filter(t => t.date < monthStart).reduce((a,t) => a + balanceEffectOf(t), 0);
    const monthTx = transactions.filter(t => monthKey(t.date)===month);
    const income = monthTx.reduce((a,t) => {
      if (t.type==="income") return a + t.amount;
      if (savingsCountsAsIncome(t)) return a + t.amount;
      return a;
    }, 0);
    const expense = monthTx.filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
    const savedOut = monthTx.filter(t => t.type==="savings" && savingsMovesBalance(t) && t.direction==="deposit").reduce((a,t)=>a+t.amount,0);
    const savedIn  = monthTx.filter(t => t.type==="savings" && savingsMovesBalance(t) && t.direction==="withdraw").reduce((a,t)=>a+t.amount,0);
    const lentOut  = monthTx.filter(t => t.type==="debt" && debtMovesBalance(t) && t.direction==="lend").reduce((a,t)=>a+t.amount,0);
    const lentIn   = monthTx.filter(t => t.type==="debt" && debtMovesBalance(t) && t.direction==="repay").reduce((a,t)=>a+t.amount,0);

    const netSaved = savedOut - savedIn;
    const netLent  = lentOut - lentIn;
    // Встречный поток идёт либо в пул, либо в сегмент — но никогда в оба сразу.
    const pool = startBalance + income + Math.max(0, -netSaved) + Math.max(0, -netLent);
    const remainder = Math.max(0, pool - expense - Math.max(0, netSaved) - Math.max(0, netLent));

    const segs = [
      { name:"Потрачено", value: expense, color:"rose" },
      { name:"Отложено",  value: Math.max(0, netSaved), color:"violet" },
    ];
    if (netLent > 0) segs.push({ name:"Дано в долг", value: netLent, color:"cyan" });
    segs.push({ name:"Остаток", value: remainder, color:"emerald" });
    return { pool, segs: segs.filter(s => s.value > 0) };
  }, [transactions, month]);

  if (data.pool <= 0 || data.segs.length === 0) return <div className="text-sm text-zinc-500">Недостаточно данных за этот месяц.</div>;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data.segs} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.segs.map((d) => <Cell key={d.name} fill={pal(d.color).hex} stroke="#09090b" strokeWidth={1} />)}
        </Pie>
        <Tooltip content={<MoneyFlowPieTooltip />} />
        <Legend wrapperStyle={{ fontSize:11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}


// Шаг агрегации графика. «День» показывает каждую операцию отдельно (максимум подробностей),
// неделя и месяц схлопывают их в одну точку на период — так на длинной истории видна форма
// тренда, а не частокол из сотен точек.
const BALANCE_STEPS = [
  { id:"op",    label:"Операции" },
  { id:"day",   label:"День" },
  { id:"week",  label:"Неделя" },
  { id:"month", label:"Месяц" },
];
function weekKeyOf(dateStr) {
  // Ключ недели — понедельник этой недели: сортируется как обычная дата и сразу читаем в подписи.
  return startOfWeekMonday(dateStr);
}
// Минимальное окно зума: меньше трёх точек график перестаёт быть графиком.
const BALANCE_MIN_WINDOW = 3;

// Тултип точки: показывает баланс на этот момент и коротко — что за операции его изменили.
// Своя реализация вместо стандартной, потому что стандартная умеет только «имя серии: значение»
// и выводила техническое «balance», ничего не говоря о самих операциях.
function BalanceTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const ops = point.ops || [];
  // На шаге «Неделя» показываем все дни (их максимум 7), на «Месяце» — все недели (4–5):
  // это и есть тот объём, который читается одним взглядом. Урезаем только длинный список
  // отдельных операций на шаге «Операции».
  const limit = ops.length <= 7 ? ops.length : 3;
  const shown = ops.slice(0, limit);
  const rest = ops.length - shown.length;
  // delta лежит на самой точке: у шага «День» расшифровки нет, но изменение за день показать надо.
  const delta = point.delta != null ? point.delta : ops.reduce((a, o) => a + o.effect, 0);
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 shadow-xl" style={{ maxWidth:260 }}>
      <div className="text-xs text-zinc-500 font-data">{point.label}</div>
      <div className="text-sm text-zinc-100 font-data mt-0.5">Баланс: {fmtMoney(point.balance)}</div>
      {delta !== 0 && (
        <div className={`text-xs font-data ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {delta >= 0 ? "+" : "−"}{fmtMoney(Math.abs(delta))} за период
        </div>
      )}
      {ops.length > 0 && (
        <>
          <div className="mt-1.5 space-y-0.5 border-t border-zinc-800 pt-1.5">
            {shown.map((o, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="truncate text-zinc-400 flex-1">{o.title}</span>
                <span className={`font-data shrink-0 ${o.effect >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {o.effect >= 0 ? "+" : "−"}{fmtMoney(Math.abs(o.effect))}
                </span>
              </div>
            ))}
            {rest > 0 && <div className="text-xs text-zinc-600">и ещё {rest}</div>}
          </div>
        </>
      )}
    </div>
  );
}

function BalanceLine({ transactions }) {
  const [step, setStep] = useState("op");
  // Видимый диапазон точек. Держим его сами (а не отдаём внутреннему состоянию полосы), потому
  // что менять его умеют три независимых источника: сама полоса, колесо мыши и перетаскивание.
  const [range, setRange] = useState(null);
  const wrapRef = useRef(null);
  const dragRef = useRef(null);

  const data = useMemo(() => {
    // Только операции с реальным эффектом на баланс — "до учёта" и проценты (эффект 0)
    // не создают отдельных точек. При совпадении даты пополнения идут раньше списаний,
    // иначе график мог на ровном месте нырнуть в минус из-за порядка операций в массиве.
    const withEffect = transactions
      .map(t => ({ t, effect: balanceEffectOf(t) }))
      .filter(x => x.effect !== 0)
      .sort((a,b) => (a.t.date !== b.t.date ? (a.t.date < b.t.date ? -1 : 1) : b.effect - a.effect));

    let running = 0;
    const points = withEffect.map(({ t, effect }) => {
      running += effect;
      return {
        date: t.date,
        label: fmtDateShort(t.date),
        balance: running,
        delta: effect,
        // На шаге «Операции» расшифровка — сама операция.
        ops: [{ title: (t.description && t.description.trim()) || t.category || "Операция", effect }],
      };
    });
    if (step === "op") return points;

    // Агрегация: на период берём ПОСЛЕДНЕЕ значение нарастающего итога (это баланс на конец
    // периода — единственная осмысленная тут величина).
    //
    // Расшифровка в тултипе даётся НА УРОВЕНЬ НИЖЕ текущего шага, а не списком всех операций:
    // за неделю показываем дни, за месяц — недели. Список из полусотни операций за месяц
    // прочитать невозможно, а «крупными мазками» видно, где именно двинулся баланс.
    // У шага «День» расшифровки нет вовсе: сам день и есть минимальная единица, дробить нечего.
    const keyOf = (d) => step === "day" ? d : step === "week" ? weekKeyOf(d) : monthKey(d);
    const labelOf = (k) => step === "month" ? monthLabel(k) : fmtDateShort(k);
    const subKeyOf = (d) => step === "week" ? d : weekKeyOf(d);          // неделя → дни, месяц → недели
    // Неделя внутри месяца подписывается диапазоном «понедельник → воскресенье»: так сразу видно,
    // какие именно дни попали в строку, в том числе когда неделя перетекает из месяца в месяц.
    const subLabelOf = (k) => step === "month"
      ? `${fmtDateShort(k)} → ${fmtDateShort(endOfWeekSunday(k))}`
      : fmtDateShort(k);

    const byKey = new Map();
    points.forEach(pt => {
      const k = keyOf(pt.date);
      const cur = byKey.get(k) || { date:k, label:labelOf(k), balance:pt.balance, delta:0, subs:new Map() };
      cur.balance = pt.balance;
      cur.delta += pt.delta;
      if (step !== "day") {
        const sk = subKeyOf(pt.date);
        cur.subs.set(sk, (cur.subs.get(sk) || 0) + pt.delta);
      }
      byKey.set(k, cur);
    });

    return Array.from(byKey.values())
      .sort((a,b) => a.date < b.date ? -1 : 1)
      .map(({ subs, ...rest }) => ({
        ...rest,
        ops: Array.from(subs.entries())
          .sort((a,b) => a[0] < b[0] ? -1 : 1)
          .map(([k, effect]) => ({ title: subLabelOf(k), effect })),
      }));
  }, [transactions, step]);

  const total = data.length;
  // Полоса зума показывается ВСЕГДА — иначе при смене шага график прыгал бы по высоте. Когда
  // точек слишком мало, она просто заблокирована.
  const canZoom = total > BALANCE_MIN_WINDOW;

  // Диапазон пересобираем при смене набора точек: старые индексы к новому массиву неприменимы.
  useEffect(() => {
    setRange(total ? { start: Math.max(0, total - 40), end: total - 1 } : null);
  }, [total, step]);

  const view = range && total
    ? { start: clamp(range.start, 0, total-1), end: clamp(range.end, 0, total-1) }
    : { start: 0, end: Math.max(0, total-1) };

  // Зум колесом и сдвиг перетаскиванием. Слушатель вешаем вручную с passive:false — иначе
  // браузер не даёт отменить прокрутку страницы, и колесо над графиком скроллило бы страницу.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !canZoom) return;

    function onWheel(e) {
      e.preventDefault();
      setRange(cur => {
        const r = cur || { start:0, end:total-1 };
        const size = r.end - r.start + 1;
        // Курсор — точка привязки: масштабируем вокруг того места, куда человек смотрит.
        const rect = el.getBoundingClientRect();
        const ratio = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
        const anchor = r.start + ratio * (size - 1);
        const nextSize = clamp(Math.round(size * (e.deltaY > 0 ? 1.25 : 0.8)), BALANCE_MIN_WINDOW, total);
        let start = Math.round(anchor - ratio * (nextSize - 1));
        start = clamp(start, 0, total - nextSize);
        return { start, end: start + nextSize - 1 };
      });
    }
    function onDown(e) {
      if (e.button !== 0) return;
      dragRef.current = { x:e.clientX, start:view.start, end:view.end, width: el.getBoundingClientRect().width };
      el.style.cursor = "grabbing";
    }
    function onMove(e) {
      const d = dragRef.current;
      if (!d) return;
      const size = d.end - d.start + 1;
      // Сдвиг в точках пропорционален пройденному пути: тянем «за данные», а не за пиксели.
      const shift = Math.round(((d.x - e.clientX) / Math.max(1, d.width)) * size);
      const start = clamp(d.start + shift, 0, total - size);
      setRange({ start, end: start + size - 1 });
    }
    function onUp() { dragRef.current = null; el.style.cursor = ""; }

    el.addEventListener("wheel", onWheel, { passive:false });
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [canZoom, total, view.start, view.end]);

  if (total === 0) return <div className="text-sm text-zinc-500">Нет операций.</div>;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-xs text-zinc-500">Шаг:</span>
        {BALANCE_STEPS.map(sOpt => (
          <button key={sOpt.id} onClick={() => setStep(sOpt.id)}
            className={`px-2.5 py-1 rounded-lg text-xs border transition ${step===sOpt.id ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500 hover:text-zinc-300"}`}>
            {sOpt.label}
          </button>
        ))}
        {canZoom && (
          <span className="text-xs text-zinc-600 ml-auto hidden lg:inline">Колесо — масштаб, перетаскивание — сдвиг</span>
        )}
      </div>

      <div ref={wrapRef} style={{ cursor: canZoom ? "grab" : "default", userSelect:"none" }}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="label" stroke="#71717a" fontSize={10} tickLine={false} axisLine={{ stroke:"#27272a" }} minTickGap={30} />
            <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (v>=1000||v<=-1000) ? `${Math.round(v/1000)}k` : v} />
            <Tooltip content={<BalanceTooltip />} />
            <Line type="monotone" dataKey="balance" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Brush
              dataKey="label" height={22} stroke={canZoom ? "#52525b" : "#3f3f46"} fill="#18181b" travellerWidth={8}
              startIndex={view.start} endIndex={view.end}
              onChange={(r) => { if (canZoom && r && r.startIndex != null) setRange({ start:r.startIndex, end:r.endIndex }); }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Подсказки по ранее введённым значениям поля — «память» полей. Ничего не хранится отдельно:
// частоты считаются на лету из уже имеющейся истории операций (тот же принцип
// computed-not-stored, что у питания и календаря), поэтому подсказки не нужно чистить при
// удалении операций и они не могут разойтись с реальными данными.
//
// Ключевая деталь — фильтр по категории: «Магнит» осмысленен для «Еды», «FixPrice» для «Быта»,
// и валить их в одну кучу значило бы показывать в основном нерелевантное. При равной частоте
// выше идёт то, что использовалось позже — привычки со временем меняются.
function frequentFieldValues(transactions, field, { category, type, limit = 8 } = {}) {
  const stats = new Map();
  (transactions || []).forEach(t => {
    const raw = t[field];
    if (typeof raw !== "string") return;
    const val = raw.trim();
    if (!val) return;
    if (category && t.category !== category) return;
    if (type && t.type !== type) return;
    // Ключ — в нижнем регистре, чтобы «магнит» и «Магнит» считались одним значением; показываем
    // при этом самое свежее написание, а не первое попавшееся.
    const key = val.toLowerCase();
    const cur = stats.get(key) || { value: val, count: 0, last: "" };
    cur.count += 1;
    if ((t.date || "") >= cur.last) { cur.last = t.date || ""; cur.value = val; }
    stats.set(key, cur);
  });
  return Array.from(stats.values())
    .sort((a, b) => (b.count - a.count) || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
    .slice(0, limit)
    .map(x => x.value);
}

// Поле ввода с подсказками: выпадающий список при наборе (datalist — тот же приём, что уже
// используется для имён людей) плюс чипы быстрой подстановки под полем, чтобы значение можно было
// выбрать одним нажатием, ничего не набирая. Чипы прячутся, как только поле совпало с подсказкой:
// подсказывать то, что уже введено, незачем.
function SuggestedInput({ value, onChange, placeholder, suggestions, listId, inputClassName, chipLimit = 4 }) {
  const chips = (suggestions || []).filter(s => s && s !== value).slice(0, chipLimit);
  return (
    <>
      <input className={inputClassName} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} list={listId} />
      {(suggestions || []).length > 0 && (
        <datalist id={listId}>
          {suggestions.map(s => <option key={s} value={s} />)}
        </datalist>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {chips.map(s => (
            <button key={s} onClick={() => onChange(s)}
              className="px-2 py-0.5 rounded-full text-xs border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 transition">
              {s}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function TransactionForm({ categories, knownPersons, people, transactions, accounts, initial, isEdit, onSubmit, onCancel }) {
  const [type, setType] = useState((initial && initial.type) || "expense");
  const [direction, setDirection] = useState((initial && initial.direction) || "deposit");
  const [source, setSource] = useState((initial && initial.source) || "manual");
  const [person, setPerson] = useState((initial && initial.person) || "");
  const [personId, setPersonId] = useState((initial && initial.personId) || "");
  const [amount, setAmount] = useState((initial && initial.amount != null) ? initial.amount : "");
  const [category, setCategory] = useState((initial && initial.category) || (categories.expense[0] && categories.expense[0].name) || "");
  const [date, setDate] = useState((initial && initial.date) || todayStr());
  const [description, setDescription] = useState((initial && initial.description) || "");
  const [via, setVia] = useState((initial && initial.via) || "");

  const regularAccounts = useMemo(() => activeAccounts({ accounts }, "regular"), [accounts]);
  const savingsAccounts = useMemo(() => activeAccounts({ accounts }, "savings"), [accounts]);
  // Остатки считаем один раз на открытие формы — они нужны и для автоподбора, и для предупреждений.
  const balances = useMemo(() => {
    const map = {};
    (accounts||[]).forEach(a => { map[a.id] = accountBalanceOf({ accounts, transactions }, a.id); });
    return map;
  }, [accounts, transactions]);

  const [accountId, setAccountId] = useState(
    (initial && initial.accountId) || (regularAccounts[0] && regularAccounts[0].id) || ""
  );
  const [toAccountId, setToAccountId] = useState(
    (initial && initial.toAccountId) || (savingsAccounts[0] && savingsAccounts[0].id) || ""
  );
  // У перевода СВОЙ счёт-получатель. Раньше он делил состояние с сбережениями, а пулы у них
  // разные (там сберегательные счета, здесь обычные) — из-за этого в перевод утекал счёт
  // «Сбережения»: список показывал обычные счета, а в состоянии лежал сберегательный, и именно он
  // уходил в сохранённую операцию.
  const [transferToId, setTransferToId] = useState(
    (initial && initial.type==="transfer" && initial.toAccountId) || ""
  );
  // Пользователь тронул выбор счёта руками — с этого момента автоподбор молчит и больше не
  // перебивает решение человека (тот же приём, что у авто-полей в форме библиотеки).
  const [accountTouched, setAccountTouched] = useState(!!(initial && initial.accountId));

  // Только обычные счета: движение денег между бюджетом и сбережениями — это отдельный тип
  // операции («Сбереж.») со своим смыслом и своей отчётностью, дублировать его переводом не нужно.
  const allTransferAccounts = useMemo(() => activeAccounts({ accounts }, "regular"), [accounts]);
  const amountNum = Number(amount) || 0;
  // Автоподбор: среди счетов, где хватает остатка на эту операцию, берём самый часто
  // используемый в этой категории (а если истории в ней нет — самый частый вообще). Для доходов
  // достаточности не требуем — деньги, наоборот, приходят.
  const suggestedAccountId = useMemo(() => {
    if (!regularAccounts.length) return "";
    const needsFunds = (type==="expense") || (type==="debt" && direction==="lend") || (type==="savings" && direction==="deposit");
    const affordable = (needsFunds && amountNum > 0)
      ? regularAccounts.filter(a => (balances[a.id]||0) >= amountNum)
      : regularAccounts;
    const pool = affordable.length ? affordable : regularAccounts;
    const ranked = [
      ...frequentFieldValues(transactions, "accountId", { category, limit:20 }),
      ...frequentFieldValues(transactions, "accountId", { limit:20 }),
    ];
    const best = ranked.find(id => pool.some(a => a.id===id));
    return best || pool[0].id;
  }, [regularAccounts, balances, transactions, category, type, direction, amountNum]);

  useEffect(() => {
    if (accountTouched) return;
    if (suggestedAccountId && suggestedAccountId !== accountId) setAccountId(suggestedAccountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedAccountId, accountTouched]);

  // Страховка от рассинхрона выпадающего списка и состояния: список «Куда» исключает выбранный
  // счёт-источник, и если получатель совпал с ним (или его счёт архивировали), браузер покажет
  // первый доступный вариант, а в состоянии останется прежний — и в операцию уйдёт не то, что
  // человек видит на экране. Поэтому чиним значение сразу, а не полагаемся на отображение.
  useEffect(() => {
    if (type !== "transfer") return;
    const valid = transferToId && transferToId !== accountId && allTransferAccounts.some(a => a.id===transferToId);
    if (valid) return;
    const other = allTransferAccounts.find(a => a.id !== accountId);
    setTransferToId(other ? other.id : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, accountId, transferToId, allTransferAccounts]);

  // «Начальный капитал» и «Проценты по вкладу» не приходят с карты: первое — деньги, которые уже
  // лежали на вкладе до начала учёта, второе — начисление банком прямо на вклад. Обычный счёт в
  // них не участвует вовсе, поэтому и не спрашивается.
  const savingsWithoutAccount = type==="savings" && direction==="deposit" && (source==="opening" || source==="interest");
  const selectedAccount = accountMeta(accounts, accountId);
  const selectedSavings = accountMeta(accounts, toAccountId);
  const needsFundsNow = (type==="expense") || (type==="debt" && direction==="lend") || (type==="savings" && direction==="deposit");
  // Предупреждения, а не запреты: остаток выводится из истории, и одна незанесённая операция не
  // должна превращать форму в неработающую. Решение всегда за человеком.
  const notEnoughFunds = needsFundsNow && amountNum > 0 && selectedAccount && (balances[accountId]||0) < amountNum;
  const frozenWarning = type==="savings" && direction==="withdraw" && selectedSavings && selectedSavings.frozen;
  const refillWarning = type==="savings" && direction==="deposit" && selectedSavings && selectedSavings.refillable === false
    && (transactions||[]).some(t => t.type==="savings" && t.direction==="deposit" && t.toAccountId===toAccountId);

  // Подсказки пересчитываются при смене категории: сначала то, что вводилось именно в этой
  // категории, а если там пусто (категория новая или ещё не заполнялась) — общий список по всем
  // операциям, чтобы поле не оставалось совсем без помощи. Дубли между двумя списками убираем.
  const viaSuggestions = useMemo(() => {
    const inCategory = frequentFieldValues(transactions, "via", { category, limit:6 });
    if (inCategory.length >= 4) return inCategory;
    const overall = frequentFieldValues(transactions, "via", { limit:6 });
    return Array.from(new Set([...inCategory, ...overall])).slice(0, 6);
  }, [transactions, category]);

  const descriptionSuggestions = useMemo(
    () => frequentFieldValues(transactions, "description", { category, limit:6 }),
    [transactions, category]
  );

  function switchType(newType) {
    setType(newType);
    if (newType==="transfer") {
      // Перевод сам в себя бессмысленен, поэтому получатель — первый обычный счёт, отличный от
      // источника. Проверяем и то, что ранее выбранный получатель вообще есть в этом пуле.
      const from = accountId || (allTransferAccounts[0] && allTransferAccounts[0].id) || "";
      if (from) setAccountId(from);
      setTransferToId(prevTo => {
        const stillValid = prevTo && prevTo !== from && allTransferAccounts.some(a => a.id===prevTo);
        if (stillValid) return prevTo;
        const other = allTransferAccounts.find(a => a.id !== from);
        return other ? other.id : "";
      });
      return;
    }
    if (newType==="income") setCategory((categories.income[0] && categories.income[0].name) || "");
    else if (newType==="expense") setCategory((categories.expense[0] && categories.expense[0].name) || "");
    else if (newType==="savings") { setDirection(d => (d==="lend"||d==="repay") ? "deposit" : d); setSource(s => s==="opening" ? s : "manual"); }
    else if (newType==="debt") { setDirection(d => (d==="deposit"||d==="withdraw") ? "lend" : d); setSource(s => s==="interest" ? "manual" : s); }
  }

  function submit() {
    const amt = Number(amount);
    if (!amt || amt<=0) return;
    if (type==="transfer") {
      // Перевод не доход и не расход: на общий баланс не влияет (balanceEffectOf вернёт 0),
      // меняются только остатки двух счетов. Перевод сам в себя не сохраняем.
      if (!accountId || !transferToId || accountId === transferToId) return;
      // Категория и источник у перевода не спрашиваются: категория всегда одна и та же, а
      // источник осмысленно заполняется сам — счётом, на который ушли деньги.
      const toAcc = accountMeta(accounts, transferToId);
      onSubmit({ type:"transfer", amount:amt, category:TRANSFER_CATEGORY, date, description: description.trim(),
        accountId, toAccountId: transferToId, via: toAcc ? toAcc.name : null, personId:null, person:null, direction:null, source:"manual" });
      return;
    }
    if (type==="savings") {
      // Явно обнуляем привязку к человеку — при редактировании операции, которая раньше была
      // категорией "Люди" (или долгом), и её тип/категорию сменили, старая привязка не должна
      // просто "забыться" в патче (updateTransaction мёрджит объект, а не заменяет целиком).
      // Источник у сбережений тоже заполняется сам — сберегательным счётом, куда (или откуда)
      // ушли деньги. Вместе с колонкой «Счёт» это читается как «откуда → куда» без стрелок.
      const savAcc = accountMeta(accounts, toAccountId);
      const effSource = direction==="deposit" ? source : "manual";
      const noAccount = direction==="deposit" && (effSource==="opening" || effSource==="interest");
      onSubmit({ type, direction, source: effSource, amount:amt, category:"Сбережения", date, description: description.trim(),
        via: savAcc ? savAcc.name : null, personId: null, person: null,
        // Ссылку на карту не сохраняем: она бы утверждала, что деньги пришли оттуда.
        accountId: noAccount ? null : accountId, toAccountId });
    } else if (type==="debt") {
      if (!person.trim()) return;
      // Источник для долга — не отдельное поле, а имя человека (та же синхронизация, что и у
      // категории "Люди" ниже) — в списке операций видно, кому/от кого, без дублирования в бейдж.
      onSubmit({ type, direction, source: direction==="lend" ? source : "manual", person: person.trim(), personId: personId || null, amount:amt, category:"Долг", date, description: description.trim(), via: person.trim() || null, accountId });
    } else {
      const base = { type, amount:amt, category, date, description: description.trim(), accountId };
      if (category==="Люди") { base.personId = personId || null; base.person = person.trim() || null; base.via = person.trim() || null; }
      else { base.via = via.trim() || null; base.personId = null; base.person = null; }
      onSubmit(base);
    }
  }
  const list = type==="expense" ? categories.expense : categories.income;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => switchType("expense")} className={`py-2.5 rounded-xl text-sm font-medium border transition flex items-center justify-center gap-1.5 ${type==="expense" ? "bg-rose-500/15 border-rose-500/30 text-rose-400" : "border-zinc-800 text-zinc-500"}`}><TrendingDown className="w-4 h-4"/>Расход</button>
        <button onClick={() => switchType("income")} className={`py-2.5 rounded-xl text-sm font-medium border transition flex items-center justify-center gap-1.5 ${type==="income" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "border-zinc-800 text-zinc-500"}`}><TrendingUp className="w-4 h-4"/>Доход</button>
        <button onClick={() => switchType("savings")} className={`py-2.5 rounded-xl text-sm font-medium border transition flex items-center justify-center gap-1.5 ${type==="savings" ? "bg-violet-500/15 border-violet-500/30 text-violet-400" : "border-zinc-800 text-zinc-500"}`}><PiggyBank className="w-4 h-4"/>Сбереж.</button>
        <button onClick={() => switchType("debt")} className={`py-2.5 rounded-xl text-sm font-medium border transition flex items-center justify-center gap-1.5 ${type==="debt" ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400" : "border-zinc-800 text-zinc-500"}`}><Users className="w-4 h-4"/>Долг</button>
        {/* Перевод показываем только когда счетов больше одного — иначе переводить некуда и
            кнопка была бы мёртвой. */}
        {allTransferAccounts.length > 1 && (
          <button onClick={() => switchType("transfer")} className={`col-span-2 py-2.5 rounded-xl text-sm font-medium border transition flex items-center justify-center gap-1.5 ${type==="transfer" ? "bg-sky-500/15 border-sky-500/30 text-sky-400" : "border-zinc-800 text-zinc-500"}`}><Repeat className="w-4 h-4"/>Перевод между счетами</button>
        )}
      </div>
      {type==="savings" && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setDirection("deposit")} className={`py-2 rounded-xl text-sm font-medium border transition ${direction==="deposit" ? "bg-violet-500/15 border-violet-500/30 text-violet-400" : "border-zinc-800 text-zinc-500"}`}>Отложить</button>
          <button onClick={() => setDirection("withdraw")} className={`py-2 rounded-xl text-sm font-medium border transition ${direction==="withdraw" ? "bg-violet-500/15 border-violet-500/30 text-violet-400" : "border-zinc-800 text-zinc-500"}`}>Снять</button>
        </div>
      )}
      {type==="savings" && direction==="deposit" && (
        <div>
          <label className={labelCls}>Источник</label>
          <select className={inputCls} value={source} onChange={e=>setSource(e.target.value)}>
            {Object.entries(SAVINGS_SOURCES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {source==="interest" && <div className="text-xs text-zinc-600 mt-1.5">Учтётся и как доход месяца, и как пополнение сбережений — на баланс месяца эффект нулевой.</div>}
          {source==="opening" && <div className="text-xs text-zinc-600 mt-1.5">Не повлияет на доходы/расходы и баланс текущего месяца — только на общую сумму сбережений.</div>}
        </div>
      )}
      {type==="debt" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDirection("lend")} className={`py-2 rounded-xl text-sm font-medium border transition ${direction==="lend" ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400" : "border-zinc-800 text-zinc-500"}`}>Дал в долг</button>
            <button onClick={() => setDirection("repay")} className={`py-2 rounded-xl text-sm font-medium border transition ${direction==="repay" ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400" : "border-zinc-800 text-zinc-500"}`}>Мне вернули</button>
          </div>
          {(people||[]).length > 0 && (
            <div>
              <label className={labelCls}>Карточка человека (необязательно)</label>
              <select className={inputCls} value={personId} onChange={e=>{
                const pid = e.target.value;
                setPersonId(pid);
                const p = (people||[]).find(x => x.id===pid);
                if (p) setPerson(p.name);
              }}>
                <option value="">Без привязки — просто текст</option>
                {(people||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {/* Текстовое имя нужно только когда карточка не выбрана: при выборе из списка имя уже
              проставлено и поле бы просто дублировало его. */}
          {!personId && (
          <div>
            <label className={labelCls}>Кому / от кого</label>
            <input list="lq-debt-persons" className={inputCls} value={person} onChange={e=>{ setPerson(e.target.value); setPersonId(""); }} placeholder="Имя человека" />
            <datalist id="lq-debt-persons">
              {(knownPersons||[]).map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          )}
          {direction==="lend" && (
            <div>
              <label className={labelCls}>Когда возник долг</label>
              <select className={inputCls} value={source} onChange={e=>setSource(e.target.value)}>
                {Object.entries(DEBT_SOURCES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {source==="opening" && <div className="text-xs text-zinc-600 mt-1.5">Не повлияет на баланс текущего месяца — только на общую сумму «мне должны».</div>}
            </div>
          )}
        </>
      )}
      <div>
        <label className={labelCls}>Сумма, ₽</label>
        <input type="number" min="0" className={inputCls} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* У перевода категории нет — она всегда «Между счетами» и проставляется автоматически. */}
        {type!=="savings" && type!=="debt" && type!=="transfer" && (
          <div>
            <label className={labelCls}>Категория</label>
            <select className={inputCls} value={category} onChange={e=>{
              const c = e.target.value;
              setCategory(c);
              if (c !== "Люди") { setPersonId(""); setPerson(""); }
            }}>
              {list.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className={(type==="savings" || type==="debt") ? "col-span-2" : ""}>
          <label className={labelCls}>Дата</label>
          <input type="date" className={inputCls} value={date} onChange={e=>setDate(e.target.value)} />
        </div>
      </div>
      {(type==="expense"||type==="income") && category==="Люди" && (
        <>
          {(people||[]).length > 0 && (
            <div>
              <label className={labelCls}>Карточка человека (необязательно)</label>
              <select className={inputCls} value={personId} onChange={e=>{
                const pid = e.target.value;
                setPersonId(pid);
                const p = (people||[]).find(x => x.id===pid);
                if (p) setPerson(p.name);
              }}>
                <option value="">Без привязки — просто текст</option>
                {(people||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {/* Текстовое имя нужно только когда карточка не выбрана: при выборе из списка имя уже
              проставлено и поле бы просто дублировало его. */}
          {!personId && (
          <div>
            <label className={labelCls}>{type==="income" ? "От кого" : "Кому"}</label>
            <input list="lq-transfer-persons" className={inputCls} value={person} onChange={e=>{ setPerson(e.target.value); setPersonId(""); }} placeholder="Имя человека" />
            <datalist id="lq-transfer-persons">
              {(knownPersons||[]).map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          )}
        </>
      )}

      {type==="transfer" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Откуда</label>
            <select className={inputCls} value={accountId} onChange={e => { setAccountId(e.target.value); setAccountTouched(true); }}>
              {allTransferAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.frozen ? "❄ " : ""}{a.name} · {fmtMoney(balances[a.id]||0)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Куда</label>
            <select className={inputCls} value={transferToId} onChange={e=>setTransferToId(e.target.value)}>
              {allTransferAccounts.filter(a => a.id !== accountId).map(a => (
                <option key={a.id} value={a.id}>{a.frozen ? "❄ " : ""}{a.name} · {fmtMoney(balances[a.id]||0)}</option>
              ))}
            </select>
          </div>
          {amountNum > 0 && (balances[accountId]||0) < amountNum && (
            <div className="sm:col-span-2 text-xs text-amber-400/90 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0"/>На счёте-источнике меньше, чем сумма перевода — сохранить всё равно можно.
            </div>
          )}
        </div>
      )}

      {type!=="transfer" && !savingsWithoutAccount && (
      <div>
        <label className={labelCls}>{type==="savings" ? (direction==="withdraw" ? "Куда зачислить" : "Откуда списать") : "Счёт"}</label>
        <select className={inputCls} value={accountId} onChange={e => { setAccountId(e.target.value); setAccountTouched(true); }}>
          {regularAccounts.length === 0 && <option value="">Нет доступных счетов</option>}
          {regularAccounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.emoji ? `${a.emoji} ` : ""}{a.name} · {fmtMoney(balances[a.id]||0)}
            </option>
          ))}
        </select>
        {notEnoughFunds && (
          <div className="text-xs text-amber-400/90 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0"/>
            На счету меньше, чем сумма операции — сохранить всё равно можно.
          </div>
        )}
      </div>
      )}

      {!(type==="debt" || type==="transfer" || type==="savings" || ((type==="expense"||type==="income") && category==="Люди")) && (
        <div>
          {/* Название поля зависит от направления денег: у расхода это «куда» они ушли, у дохода —
              «откуда» пришли. Раньше оба случая назывались нейтральным «Источник», и при вводе
              приходилось каждый раз соображать, что именно тут имеется в виду. */}
          <label className={labelCls}>{type==="income" ? "Откуда (необязательно)" : "Куда (необязательно)"}</label>
          <SuggestedInput
            value={via} onChange={setVia} inputClassName={inputCls} listId="tx-via-suggestions"
            placeholder={type==="income" ? "Например: работа, Тинькофф, наличные" : "Например: Магнит, наличные, Тинькофф"}
            suggestions={viaSuggestions}
          />
        </div>
      )}

      {type==="savings" && (
        <div>
          <label className={labelCls}>{direction==="withdraw" ? "Откуда снять" : "Куда отложить"}</label>
          <select className={inputCls} value={toAccountId} onChange={e=>setToAccountId(e.target.value)}>
            {savingsAccounts.length === 0 && <option value="">Нет сберегательных счетов</option>}
            {savingsAccounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.frozen ? "❄ " : ""}{a.name} · {fmtMoney(balances[a.id]||0)}
              </option>
            ))}
          </select>
          {frozenWarning && (
            <div className="text-xs text-sky-300/90 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0"/>
              Счёт заморожен — снимать нежелательно{selectedSavings.endDate ? `, срок до ${fmtDateShort(selectedSavings.endDate)}` : ""}.
            </div>
          )}
          {refillWarning && (
            <div className="text-xs text-amber-400/90 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0"/>
              Вклад непополняемый — обычно он вносится одной суммой.
            </div>
          )}
        </div>
      )}
      <div>
        <label className={labelCls}>Описание (необязательно)</label>
        <SuggestedInput
          value={description} onChange={setDescription} inputClassName={inputCls} listId="tx-desc-suggestions"
          placeholder="Например: продукты на неделю"
          suggestions={descriptionSuggestions}
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>{isEdit ? "Сохранить" : "Добавить"}</Button>
      </div>
    </div>
  );
}

function BudgetRow({ category, limit, spent, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(limit || 0);
  const ratio = limit ? spent/limit : 0;
  const over = limit && spent > limit;
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
        <span className="text-sm text-zinc-300">{category}</span>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input type="number" className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-100" style={{ width:90 }} value={draft} onChange={e=>setDraft(e.target.value)} autoFocus />
            <button onClick={() => { onChange(Number(draft)||0); setEditing(false); }} className="text-xs text-amber-400">OK</button>
          </div>
        ) : (
          <button onClick={() => { setDraft(limit||0); setEditing(true); }} className={`text-xs font-data ${over ? "text-red-400" : "text-zinc-500"} hover:text-zinc-300`}>{fmtMoney(spent)} / {limit ? fmtMoney(limit) : "—"}</button>
        )}
      </div>
      <ProgressBar value={limit ? ratio : 0} colorClass={over ? "bg-red-500" : "bg-amber-500"} heightClass="h-1.5" />
    </div>
  );
}

export const LIMIT_OPTIONS = [10, 20, 50, Infinity];

function TransactionsTable({ transactions, categories, accounts, fields, onDelete, onEdit }) {
  const show = (id) => !fields || fields[id] !== false;
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = transactions.slice();
    if (typeFilter !== "all") list = list.filter(t => t.type===typeFilter);
    if (search.trim()) { const s = search.trim().toLowerCase(); list = list.filter(t => (t.description||"").toLowerCase().includes(s) || t.category.toLowerCase().includes(s) || (t.via||"").toLowerCase().includes(s)); }
    list.sort((a,b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey==="amount") { va = Number(va); vb = Number(vb); }
      if (va < vb) return sortDir==="asc" ? -1 : 1;
      if (va > vb) return sortDir==="asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [transactions, typeFilter, search, sortKey, sortDir]);

  useEffect(() => { setPage(1); }, [typeFilter, search, limit, sortKey, sortDir]);
  const totalPages = limit===Infinity ? 1 : Math.max(1, Math.ceil(filtered.length/limit));
  const safePage = Math.min(page, totalPages);
  const shown = limit===Infinity ? filtered : filtered.slice((safePage-1)*limit, safePage*limit);

  function toggleSort(key) {
    if (sortKey===key) setSortDir(d => d==="asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("desc"); }
  }
  function Th({ k, children }) {
    return (
      <th onClick={() => toggleSort(k)} className="text-left text-xs font-data uppercase tracking-wide text-zinc-500 px-3 py-2 cursor-pointer hover:text-zinc-300 select-none whitespace-nowrap">
        {children}{sortKey===k && <span className="ml-1">{sortDir==="asc" ? "↑" : "↓"}</span>}
      </th>
    );
  }
  function badgeFor(t) {
    if (t.type==="savings") {
      const label = t.direction==="withdraw" ? "Снято" : SAVINGS_SOURCES[savingsSourceOf(t)].label;
      const soft = t.direction==="withdraw";
      return <span className={`px-2 py-0.5 rounded-full ${soft ? "bg-violet-500/25 text-violet-300" : "bg-violet-500/15 text-violet-400"}`}>{label}</span>;
    }
    if (t.type==="debt") {
      const label = t.direction==="repay" ? "Возврат" : DEBT_SOURCES[debtSourceOf(t)].label;
      return <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">{label}</span>;
    }
    // У перевода нет пользовательской категории (это движение между своими счетами, а не трата),
    // поэтому бейдж фиксированный, а не из справочника категорий.
    if (t.type === "transfer") {
      return <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300">{TRANSFER_CATEGORY}</span>;
    }
    const meta = categoryMeta(categories, t.type, t.category);
    return <span className={`px-2 py-0.5 rounded-full ${pal(meta.color).bgSoft} ${pal(meta.color).text}`}>{meta.name}</span>;
  }
  // Одна колонка «Операция» вместо пары «Счёт» + «Источник». Две колонки читались неоднозначно:
  // у расхода деньги уходят СО счёта, у дохода — приходят НА счёт, то есть при одном и том же
  // порядке колонок направление молча переворачивалось. Здесь направление задаётся явно, стрелкой:
  // слева всегда откуда, справа всегда куда.
  function operationLabelOf(t) {
    const acc = accountMeta(accounts, t.accountId);
    const accName = acc ? acc.name : "—";
    const other = t.via || null;
    if (t.type === "transfer") {
      const to = accountMeta(accounts, t.toAccountId);
      return { from: accName, to: to ? to.name : "—" };
    }
    if (t.type === "savings") {
      const sav = accountMeta(accounts, t.toAccountId);
      const savName = sav ? sav.name : "—";
      const src = t.source || "manual";
      // Деньги были на вкладе ещё до начала учёта — показываем это, а не выдуманную карту.
      if (t.direction === "deposit" && src === "opening") return { from:"Нач. капитал", to: savName };
      // Проценты начислены банком прямо на вклад, второго конца у операции нет.
      if (t.direction === "deposit" && src === "interest") return { from: savName, to: null };
      return t.direction === "withdraw" ? { from: savName, to: accName } : { from: accName, to: savName };
    }
    if (t.type === "debt") {
      // «Дал в долг» — деньги уходят со счёта человеку, «мне вернули» — приходят от него на счёт.
      return t.direction === "repay" ? { from: other || "—", to: accName } : { from: accName, to: other || "—" };
    }
    if (t.type === "income") return { from: other || "—", to: accName };
    return { from: accName, to: other || "—" }; // расход
  }
  function signedAmount(t) {
    // Знак — не по типу операции, а по реальному эффекту на баланс (balanceEffectOf):
    // "до начала учёта" и проценты по вкладу (гасят сами себя) эффекта не имеют — без знака.
    const effect = balanceEffectOf(t);
    let cls;
    if (t.type==="transfer") return { sign:"", cls:"text-sky-300" };
    if (t.type==="income") cls = "text-emerald-400";
    else if (t.type==="expense") cls = "text-rose-400";
    else if (t.type==="debt") cls = t.direction==="repay" ? "text-cyan-300" : "text-cyan-400";
    else cls = t.direction==="withdraw" ? "text-violet-300" : "text-violet-400";
    if (effect === 0) return { sign:"", cls:"text-zinc-500" };
    return { sign: effect > 0 ? "+" : "-", cls };
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {["all","income","expense","savings","debt","transfer"].map(k => (
          <button key={k} onClick={() => setTypeFilter(k)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${typeFilter===k ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "text-zinc-400 border-zinc-800 hover:border-zinc-700"}`}>{k==="all" ? "Все" : k==="income" ? "Доходы" : k==="expense" ? "Расходы" : k==="savings" ? "Сбережения" : k==="debt" ? "Долги" : "Переводы"}</button>
        ))}
        <div className="relative ml-auto">
          <Search className="w-3.5 h-3.5 text-zinc-600 absolute" style={{ left:10, top:"50%", transform:"translateY(-50%)" }} />
          <input className="bg-zinc-900 border border-zinc-800 rounded-lg py-1.5 text-xs text-zinc-300 placeholder-zinc-600" style={{ width:160, paddingLeft:30, paddingRight:12 }} placeholder="Поиск..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs mb-3">
        <span className="text-zinc-500">Показать:</span>
        {LIMIT_OPTIONS.map(n => (
          <button key={n===Infinity?"all":n} onClick={() => setLimit(n)} className={`px-2 py-1 rounded-md ${limit===n ? "bg-amber-500/15 text-amber-300" : "text-zinc-500 hover:text-zinc-300"}`}>{n===Infinity ? "Все" : n}</button>
        ))}
      </div>
      <div className="overflow-x-auto lq-scroll">
        <table className="w-full border-collapse" style={{ minWidth:640 }}>
          <thead>
            <tr className="border-b border-zinc-800">
              <Th k="date">Дата</Th>
              {show("category") && <Th k="category">Категория</Th>}
              {show("operation") && <th className="text-left text-xs font-data uppercase tracking-wide text-zinc-500 px-3 py-2">Операция</th>}
              {show("description") && <th className="text-left text-xs font-data uppercase tracking-wide text-zinc-500 px-3 py-2">Описание</th>}
              <Th k="amount">Сумма</Th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(t => {
              const sa = signedAmount(t);
              return (
                <tr key={t.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
                  <td className="px-3 py-2.5 text-xs text-zinc-400 font-data whitespace-nowrap">{fmtDateShort(t.date)}</td>
                  {show("category") && <td className="px-3 py-2.5 text-xs whitespace-nowrap">{badgeFor(t)}</td>}
                  {show("operation") && (() => { const op = operationLabelOf(t); return (
                    <td className="px-3 py-2.5 text-xs text-zinc-500" style={{ maxWidth:240 }}>
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <span className="truncate" style={{ maxWidth:100 }}>{op.from}</span>
                        {op.to && <>
                          <ArrowRight className="w-3 h-3 shrink-0 text-zinc-700"/>
                          <span className="truncate text-zinc-400" style={{ maxWidth:100 }}>{op.to}</span>
                        </>}
                      </span>
                    </td>
                  ); })()}
                  {show("description") && <td className="px-3 py-2.5 text-xs text-zinc-400" style={{ maxWidth:220 }}>{t.description || "—"}</td>}
                  <td className={`px-3 py-2.5 text-xs font-data font-semibold whitespace-nowrap ${sa.cls}`}>{sa.sign}{fmtMoney(t.amount)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => onEdit(t)} className="text-zinc-600 hover:text-zinc-200 p-1"><Pencil className="w-3.5 h-3.5"/></button>
                    <button onClick={() => onDelete(t.id)} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-sm text-zinc-500 text-center py-8">Операций не найдено.</div>}
      </div>
      <Pager page={safePage} limit={limit} total={filtered.length} onChange={setPage} />
    </div>
  );
}

function CategoryManagerModal({ open, onClose, categories, onAdd, onDelete, onRecolor, onReorder }) {
  const [tab, setTab] = useState("expense");
  const [name, setName] = useState("");
  const [newColor, setNewColor] = useState("emerald");
  const [recoloring, setRecoloring] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const list = categories[tab];
  const movableCount = list.filter(c => c.name!=="Другое").length;

  function submit() {
    const n = name.trim();
    if (!n) return;
    if (list.some(c => c.name.toLowerCase()===n.toLowerCase())) return;
    onAdd(tab, { name:n, color:newColor });
    setName("");
  }

  return (
    <Modal open={open} onClose={onClose} title="Категории доходов и расходов" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { setTab("expense"); setDragIdx(null); }} className={`py-2 rounded-xl text-sm font-medium border transition ${tab==="expense" ? "bg-rose-500/15 border-rose-500/30 text-rose-400" : "border-zinc-800 text-zinc-500"}`}>Расходы</button>
          <button onClick={() => { setTab("income"); setDragIdx(null); }} className={`py-2 rounded-xl text-sm font-medium border transition ${tab==="income" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "border-zinc-800 text-zinc-500"}`}>Доходы</button>
        </div>
        <div className="space-y-2 overflow-y-auto lq-scroll" style={{ maxHeight:260 }}>
          {list.map((c, idx) => (
            <EditableListRow key={c.name} item={c} idx={idx} movableCount={movableCount}
              isPinned={c.name==="Другое"}
              isProtected={c.name==="Другое" || c.name==="Люди"}
              isRecoloring={recoloring===c.name}
              onToggleRecolor={() => setRecoloring(r => r===c.name ? null : c.name)}
              onRecolor={(col) => onRecolor(tab, c.name, col)}
              onDelete={() => onDelete(tab, c.name)}
              onMove={(from,to) => onReorder(tab, from, to)}
              isDragging={dragIdx===idx}
              onDragStart={setDragIdx}
              onDrop={(dropIdx) => { if (dragIdx!==null && dragIdx!==dropIdx) onReorder(tab, dragIdx, dropIdx); setDragIdx(null); }}
              onDragEnd={() => setDragIdx(null)}
            />
          ))}
        </div>
        <div className="border-t border-zinc-800 pt-4">
          <label className={labelCls}>Новая категория</label>
          <div className="flex gap-2 mb-2">
            <input className={inputCls} value={name} onChange={e=>setName(e.target.value)} placeholder="Название" onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); submit(); } }} />
            <Button variant="secondary" onClick={submit}><Plus className="w-4 h-4"/></Button>
          </div>
          <ColorPicker value={newColor} onChange={setNewColor} />
        </div>
      </div>
    </Modal>
  );
}

function DebtsCard({ state, onQuickRepay, navigate }) {
  const list = useMemo(() => debtsByPerson(state).filter(d => d.amount > 0), [state.transactions]);
  return (
    <CollapsibleCard title="Кто вам должен">
      {list.length === 0 ? (
        <div className="text-sm text-zinc-500">Пока никто не должен — отметь операцию с типом «Долг», когда одолжишь кому-то денег.</div>
      ) : (
        <div className="space-y-1">
          {list.map(d => (
            <div key={d.personId || d.person} className="flex items-center justify-between gap-3 py-2 border-b border-zinc-800/60 last:border-0">
              {d.personId ? (
                <button onClick={() => navigate("people", d.personId)} className="text-sm text-zinc-300 truncate flex items-center gap-2 hover:text-cyan-300 transition text-left">
                  <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0"/>{d.person}
                </button>
              ) : (
                <span className="text-sm text-zinc-300 truncate flex items-center gap-2"><Users className="w-3.5 h-3.5 text-cyan-400 shrink-0"/>{d.person}</span>
              )}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-data font-semibold text-cyan-400">{fmtMoney(d.amount)}</span>
                <Button size="sm" variant="secondary" onClick={() => onQuickRepay(d.person, d.amount, d.personId)}>Вернули</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

// Разбивка по счетам — то, что открывается кликом по карточке сверху. Интерфейс намеренно
// остаётся прежним (данные пишутся обобщённо), а подробности прячутся на один клик вглубь.
function AccountBreakdownModal({ open, onClose, title, state, kind, metric="balance", month }) {
  const rows = open
    ? activeAccounts(state, kind).map(a => ({ account:a, balance: accountMetricOf(state, a.id, metric, month) }))
    : [];
  const total = rows.filter(r => r.account.tracked !== false).reduce((a,r) => a + r.balance, 0);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="text-sm text-zinc-500">Счетов этого типа пока нет.</div>
        ) : rows.map(({ account:a, balance }) => {
          const c = pal(a.color);
          const untracked = a.tracked === false;
          const share = total > 0 && !untracked ? Math.round((balance / total) * 100) : null;
          return (
            <div key={a.id} className={`p-3 rounded-xl border ${untracked ? "border-zinc-900 opacity-60" : "border-zinc-800"}`}>
              <div className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${c.bgSoft}`}>
                  {a.emoji ? <span className="text-sm">{a.emoji}</span> : <Wallet className={`w-4 h-4 ${c.text}`}/>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zinc-200 truncate flex items-center gap-1.5">
                    {a.frozen && <span title="Деньги заморожены">❄</span>}
                    {a.name}
                    {untracked && <span className="text-xs text-zinc-600">· не в итогах</span>}
                  </div>
                  {a.kind==="savings" && (a.startDate || a.endDate) && (
                    <div className="text-xs text-zinc-600 font-data">
                      {a.startDate ? fmtDateShort(a.startDate) : "…"} → {a.endDate ? fmtDateShort(a.endDate) : "…"}
                      {a.endDate && a.endDate >= todayStr() ? ` · осталось ${daysBetween(todayStr(), a.endDate)} дн.` : ""}
                      {a.endDate && a.endDate < todayStr() ? " · срок вышел" : ""}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-data text-sm text-zinc-100">{fmtMoney(balance)}</div>
                  {share != null && <div className="text-xs text-zinc-600">{share}%</div>}
                </div>
              </div>
            </div>
          );
        })}
        {rows.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-sm">
            <span className="text-zinc-500">
              {metric==="income" ? "Всего зачислено" : metric==="expense" ? "Всего списано" : "Итого по отслеживаемым"}
            </span>
            <span className="font-data text-zinc-100">{fmtMoney(total)}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Менеджер счетов: создание, правка, отслеживание, архив, удаление. Форма редактирования
// разворачивается прямо в строке — отдельная вложенная модалка ради пяти полей была бы лишней.
function AccountsManagerModal({ open, onClose, state, actions }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const accounts = (state.accounts||[]).slice().sort((a,b) => (a.order??0)-(b.order??0));

  function startCreate() {
    setEditingId("new");
    setDraft({ name:"", kind:"regular", color:"amber", emoji:"", frozen:false, refillable:true, startDate:"", endDate:"" });
  }
  function startEdit(a) {
    setEditingId(a.id);
    setDraft({ name:a.name, kind:a.kind, color:a.color||"amber", emoji:a.emoji||"", frozen:!!a.frozen,
      refillable: a.refillable !== false, startDate:a.startDate||"", endDate:a.endDate||"" });
  }
  function save() {
    if (!draft.name.trim()) return;
    const patch = {
      name:draft.name.trim(), kind:draft.kind, color:draft.color, emoji:draft.emoji.trim() || null,
      frozen: draft.kind==="savings" ? draft.frozen : false,
      refillable: draft.kind==="savings" ? draft.refillable : true,
      startDate: draft.kind==="savings" ? (draft.startDate || null) : null,
      endDate: draft.kind==="savings" ? (draft.endDate || null) : null,
    };
    if (editingId === "new") actions.addAccount(patch);
    else actions.updateAccount(editingId, patch);
    setEditingId(null); setDraft(null);
  }

  const inputCls = "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200";
  return (
    <Modal open={open} onClose={onClose} title="Счета" maxWidth="max-w-xl">
      <div className="space-y-3">
        {accounts.map((a, idx) => {
          const balance = accountBalanceOf(state, a.id);
          const c = pal(a.color);
          if (editingId === a.id) {
            return <AccountEditor key={a.id} draft={draft} setDraft={setDraft} inputCls={inputCls} onSave={save} onCancel={() => { setEditingId(null); setDraft(null); }} />;
          }
          return (
            <div key={a.id} className={`p-3 rounded-xl border flex items-center gap-3 ${a.archived ? "border-zinc-900 opacity-60" : "border-zinc-800"}`}>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${c.bgSoft}`}>
                {a.emoji ? <span className="text-sm">{a.emoji}</span> : <Wallet className={`w-4 h-4 ${c.text}`}/>}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-zinc-200 truncate flex items-center gap-1.5">
                  {a.frozen && <span title="Заморожен">❄</span>}{a.name}
                  {a.archived && <span className="text-xs text-zinc-600">· в архиве</span>}
                </div>
                <div className="text-xs text-zinc-600">{ACCOUNT_KINDS[a.kind].label} · {fmtMoney(balance)}</div>
              </div>
              <button onClick={() => actions.toggleAccountTracked(a.id)}
                className={`shrink-0 ${a.tracked !== false ? "text-sky-400" : "text-zinc-700 hover:text-zinc-400"}`}
                title={a.tracked !== false ? "Учитывается в итогах" : "Не учитывается в итогах"}>
                {a.tracked !== false ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
              </button>
              <div className="flex flex-col shrink-0">
                <button onClick={() => actions.moveAccount(a.id, -1)} disabled={idx===0}
                  className="text-zinc-600 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-600 leading-none">
                  <ChevronUp className="w-3.5 h-3.5"/>
                </button>
                <button onClick={() => actions.moveAccount(a.id, 1)} disabled={idx===accounts.length-1}
                  className="text-zinc-600 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-600 leading-none">
                  <ChevronDown className="w-3.5 h-3.5"/>
                </button>
              </div>
              <KebabMenu items={[
                { icon:Pencil, label:"Изменить", onClick:() => startEdit(a) },
                a.archived
                  ? { icon:ArchiveRestore, label:"Из архива", onClick:() => actions.archiveAccount(a.id, false) }
                  : { icon:Archive, label:"В архив", onClick:() => actions.archiveAccount(a.id, true) },
                { divider:true },
                { icon:Trash2, label:"Удалить", danger:true, onClick:() => actions.deleteAccount(a.id) },
              ]} />
            </div>
          );
        })}

        {editingId === "new"
          ? <AccountEditor draft={draft} setDraft={setDraft} inputCls={inputCls} onSave={save} onCancel={() => { setEditingId(null); setDraft(null); }} />
          : <Button variant="secondary" onClick={startCreate}><Plus className="w-4 h-4"/>Добавить счёт</Button>}

        <div className="text-xs text-zinc-600">
          Новый счёт создаётся пустым — первые деньги вносятся обычной операцией с источником
          «Начальный капитал», как в банке. Глазок убирает счёт из общих итогов, не трогая его историю.
        </div>
      </div>
    </Modal>
  );
}

function AccountEditor({ draft, setDraft, inputCls, onSave, onCancel }) {
  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  return (
    <div className="p-3 rounded-xl border border-zinc-700 space-y-3">
      <div className="flex gap-2">
        <input className={`${inputCls} w-16 text-center`} value={draft.emoji} onChange={e=>set({ emoji:e.target.value })} placeholder="💳" />
        <input className={inputCls} value={draft.name} onChange={e=>set({ name:e.target.value })} placeholder="Название счёта" autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Object.keys(ACCOUNT_KINDS).map(k => (
          <button key={k} onClick={() => set({ kind:k })}
            className={`py-2 rounded-lg text-xs border transition ${draft.kind===k ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>
            {ACCOUNT_KINDS[k].label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.keys(PALETTE).map(color => (
          <button key={color} onClick={() => set({ color })}
            className={`w-6 h-6 rounded-full ${pal(color).bgSolid} ${draft.color===color ? "ring-2 ring-zinc-300" : "opacity-60"}`} />
        ))}
      </div>
      {draft.kind === "savings" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Начало</div>
              <input type="date" className={inputCls} value={draft.startDate} onChange={e=>set({ startDate:e.target.value })} />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Окончание</div>
              <input type="date" className={inputCls} value={draft.endDate} onChange={e=>set({ endDate:e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => set({ frozen: !draft.frozen })}
              className={`px-3 py-1.5 rounded-full text-xs border transition ${draft.frozen ? "bg-sky-500/15 border-sky-500/30 text-sky-300" : "border-zinc-800 text-zinc-500"}`}>
              ❄ Заморожен
            </button>
            <button onClick={() => set({ refillable: !draft.refillable })}
              className={`px-3 py-1.5 rounded-full text-xs border transition ${draft.refillable ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "border-zinc-800 text-zinc-500"}`}>
              Пополняемый
            </button>
          </div>
          <div className="text-xs text-zinc-600">
            Непополняемый вклад вносится одной суммой — при второй попытке пополнить форма предупредит.
          </div>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Отмена</Button>
        <Button size="sm" onClick={onSave} disabled={!draft.name.trim()}>Сохранить</Button>
      </div>
    </div>
  );
}

function FinanceFieldsModal({ open, onClose, fields, onChange }) {
  return (
    <Modal open={open} onClose={onClose} title="Отображение истории">
      <div className="space-y-2">
        {FINANCE_TABLE_FIELDS.map(f => {
          const on = f.locked || fields[f.id] !== false;
          return (
            <button key={f.id} onClick={() => !f.locked && onChange(f.id, !on)} disabled={f.locked}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-sm transition ${on ? "border-zinc-700 bg-zinc-800/60 text-zinc-200" : "border-zinc-800 text-zinc-500"} ${f.locked ? "opacity-70 cursor-default" : ""}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-amber-500 border-transparent" : "border-zinc-600"}`}>
                {on && <Check className="w-3 h-3 text-zinc-950"/>}
              </span>
              <span className="flex-1 text-left">{f.label}</span>
              {f.locked && <span className="text-xs text-zinc-600">всегда</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function FinanceView({ state, actions, navigate }) {
  const [month, setMonth] = useState(monthKey(todayStr()));
  const [modalOpen, setModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [breakdown, setBreakdown] = useState(null); // { title, kind }
  const tableFields = { ...defaultFinanceTableFields(), ...(state.uiPrefs && state.uiPrefs.financeTableFields) };
  const [editing, setEditing] = useState(null);
  const [prefill, setPrefill] = useState(null);

  const monthTx = useMemo(() => state.transactions.filter(t => monthKey(t.date)===month), [state.transactions, month]);
  const income = monthTx.reduce((a,t) => {
    if (t.type==="income") return a + t.amount;
    if (savingsCountsAsIncome(t)) return a + t.amount;
    return a;
  }, 0);
  const expense = monthTx.filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
  const monthBalance = monthTx.reduce((a,t) => a + balanceEffectOf(t), 0);
  const totalSavings = useMemo(() => totalSavingsOf(state), [state.transactions]);
  const totalDebt = useMemo(() => totalDebtOf(state), [state.transactions]);
  // Общий баланс — сумма остатков отслеживаемых обычных счетов. Раньше считался прямой суммой
  // balanceEffectOf по всем операциям; для сохранений, прошедших миграцию, результат тот же, но
  // теперь счёт, снятый с отслеживания, корректно выпадает из итога (и появляется разбивка).
  const allTimeBalance = useMemo(() => accountsTotal(state, "regular"), [state.transactions, state.accounts]);
  const spentByCategory = useMemo(() => {
    const map = {};
    monthTx.filter(t=>t.type==="expense").forEach(t => { map[t.category] = (map[t.category]||0) + t.amount; });
    return map;
  }, [monthTx]);
  const knownPersons = useMemo(() => {
    const set = new Set();
    state.transactions.forEach(t => { if (t.type==="debt" && t.person) set.add(t.person); });
    return [...set].sort();
  }, [state.transactions]);

  function openCreate() { setEditing(null); setPrefill(null); setModalOpen(true); }
  function openEdit(tx) { setEditing(tx); setPrefill(null); setModalOpen(true); }
  function openQuickRepay(person, amount, personId) { setEditing(null); setPrefill({ type:"debt", direction:"repay", person, amount, personId: personId || null }); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updateTransaction(editing.id, data); else actions.addTransaction(data);
    setModalOpen(false);
  }

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Учёт денег" title="Финансы" action={
        <div className="flex items-center gap-2">
          <KebabMenu items={[
            { icon:Palette, label:"Категории",  onClick:() => setCatModalOpen(true) },
            { icon:Wallet,  label:"Счета",      onClick:() => setAccountsOpen(true) },
            { icon:Sliders, label:"Отображение",onClick:() => setFieldsOpen(true) },
          ]} />
        </div>
      } />

      <MonthNav month={month} onChange={setMonth} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Карточки остались прежними — подробности по счетам прячутся на один клик вглубь,
            чтобы не перегружать основной экран (см. ТЗ, п.4). */}
        <button onClick={() => setBreakdown({ title:"Доходы за месяц: по счетам", kind:"regular", metric:"income", month })} className="text-left">
          <StatCard label="Доходы за месяц" value={fmtMoney(income)} icon={ArrowUpRight} tone="emerald" />
        </button>
        <button onClick={() => setBreakdown({ title:"Расходы за месяц: по счетам", kind:"regular", metric:"expense", month })} className="text-left">
          <StatCard label="Расходы за месяц" value={fmtMoney(expense)} icon={ArrowDownRight} tone="rose" />
        </button>
        <button onClick={() => setBreakdown({ title:"Баланс месяца: по счетам", kind:"regular", metric:"monthBalance", month })} className="text-left">
          <StatCard label="Баланс месяца" value={fmtMoney(monthBalance)} icon={Wallet} tone={monthBalance>=0 ? "emerald" : "rose"} />
        </button>
        <button onClick={() => setBreakdown({ title:"Общий баланс: по счетам", kind:"regular" })} className="text-left">
          <StatCard label="Общий баланс" value={fmtMoney(allTimeBalance)} icon={DollarSign} tone="amber" />
        </button>
        <button onClick={() => setBreakdown({ title:"Сбережения и вклады", kind:"savings" })} className="text-left">
          <StatCard label="Сбережения" value={fmtMoney(totalSavings)} icon={PiggyBank} tone="violet" />
        </button>
        <StatCard label="Мне должны" value={fmtMoney(totalDebt)} icon={Users} tone="cyan" />
      </div>

      <CollapsibleCard title="Доходы, расходы и сбережения по месяцам">
        <IncomeExpenseBar transactions={state.transactions} />
      </CollapsibleCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <CollapsibleCard title="Расходы по категориям">
          <ExpenseByCategoryPie transactions={state.transactions} month={month} categories={state.categories} />
        </CollapsibleCard>
        <CollapsibleCard title="Куда делись деньги за месяц">
          <MoneyFlowPie transactions={state.transactions} month={month} />
        </CollapsibleCard>
      </div>

      <CollapsibleCard title="Баланс нарастающим итогом">
        <BalanceLine transactions={state.transactions} />
      </CollapsibleCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <CollapsibleCard title={`Бюджеты на ${monthLabel(month).toLowerCase()}`}>
          <div className="divide-y divide-zinc-800">
            {Object.keys(state.budgets).map(cat => (
              <BudgetRow key={cat} category={cat} limit={state.budgets[cat]} spent={spentByCategory[cat]||0} onChange={(v) => actions.setBudget(cat, v)} />
            ))}
          </div>
        </CollapsibleCard>
        <DebtsCard state={state} onQuickRepay={openQuickRepay} navigate={navigate} />
      </div>

      <CollapsibleCard title="Все операции">
        <TransactionsTable transactions={state.transactions} categories={state.categories} accounts={state.accounts} fields={tableFields} onDelete={actions.deleteTransaction} onEdit={openEdit} />
      </CollapsibleCard>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Изменить операцию" : "Новая операция"}>
        <TransactionForm categories={state.categories} knownPersons={knownPersons} people={activePeople(state.people)} transactions={state.transactions} accounts={state.accounts} initial={editing || prefill} isEdit={!!editing} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>

      <AccountsManagerModal open={accountsOpen} onClose={() => setAccountsOpen(false)} state={state} actions={actions} />
      <FinanceFieldsModal open={fieldsOpen} onClose={() => setFieldsOpen(false)} fields={tableFields}
        onChange={(key,val) => actions.updateFinanceTableFields({ [key]: val })} />
      <AccountBreakdownModal open={!!breakdown} onClose={() => setBreakdown(null)}
        title={breakdown ? breakdown.title : ""} kind={breakdown ? breakdown.kind : "regular"}
        metric={breakdown ? (breakdown.metric || "balance") : "balance"} month={breakdown ? breakdown.month : undefined}
        state={state} />
      <StickyAddButton onClick={openCreate} label="Добавить операцию" />
      <CategoryManagerModal open={catModalOpen} onClose={() => setCatModalOpen(false)} categories={state.categories} onAdd={actions.addCategory} onDelete={actions.deleteCategory} onRecolor={actions.recolorCategory} onReorder={actions.reorderCategory} />
    </div>
  );
}
