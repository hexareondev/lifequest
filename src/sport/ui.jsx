// Интерфейс спорта: замеры тела, упражнения, шаблоны и журнал тренировок.

import { copyTextToClipboard, downloadTextFile } from "../core/download.js";
import { tierFromFraction, tierLabel } from "../habits/model.js";
import { planUnitOffsetOf, resolvePlanDate } from "../import/plan-dates.js";
import {
  buildAiWorkoutGuide, buildWorkoutPlanImport, parseWorkoutPlanPayload, workoutPlanDraftSummary,
} from "../import/workout-plan.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Check, ChevronDown, Dumbbell, Plus, Trash2, X, Rocket, ArchiveRestore, Archive, Sparkles, Upload,
  AlertCircle, Download, Copy, FileJson, ChevronLeft, ChevronRight, Search, Pencil, ListPlus,
} from "lucide-react";
import { addDaysToDateStr, clamp, todayStr, uid } from "../core/basics.js";
import { fmtDateShort, pluralRu, fmtDateWithYear } from "../core/format.js";
import { WEEKDAY_LABELS } from "../core/week.js";
import {
  Button, Card, KebabMenu, Modal, ProgressBar, inputCls, labelCls, SectionHeader, EmptyState,
  StickyAddButton,
} from "../ui/atoms.jsx";
import {
  BODY_EQUIPMENT, BODY_FOCUS, BODY_LEVELS, EXERCISE_KINDS, EXERCISE_KIND_ORDER, MUSCLE_GROUPS,
  MUSCLE_GROUP_ORDER, ageFromBirthDate, bmiOf, bodyWeightOf, defaultBody, workoutSetStats,
  workoutVolume, planStats, planFinalReward, planSessionsOf, workoutLogOnDate, workoutWeekStats,
  workoutDayFraction, defaultSportGoal, isSportGoalSet, isSportGoalActive, buildPlanSessions,
} from "./model.js";

// Характеристики замера: по одному ключу на поле формы, чтобы график, подпись и единицы не
// разъезжались между собой при добавлении новой метрики.
const BODY_METRICS = {
  weight:  { label:"Вес",   unit:"кг", color:"#34d399" },
  waist:   { label:"Талия", unit:"см", color:"#38bdf8" },
  chest:   { label:"Грудь", unit:"см", color:"#a78bfa" },
  hips:    { label:"Бёдра", unit:"см", color:"#fb7185" },
  bodyFat: { label:"Жир",   unit:"%",  color:"#fbbf24" },
};
const BODY_METRIC_ORDER = Object.keys(BODY_METRICS);

function BodyMeasureTooltip({ active, payload, metric }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const m = BODY_METRICS[metric];
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 shadow-xl">
      <div className="text-xs text-zinc-500 font-data">{point.label}</div>
      <div className="text-sm text-zinc-100 font-data mt-0.5">{m.label}: {point.value} {m.unit}</div>
      {point.delta != null && point.delta !== 0 && (
        <div className={`text-xs font-data mt-0.5 ${point.delta < 0 ? "text-emerald-400" : "text-amber-400"}`}>
          {point.delta > 0 ? "+" : ""}{Math.round(point.delta*10)/10} {m.unit} к прошлому замеру
        </div>
      )}
      {point.note && <div className="text-xs text-zinc-500 mt-1">{point.note}</div>}
    </div>
  );
}

// Параметры, от которых зависит план: уровень, цель, дни, инвентарь и ограничения. Живут рядом
// с планом, а не в «Теле», потому что задавать их нужно ПЕРЕД составлением плана, а не когда
// записываешь вес. В «Теле» остались только замеры — то, что измеряют, а не настраивают.
export function TrainingParamsCard({ state, actions, collapsed, onToggle }) {
  const body = state.profile.body || defaultBody();
  const summary = [
    BODY_LEVELS[body.level],
    BODY_FOCUS[body.focus],
    (body.trainingDays||[]).length ? body.trainingDays.map(d => WEEKDAY_LABELS[d-1]).join(", ") : null,
  ].filter(Boolean).join(" · ");
  return (
    <Card className="p-5">
      <button onClick={onToggle} className="w-full flex items-center gap-2 text-left">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-200">Параметры тренировок</div>
          <div className="text-xs text-zinc-500 mt-0.5 truncate">{summary || "Не заданы"}</div>
        </div>
        <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0 transition-transform" style={{ transform: collapsed ? "rotate(-90deg)" : "none" }}/>
      </button>
      {!collapsed && (
        <div className="mt-4">
          <div className="text-xs text-zinc-600 mb-3">По ним строится план — и свой, и тот, что попросите у ИИ.</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Уровень подготовки</label>
            <select className={inputCls} value={body.level||"regular"} onChange={e=>actions.updateBody({ level:e.target.value })}>
              {Object.entries(BODY_LEVELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Чего хочу</label>
            <select className={inputCls} value={body.focus||"health"} onChange={e=>actions.updateBody({ focus:e.target.value })}>
              {Object.entries(BODY_FOCUS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Дни для тренировок</label>
            <div className="flex gap-1">
              {WEEKDAY_LABELS.map((l,i) => {
                const day = i+1;
                const on = (body.trainingDays||[]).includes(day);
                return (
                  <button key={l} onClick={() => actions.updateBody({ trainingDays: on ? body.trainingDays.filter(d=>d!==day) : [...(body.trainingDays||[]), day].sort() })}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] border transition ${on ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "border-zinc-800 text-zinc-600"}`}>{l}</button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <label className={labelCls}>Что доступно</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(BODY_EQUIPMENT).map(([k,v]) => {
              const on = (body.equipment||[]).includes(k);
              return (
                <button key={k} onClick={() => actions.updateBody({ equipment: on ? body.equipment.filter(x=>x!==k) : [...(body.equipment||[]), k] })}
                  className={`px-2.5 py-1 rounded-full text-xs border transition ${on ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "border-zinc-800 text-zinc-600"}`}>{v}</button>
              );
            })}
          </div>
        </div>

        <div className="mt-3">
          <label className={labelCls}>Ограничения и травмы</label>
          <textarea className={inputCls} rows={2} value={body.limitations||""} onChange={e=>actions.updateBody({ limitations:e.target.value })}
            placeholder="Например: болит правое плечо, не делать жим над головой" />
        </div>
        </div>
      )}
    </Card>
  );
}

export function BodyPanel({ state, actions }) {
  const body = state.profile.body || defaultBody();
  const [measureOpen, setMeasureOpen] = useState(false);
  const [metric, setMetric] = useState("weight");
  const weight = bodyWeightOf(state);
  const age = ageFromBirthDate(body.birthDate);
  const bmi = bmiOf(body.height, weight);
  const sorted = useMemo(() => (state.bodyLog||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)), [state.bodyLog]);
  // В график идут только замеры с выбранной характеристикой: пропуски не должны рисовать провал
  // до нуля. Разница с прошлой точкой считается здесь же — она нужна подсказке.
  const chartData = useMemo(() => {
    const points = sorted.filter(m => m[metric] != null && m[metric] !== "");
    return points.map((m, i) => ({
      label: fmtDateShort(m.date),
      value: Number(m[metric]),
      delta: i > 0 ? Number(m[metric]) - Number(points[i-1][metric]) : null,
      note: m.notes || null,
    }));
  }, [sorted, metric]);
  // Характеристика попадает в переключатель, только если по ней есть хотя бы один замер.
  const availableMetrics = useMemo(
    () => BODY_METRIC_ORDER.filter(k => sorted.some(m => m[k] != null && m[k] !== "")),
    [sorted]
  );
  useEffect(() => {
    if (availableMetrics.length && !availableMetrics.includes(metric)) setMetric(availableMetrics[0]);
  }, [availableMetrics, metric]);
  // Изменение за месяц: сравниваем последний замер с ближайшим к дате «месяц назад».
  const monthDelta = useMemo(() => {
    const withWeight = sorted.filter(m => m.weight!=null);
    if (withWeight.length < 2) return null;
    const target = addDaysToDateStr(todayStr(), -30);
    const older = withWeight.filter(m => m.date <= target);
    const base = older.length ? older[older.length-1] : withWeight[0];
    return Math.round((Number(withWeight[withWeight.length-1].weight) - Number(base.weight))*10)/10;
  }, [sorted]);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-sm font-semibold text-zinc-200">Тело</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Замеры и их динамика. Пол, дата рождения и рост — в «Профиле», параметры тренировок — во вкладке «План».
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setMeasureOpen(true)}><Plus className="w-3.5 h-3.5"/>Замер</Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[
            { label:"Вес", value: weight!=null ? `${weight} кг` : "—", hint: monthDelta!=null ? `${monthDelta>0?"+":""}${monthDelta} за месяц` : null },
            { label:"Рост", value: body.height ? `${body.height} см` : "—" },
            { label:"Возраст", value: age!=null ? `${age} ${pluralRu(age,"год","года","лет")}` : "—" },
            { label:"ИМТ", value: bmi!=null ? String(bmi) : "—" },
          ].map(x => (
            <div key={x.label} className="rounded-xl border border-zinc-800 p-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-600">{x.label}</div>
              <div className="font-data text-lg text-zinc-100">{x.value}</div>
              {x.hint && <div className={`text-[10px] font-data ${monthDelta<0 ? "text-emerald-400" : monthDelta>0 ? "text-amber-400" : "text-zinc-600"}`}>{x.hint}</div>}
            </div>
          ))}
        </div>

      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="text-sm font-semibold text-zinc-200">Замеры</div>
          {availableMetrics.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {availableMetrics.map(k => (
                <button key={k} onClick={() => setMetric(k)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition ${metric===k ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "border-zinc-800 text-zinc-600"}`}>
                  {BODY_METRICS[k].label}
                </button>
              ))}
            </div>
          )}
        </div>
        {chartData.length < 2 ? (
          <div className="text-sm text-zinc-500">Нужно хотя бы два замера {BODY_METRICS[metric].label.toLowerCase()}, чтобы построить график.</div>
        ) : (
          <div style={{ height:220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top:8, right:8, left:-16, bottom:0 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill:"#71717a", fontSize:11 }} />
                <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill:"#71717a", fontSize:11 }} />
                <Tooltip content={(props) => <BodyMeasureTooltip {...props} metric={metric} />} />
                <Line type="monotone" dataKey="value" stroke={BODY_METRICS[metric].color} strokeWidth={2} dot={{ r:3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {sorted.length > 0 && (
          <div className="mt-3 space-y-1.5 max-h-56 overflow-y-auto pr-1 lq-scroll">
            {sorted.slice().reverse().map(m => (
              <div key={m.id} className="flex items-center gap-3 text-xs bg-zinc-950/40 border border-zinc-800 rounded-lg px-3 py-2">
                <span className="font-data text-zinc-500 w-16 shrink-0">{fmtDateShort(m.date)}</span>
                <span className="font-data text-zinc-200 w-20 shrink-0">{m.weight!=null ? `${m.weight} кг` : "—"}</span>
                <span className="text-zinc-600 truncate flex-1">
                  {[m.waist!=null && `талия ${m.waist}`, m.chest!=null && `грудь ${m.chest}`, m.hips!=null && `бёдра ${m.hips}`, m.bodyFat!=null && `жир ${m.bodyFat}%`].filter(Boolean).join(" · ")}
                </span>
                <button onClick={() => actions.deleteBodyMeasure(m.id)} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <BodyMeasureModal open={measureOpen} onClose={() => setMeasureOpen(false)}
        onSubmit={(data) => { actions.addBodyMeasure(data); setMeasureOpen(false); }} />
    </div>
  );
}

// Все поля замера, кроме даты, необязательны: на процент жира и обхваты нужен либо инвентарь,
// либо медосмотр, и требовать их значило бы, что форму просто перестанут заполнять.
function BodyMeasureModal({ open, onClose, onSubmit }) {
  const [date, setDate] = useState(todayStr());
  const [vals, setVals] = useState({ weight:"", waist:"", chest:"", hips:"", bodyFat:"" });
  const [notes, setNotes] = useState("");
  useEffect(() => { if (open) { setDate(todayStr()); setVals({ weight:"", waist:"", chest:"", hips:"", bodyFat:"" }); setNotes(""); } }, [open]);
  const num = (v) => v==="" ? null : Number(v);
  const FIELDS = [
    { k:"weight", label:"Вес, кг", step:"0.1" },
    { k:"waist", label:"Талия, см", step:"0.5" },
    { k:"chest", label:"Грудь, см", step:"0.5" },
    { k:"hips", label:"Бёдра, см", step:"0.5" },
    { k:"bodyFat", label:"Жир, %", step:"0.1" },
  ];
  return (
    <Modal open={open} onClose={onClose} title="Новый замер">
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Дата</label>
          <input type="date" className={inputCls} value={date} onChange={e=>setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {FIELDS.map(f => (
            <div key={f.k}>
              <label className={labelCls}>{f.label}</label>
              <input type="number" min="0" step={f.step} className={inputCls} value={vals[f.k]}
                onChange={e=>setVals(v => ({ ...v, [f.k]:e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="text-xs text-zinc-600">Заполнять всё не нужно — достаточно того, что реально измерили.</div>
        <div>
          <label className={labelCls}>Заметка</label>
          <input className={inputCls} value={notes} onChange={e=>setNotes(e.target.value)} />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button disabled={!date} onClick={() => onSubmit({ date, notes, ...Object.fromEntries(FIELDS.map(f => [f.k, num(vals[f.k])])) })}>Записать</Button>
        </div>
      </div>
    </Modal>
  );
}

// Карточка сессии в журнале: подходы отмечаются прямо здесь — вводить веса задним числом
// неудобно, отмечать по ходу тренировки удобно.
export function WorkoutSessionCard({ session, state, actions, onAddExercise }) {
  const stats = workoutSetStats(session);
  const volume = workoutVolume(session);
  const done = session.status === "done";
  const skipped = session.status === "skipped";
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${done ? "bg-emerald-500/15 text-emerald-400" : skipped ? "bg-zinc-800 text-zinc-500" : "bg-amber-500/15 text-amber-400"}`}>
          <Dumbbell className="w-5 h-5"/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-100 break-words">{session.title}</div>
          <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap font-data">
            <span>{stats.done}/{stats.total} подходов</span>
            {volume > 0 && <span>· {Math.round(volume)} кг тоннаж</span>}
            {session.minutes ? <span>· {session.minutes} мин</span> : null}
            {session.rpe ? <span>· RPE {session.rpe}</span> : null}
            {skipped && <span className="text-zinc-600">· пропущена</span>}
          </div>
        </div>
        <KebabMenu items={[
          { icon: Check, label: done ? "Снять отметку" : "Отметить выполненной",
            onClick: () => actions.updateWorkoutSession(session.id, { status: done ? "planned" : "done" }) },
          { icon: X, label: skipped ? "Вернуть в план" : "Отметить пропущенной",
            onClick: () => actions.updateWorkoutSession(session.id, { status: skipped ? "planned" : "skipped" }) },
          { divider: true },
          { icon: Trash2, label: "Удалить запись", onClick: () => actions.deleteWorkoutSession(session.id), danger: true },
        ]} />
      </div>

      {stats.total > 0 && <div className="mt-3"><ProgressBar value={stats.total ? stats.done/stats.total : 0} colorClass={done ? "bg-emerald-500" : "bg-amber-500"} heightClass="h-1.5" /></div>}

      <div className="mt-3 space-y-3">
        {session.entries.map(entry => {
          const ex = state.exercises.find(e => e.id===entry.exerciseId);
          const kind = ex ? ex.kind : "strength";
          return (
            <div key={entry.id} className="rounded-xl border border-zinc-800 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-zinc-200 truncate flex-1">{entry.name}</span>
                <button onClick={() => actions.addWorkoutSet(session.id, entry.id)} className="text-zinc-600 hover:text-zinc-200" title="Добавить подход"><Plus className="w-3.5 h-3.5"/></button>
                <button onClick={() => actions.removeWorkoutEntry(session.id, entry.id)} className="text-zinc-600 hover:text-red-400" title="Убрать упражнение"><X className="w-3.5 h-3.5"/></button>
              </div>
              <div className="space-y-1.5">
                {entry.sets.map((st, i) => (
                  <div key={st.id} className="flex items-center gap-2">
                    <button onClick={() => actions.toggleWorkoutSet(session.id, entry.id, st.id)}
                      className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${st.done ? "bg-emerald-500 border-emerald-500" : "border-zinc-600 hover:border-zinc-400"}`}>
                      {st.done && <Check className="w-3 h-3 text-zinc-950"/>}
                    </button>
                    <span className="text-[11px] font-data text-zinc-600 w-4 shrink-0">{i+1}</span>
                    {kind === "strength" ? (
                      <>
                        <input type="number" min="0" value={st.reps ?? ""} onChange={e=>actions.updateWorkoutSet(session.id, entry.id, st.id, { reps: e.target.value==="" ? null : Number(e.target.value) })}
                          className="w-16 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 font-data" />
                        <span className="text-[11px] text-zinc-600">повт ×</span>
                        <input type="number" min="0" step="0.5" value={st.weight ?? ""} onChange={e=>actions.updateWorkoutSet(session.id, entry.id, st.id, { weight: e.target.value==="" ? null : Number(e.target.value) })}
                          className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 font-data" />
                        <span className="text-[11px] text-zinc-600">кг</span>
                      </>
                    ) : (
                      <>
                        <input type="number" min="0" value={st.minutes ?? ""} onChange={e=>actions.updateWorkoutSet(session.id, entry.id, st.id, { minutes: e.target.value==="" ? null : Number(e.target.value) })}
                          className="w-16 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 font-data" />
                        <span className="text-[11px] text-zinc-600">мин</span>
                        <input type="number" min="0" step="0.1" value={st.km ?? ""} onChange={e=>actions.updateWorkoutSet(session.id, entry.id, st.id, { km: e.target.value==="" ? null : Number(e.target.value) })}
                          className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 font-data" />
                        <span className="text-[11px] text-zinc-600">км</span>
                      </>
                    )}
                    <button onClick={() => actions.removeWorkoutSet(session.id, entry.id, st.id)} className="ml-auto text-zinc-700 hover:text-red-400 shrink-0"><X className="w-3 h-3"/></button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <button onClick={() => onAddExercise(session.id)} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"><Plus className="w-3 h-3"/>Упражнение</button>
      </div>

      <div className="mt-3 pt-3 border-t border-zinc-800 grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Длительность, мин</label>
          <input type="number" min="0" className={inputCls} value={session.minutes ?? ""} onChange={e=>actions.updateWorkoutSession(session.id, { minutes: e.target.value==="" ? null : Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>Тяжесть, 1–10</label>
          <input type="number" min="1" max="10" className={inputCls} value={session.rpe ?? ""} onChange={e=>actions.updateWorkoutSession(session.id, { rpe: e.target.value==="" ? null : clamp(Number(e.target.value),1,10) })} />
        </div>
      </div>
    </Card>
  );
}

export function ExerciseForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState((initial && initial.name) || "");
  const [kind, setKind] = useState((initial && initial.kind) || "strength");
  const [muscles, setMuscles] = useState((initial && initial.muscles) || []);
  const load = (initial && initial.defaultLoad) || {};
  const [sets, setSets] = useState(load.sets ?? 3);
  const [reps, setReps] = useState(load.reps ?? 10);
  const [weight, setWeight] = useState(load.weight ?? "");
  const [minutes, setMinutes] = useState(load.minutes ?? "");
  const [km, setKm] = useState(load.km ?? "");
  const [notes, setNotes] = useState((initial && initial.notes) || "");
  const strength = kind === "strength";
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название</label>
        <input className={inputCls} value={name} onChange={e=>setName(e.target.value)} placeholder="Например: Приседания со штангой" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Вид</label>
        <div className="grid grid-cols-3 gap-2">
          {EXERCISE_KIND_ORDER.map(k => (
            <button key={k} onClick={() => setKind(k)}
              className={`py-2 rounded-xl text-xs border transition ${kind===k ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "border-zinc-800 text-zinc-500"}`}>{EXERCISE_KINDS[k].label}</button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelCls}>Группы мышц</label>
        <div className="flex flex-wrap gap-1.5">
          {MUSCLE_GROUP_ORDER.map(g => {
            const on = muscles.includes(g);
            return (
              <button key={g} onClick={() => setMuscles(on ? muscles.filter(x=>x!==g) : [...muscles, g])}
                className={`px-2.5 py-1 rounded-full text-xs border transition ${on ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "border-zinc-800 text-zinc-600"}`}>{MUSCLE_GROUPS[g]}</button>
            );
          })}
        </div>
      </div>
      <div>
        <label className={labelCls}>Нагрузка по умолчанию</label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <input type="number" min="1" className={inputCls} value={sets} onChange={e=>setSets(e.target.value)} />
            <div className="text-[10px] text-zinc-600 mt-1">подходов</div>
          </div>
          {strength ? (
            <>
              <div>
                <input type="number" min="1" className={inputCls} value={reps} onChange={e=>setReps(e.target.value)} />
                <div className="text-[10px] text-zinc-600 mt-1">повторов</div>
              </div>
              <div>
                <input type="number" min="0" step="0.5" className={inputCls} value={weight} onChange={e=>setWeight(e.target.value)} />
                <div className="text-[10px] text-zinc-600 mt-1">кг</div>
              </div>
            </>
          ) : (
            <>
              <div>
                <input type="number" min="0" className={inputCls} value={minutes} onChange={e=>setMinutes(e.target.value)} />
                <div className="text-[10px] text-zinc-600 mt-1">минут</div>
              </div>
              <div>
                <input type="number" min="0" step="0.1" className={inputCls} value={km} onChange={e=>setKm(e.target.value)} />
                <div className="text-[10px] text-zinc-600 mt-1">км</div>
              </div>
            </>
          )}
        </div>
      </div>
      <div>
        <label className={labelCls}>Заметка</label>
        <input className={inputCls} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Техника, ощущения, на что смотреть" />
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button disabled={!name.trim()} onClick={() => onSubmit({
          name: name.trim(), kind, muscles, notes: notes.trim(),
          defaultLoad: strength
            ? { sets: Number(sets)||1, reps: Number(reps)||1, weight: weight==="" ? null : Number(weight) }
            : { sets: Number(sets)||1, minutes: minutes==="" ? null : Number(minutes), km: km==="" ? null : Number(km) },
        })}>{initial ? "Сохранить" : "Добавить"}</Button>
      </div>
    </div>
  );
}

export function WorkoutTemplateForm({ initial, exercises, onSubmit, onCancel }) {
  const [title, setTitle] = useState((initial && initial.title) || "");
  const [description, setDescription] = useState((initial && initial.description) || "");
  const [items, setItems] = useState(((initial && initial.items) || []).map(x => ({ ...x })));
  const [pick, setPick] = useState("");

  function addItem() {
    const ex = exercises.find(e => e.id===pick);
    if (!ex) return;
    const load = ex.defaultLoad || {};
    setItems(list => [...list, { id: uid(), exerciseId: ex.id, sets: load.sets ?? 3, reps: load.reps ?? null, weight: load.weight ?? null, minutes: load.minutes ?? null, km: load.km ?? null, restSec: 90 }]);
    setPick("");
  }
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название</label>
        <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: День A. Ноги и спина" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Описание</label>
        <input className={inputCls} value={description} onChange={e=>setDescription(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Упражнения</label>
        <div className="space-y-1.5 mb-2">
          {items.map((it, i) => {
            const ex = exercises.find(e => e.id===it.exerciseId);
            const strength = !ex || ex.kind==="strength";
            return (
              <div key={it.id} className="flex items-center gap-2 bg-zinc-950/60 border border-zinc-800 rounded-lg px-2 py-1.5 flex-wrap">
                <span className="text-xs text-zinc-200 flex-1 min-w-[120px] truncate">{ex ? ex.name : "Упражнение удалено"}</span>
                <input type="number" min="1" value={it.sets ?? ""} onChange={e=>setItems(l => l.map((x,j) => j===i ? { ...x, sets: Number(e.target.value)||1 } : x))}
                  className="w-14 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-data" />
                <span className="text-[10px] text-zinc-600">×</span>
                {strength ? (
                  <>
                    <input type="number" min="1" value={it.reps ?? ""} onChange={e=>setItems(l => l.map((x,j) => j===i ? { ...x, reps: e.target.value==="" ? null : Number(e.target.value) } : x))}
                      className="w-14 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-data" />
                    <span className="text-[10px] text-zinc-600">повт</span>
                    <input type="number" min="0" step="0.5" value={it.weight ?? ""} onChange={e=>setItems(l => l.map((x,j) => j===i ? { ...x, weight: e.target.value==="" ? null : Number(e.target.value) } : x))}
                      className="w-16 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-data" />
                    <span className="text-[10px] text-zinc-600">кг</span>
                  </>
                ) : (
                  <>
                    <input type="number" min="0" value={it.minutes ?? ""} onChange={e=>setItems(l => l.map((x,j) => j===i ? { ...x, minutes: e.target.value==="" ? null : Number(e.target.value) } : x))}
                      className="w-14 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-data" />
                    <span className="text-[10px] text-zinc-600">мин</span>
                  </>
                )}
                <button onClick={() => setItems(l => l.filter((_,j) => j!==i))} className="text-zinc-600 hover:text-red-400"><X className="w-3.5 h-3.5"/></button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <select className={inputCls} value={pick} onChange={e=>setPick(e.target.value)}>
            <option value="">Выберите упражнение…</option>
            {exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <Button variant="secondary" onClick={addItem} disabled={!pick}><Plus className="w-4 h-4"/></Button>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button disabled={!title.trim() || !items.length} onClick={() => onSubmit({ title: title.trim(), description: description.trim(), items })}>{initial ? "Сохранить" : "Создать"}</Button>
      </div>
    </div>
  );
}

// Составление плана: дни недели × шаблон тренировки × число недель. Ручной конструктор нарочно
// такой простой — план из повторяющейся недели покрывает почти все реальные случаи, а всё
// сложное приедет импортом от ИИ.
function TrainingPlanForm({ state, onSubmit, onCancel }) {
  const body = state.profile.body || defaultBody();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(todayStr());
  const [weeks, setWeeks] = useState(6);
  const [schedule, setSchedule] = useState(() =>
    (body.trainingDays||[]).map(d => ({ weekday:d, workoutId: (state.workouts[0]||{}).id || "" })));

  function toggleDay(weekday) {
    setSchedule(list => list.some(x => x.weekday===weekday)
      ? list.filter(x => x.weekday!==weekday)
      : [...list, { weekday, workoutId: (state.workouts[0]||{}).id || "" }].sort((a,b)=>a.weekday-b.weekday));
  }
  const ready = title.trim() && weeks > 0 && schedule.length > 0 && schedule.every(x => x.workoutId);
  const sessionCount = schedule.length * weeks;

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название плана</label>
        <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: Силовой блок" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Описание</label>
        <input className={inputCls} value={description} onChange={e=>setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Начало</label>
          <input type="date" className={inputCls} value={startDate} onChange={e=>setStartDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Недель</label>
          <input type="number" min="1" max="52" className={inputCls} value={weeks} onChange={e=>setWeeks(clamp(Number(e.target.value)||1,1,52))} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Дни недели</label>
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((l,i) => {
            const on = schedule.some(x => x.weekday===i+1);
            return (
              <button key={l} onClick={() => toggleDay(i+1)}
                className={`flex-1 py-1.5 rounded-lg text-[11px] border transition ${on ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "border-zinc-800 text-zinc-600"}`}>{l}</button>
            );
          })}
        </div>
      </div>
      {schedule.length > 0 && (
        <div className="space-y-1.5">
          {schedule.map((slot, i) => (
            <div key={slot.weekday} className="flex items-center gap-2">
              <span className="text-xs font-data text-zinc-500 w-8 shrink-0">{WEEKDAY_LABELS[slot.weekday-1]}</span>
              <select className={inputCls} value={slot.workoutId} onChange={e=>setSchedule(l => l.map((x,j) => j===i ? { ...x, workoutId:e.target.value } : x))}>
                <option value="">Выберите тренировку…</option>
                {state.workouts.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      {state.workouts.length === 0 && (
        <div className="text-xs text-amber-300/90">Сначала соберите хотя бы один шаблон тренировки во вкладке «Тренировки».</div>
      )}
      <div className="text-xs text-zinc-600">
        Получится {sessionCount} {pluralRu(sessionCount,"тренировка","тренировки","тренировок")} за {weeks} {pluralRu(weeks,"неделю","недели","недель")}.
        Награда за план считается по самой длинной серии подряд выполненных — за план без пропусков она в полтора раза больше.
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button disabled={!ready} onClick={() => onSubmit({ title:title.trim(), description:description.trim(), startDate, weeks, schedule })}>Создать план</Button>
      </div>
    </div>
  );
}

function SportGoalForm({ goal, onSubmit, onCancel }) {
  const [startDate, setStartDate] = useState(goal.startDate || todayStr());
  const [endDate, setEndDate] = useState(goal.endDate || addDaysToDateStr(todayStr(), 42));
  const [sessionsPerWeek, setSessions] = useState(goal.sessionsPerWeek || 3);
  const [minutesPerWeek, setMinutes] = useState(goal.minutesPerWeek || 180);
  const [focus, setFocus] = useState(goal.focus || "health");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Начало</label>
          <input type="date" className={inputCls} value={startDate} onChange={e=>setStartDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Окончание</label>
          <input type="date" className={inputCls} value={endDate} onChange={e=>setEndDate(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Тренировок в неделю</label>
          <input type="number" min="1" max="14" className={inputCls} value={sessionsPerWeek} onChange={e=>setSessions(Number(e.target.value)||1)} />
        </div>
        <div>
          <label className={labelCls}>Минут в неделю</label>
          <input type="number" min="0" step="10" className={inputCls} value={minutesPerWeek} onChange={e=>setMinutes(Number(e.target.value)||0)} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Чего добиваемся</label>
        <select className={inputCls} value={focus} onChange={e=>setFocus(e.target.value)}>
          {Object.entries(BODY_FOCUS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="text-xs text-zinc-600">
        Награда начисляется за выполнение плановых тренировок. Пока плана нет, цель считается неполной:
        измерять её нечем, и платить не за что.
      </div>
      <div className="flex items-center justify-between gap-2 pt-2">
        <button onClick={() => onSubmit({ startDate:null, endDate:null })} className="text-xs text-zinc-600 hover:text-red-400">Снять цель</button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel}>Отмена</Button>
          <Button disabled={!startDate || !endDate || endDate < startDate} onClick={() => onSubmit({ startDate, endDate, sessionsPerWeek, minutesPerWeek, focus })}>Сохранить</Button>
        </div>
      </div>
    </div>
  );
}

function TrainingPlanCard({ plan, state, actions, onOpenDate }) {
  const st = planStats(state.workoutLog, plan.id);
  const reward = planFinalReward(state.workoutLog, plan.id);
  const next = planSessionsOf(state.workoutLog, plan.id).find(w => w.status==="planned");
  const archived = plan.status === "archived";
  const done = plan.status === "done";
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${done ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
          <Rocket className="w-5 h-5"/>
        </div>
        <div className="flex-1 min-w-0" style={{ minHeight:40 }}>
          <div className="text-sm font-semibold text-zinc-100 break-words">{plan.title}</div>
          {plan.description && <div className="text-xs text-zinc-500 mt-0.5">{plan.description}</div>}
          <div className="text-xs text-zinc-600 font-data mt-1">
            {st.startDate && `${fmtDateShort(st.startDate)} → ${fmtDateShort(st.endDate)}`}
            {archived && " · в архиве"}
          </div>
        </div>
        <KebabMenu items={[
          { icon: archived ? ArchiveRestore : Archive, label: archived ? "Вернуть из архива" : "В архив", onClick: () => actions.archiveTrainingPlan(plan.id, !archived) },
          { divider: true },
          { icon: Trash2, label:"Удалить план", onClick: () => actions.deleteTrainingPlan(plan.id, false), danger:true },
          { icon: Trash2, label:"Удалить с тренировками", onClick: () => actions.deleteTrainingPlan(plan.id, true), danger:true },
        ]} />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs font-data text-zinc-500 mb-1">
          <span>{st.done}/{st.total} тренировок{st.skipped ? ` · ${st.skipped} пропущено` : ""}</span>
          <span className={st.perfect ? "text-emerald-400" : ""}>серия {st.maxStreak}</span>
        </div>
        <ProgressBar value={st.total ? st.done/st.total : 0} colorClass={done ? "bg-emerald-500" : "bg-amber-500"} />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="text-zinc-500 truncate">
          {next ? <>Дальше: <span className="text-zinc-300">{next.title}</span> · {fmtDateShort(next.date)}</> : "Все тренировки закрыты"}
        </span>
        <span className={`font-data shrink-0 flex items-center gap-1 ${plan.claimedFinal ? "text-emerald-400" : "text-amber-300"}`}>
          {plan.claimedFinal && <Check className="w-3 h-3"/>}
          <Sparkles className="w-3 h-3"/>{plan.claimedFinal ? plan.reward.grantedXp : reward.xp}
        </span>
      </div>
      {next && <button onClick={() => onOpenDate(next.date)} className="text-xs text-amber-400 hover:text-amber-300 mt-2">К этой тренировке →</button>}
    </Card>
  );
}

// Экран загрузки плана: разбор файла, затем правка перед применением. Ключевое здесь не
// «предпросмотр», а именно редактор — план от ИИ почти всегда хочется подвинуть по датам и
// что-то выкинуть ДО того, как он расползётся по журналу на шесть недель вперёд.
function WorkoutPlanImportModal({ open, onClose, state, onImport, onNotify }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setText(""); setDraft(null); setWarnings([]); setError(""); setCollapsed([]);
  }, [open]);

  function handleText(value) {
    setText(value);
    if (!value.trim()) { setDraft(null); setWarnings([]); setError(""); return; }
    const res = parseWorkoutPlanPayload(value, { exercises: state.exercises, today: todayStr() });
    if (res.ok) { setDraft(res.draft); setWarnings(res.warnings||[]); setError(""); }
    else { setDraft(null); setWarnings([]); setError(res.error); }
  }
  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleText(String(reader.result||""));
    reader.onerror = () => setError("Не удалось прочитать файл.");
    reader.readAsText(file);
  }
  function patchSession(weekId, sessionId, patch) {
    setDraft(d => ({ ...d, weeks: d.weeks.map(w => w.id!==weekId ? w : {
      ...w, sessions: w.sessions.map(sn => sn.id!==sessionId ? sn : { ...sn, ...patch }),
    })}));
  }
  function toggleWeek(weekId, on) {
    setDraft(d => ({ ...d, weeks: d.weeks.map(w => w.id!==weekId ? w : { ...w, sessions: w.sessions.map(sn => ({ ...sn, include:on })) }) }));
  }

  const summary = draft ? workoutPlanDraftSummary(draft) : null;

  function apply() {
    if (!draft || !summary.count) return;
    const built = buildWorkoutPlanImport(draft);
    onImport(built);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Загрузить план тренировок" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {!draft && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <input ref={fileRef} type="file" accept="application/json,.json,.txt" onChange={handleFile} className="hidden" />
              <Button variant="secondary" onClick={() => fileRef.current && fileRef.current.click()}><Upload className="w-3.5 h-3.5"/>Выбрать файл…</Button>
              <span className="text-xs text-zinc-600">или вставьте ответ ИИ ниже</span>
            </div>
            <textarea value={text} onChange={e=>handleText(e.target.value)} placeholder="Вставьте JSON плана…"
              className="w-full h-40 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-[11px] font-data text-zinc-300 lq-scroll" />
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-sm text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/><span>{error}</span>
              </div>
            )}
          </>
        )}

        {draft && (
          <>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Название плана</label>
                <input className={inputCls} value={draft.title} onChange={e=>setDraft(d => ({ ...d, title:e.target.value }))} />
              </div>
              <div className="flex items-end gap-3 flex-wrap p-3 rounded-xl border border-zinc-800 bg-zinc-950/40">
                <div>
                  <label className={labelCls}>Дата старта</label>
                  <input type="date" className={inputCls} value={draft.startDate} onChange={e=>{ if (e.target.value) setDraft(d => ({ ...d, startDate:e.target.value })); }} />
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer pb-2">
                  <input type="checkbox" checked={draft.skipWeekends} onChange={e=>setDraft(d => ({ ...d, skipWeekends:e.target.checked }))} />
                  Пропускать выходные
                </label>
                <div className="text-xs text-zinc-600 flex-1 min-w-[220px] pb-1.5">План двигается целиком: интервалы между тренировками сохраняются.</div>
              </div>
            </div>

            <div className="space-y-3 max-h-[44vh] overflow-y-auto pr-1 lq-scroll">
              {draft.weeks.map(w => {
                const isCollapsed = collapsed.includes(w.id);
                const allOn = w.sessions.every(sn => sn.include);
                return (
                  <div key={w.id} className="rounded-xl border border-zinc-800">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
                      <button onClick={() => toggleWeek(w.id, !allOn)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${allOn ? "bg-emerald-500 border-transparent" : "border-zinc-600"}`}>
                        {allOn && <Check className="w-3 h-3 text-zinc-950"/>}
                      </button>
                      <button onClick={() => setCollapsed(l => isCollapsed ? l.filter(x=>x!==w.id) : [...l, w.id])}
                        className="flex-1 text-left flex items-center gap-2 min-w-0">
                        <span className="text-sm text-zinc-200">Неделя {w.week}</span>
                        <span className="text-xs font-data text-zinc-600">{w.sessions.filter(sn=>sn.include).length}/{w.sessions.length}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-600 transition-transform" style={{ transform: isCollapsed ? "rotate(-90deg)" : "none" }}/>
                      </button>
                    </div>
                    {!isCollapsed && (
                      <div className="p-2 space-y-1.5">
                        {w.sessions.map(sn => {
                          const date = resolvePlanDate(draft.startDate, sn.unitOffset, draft.skipWeekends);
                          return (
                            <div key={sn.id} className={`rounded-lg border p-2 ${sn.include ? "border-zinc-800" : "border-zinc-900 opacity-50"}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <button onClick={() => patchSession(w.id, sn.id, { include: !sn.include })}
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${sn.include ? "bg-emerald-500 border-transparent" : "border-zinc-600"}`}>
                                  {sn.include && <Check className="w-3 h-3 text-zinc-950"/>}
                                </button>
                                <input className="flex-1 min-w-[120px] bg-transparent text-sm text-zinc-200 focus:outline-none"
                                  value={sn.title} onChange={e=>patchSession(w.id, sn.id, { title:e.target.value })} />
                                <input type="date" className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300 shrink-0"
                                  value={date||""} onChange={e=>e.target.value && patchSession(w.id, sn.id, { unitOffset: planUnitOffsetOf(draft.startDate, e.target.value, draft.skipWeekends) })} />
                              </div>
                              <div className="mt-1.5 pl-6 space-y-0.5">
                                {sn.items.map(it => (
                                  <div key={it.id} className="flex items-center gap-2 text-xs">
                                    <span className={`truncate flex-1 ${it.isNew ? "text-amber-300" : "text-zinc-400"}`}>
                                      {it.name}{it.isNew && " · новое"}
                                    </span>
                                    <span className="font-data text-zinc-600 shrink-0">
                                      {it.kind==="strength"
                                        ? `${it.sets}×${it.reps||"—"}${it.weight ? ` · ${it.weight} кг` : ""}`
                                        : `${it.sets}×${it.minutes||"—"} мин${it.km ? ` · ${it.km} км` : ""}`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/40 text-xs text-zinc-400">
              <div className="flex items-center gap-3 flex-wrap font-data">
                <span className="text-zinc-200">{summary.count} {pluralRu(summary.count,"тренировка","тренировки","тренировок")}</span>
                {summary.excluded > 0 && <span className="text-zinc-600">({summary.excluded} исключено)</span>}
                <span>{summary.weeks} {pluralRu(summary.weeks,"неделя","недели","недель")}</span>
                {summary.from && <span>{fmtDateShort(summary.from)} → {fmtDateShort(summary.to)}</span>}
                {summary.newExercises > 0 && <span className="text-amber-300">+{summary.newExercises} новых упражнений</span>}
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="p-3 rounded-xl border border-amber-500/25 bg-amber-500/5 text-xs text-amber-200/90 space-y-1">
                {warnings.map((wr,i) => <div key={i} className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5"/><span>{wr}</span></div>)}
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-2">
          {draft && <Button variant="ghost" onClick={() => { setDraft(null); setWarnings([]); }}>Назад к файлу</Button>}
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button disabled={!draft || !summary || !summary.count} onClick={apply}>
            Загрузить{summary && summary.count ? ` (${summary.count})` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AiWorkoutGuideModal({ open, onClose, state, onNotify }) {
  const text = useMemo(() => open ? buildAiWorkoutGuide(state) : "", [open, state]);
  return (
    <Modal open={open} onClose={onClose} title="Инструкция для ИИ" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="text-sm text-zinc-400">
          Отдайте этот текст любому ИИ вместе с задачей («составь план на шесть недель»). В инструкцию
          уже подставлены ваши упражнения, физические данные и цель — по ним план и строится.
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => {
            const ok = downloadTextFile(text, `questlife-workout-guide-${todayStr()}.md`, "text/markdown;charset=utf-8");
            onNotify && onNotify(ok ? "Инструкция скачана" : "Скачивание заблокировано — скопируйте текст ниже");
          }}><Download className="w-3.5 h-3.5"/>Скачать .md</Button>
          <Button variant="secondary" onClick={() => {
            copyTextToClipboard(text).then(ok => onNotify && onNotify(ok ? "Инструкция скопирована" : "Не удалось скопировать — выделите текст ниже"));
          }}><Copy className="w-3.5 h-3.5"/>Скопировать</Button>
        </div>
        <textarea readOnly value={text} className="w-full h-72 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-[11px] font-data text-zinc-300 lq-scroll" />
      </div>
    </Modal>
  );
}

export function SportView({ state, actions }) {
  const prefs = { view:"journal", ...((state.uiPrefs && state.uiPrefs.sport) || {}) };
  const view = prefs.view;
  const paramsCollapsed = !!prefs.paramsCollapsed;
  const setView = (v) => actions.updateSportPrefs({ view:v });

  const [date, setDate] = useState(todayStr());
  const [addOpen, setAddOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [exerciseModal, setExerciseModal] = useState(null);   // null | { initial }
  const [workoutModal, setWorkoutModal] = useState(null);     // null | { initial }
  const [entryPicker, setEntryPicker] = useState(null);       // id сессии, куда добавляем упражнение
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("all");

  const sessions = useMemo(() => workoutLogOnDate(state.workoutLog, date), [state.workoutLog, date]);
  const week = useMemo(() => workoutWeekStats(state.workoutLog, date), [state.workoutLog, date]);
  // Та же доля, по которой позже будет считаться награда по ярусам (см. ТЗ, 4.2): пока показываем
  // её просто как оценку дня, чтобы шкала была знакомой ещё до появления цели и плана.
  const dayFraction = useMemo(() => workoutDayFraction(state.workoutLog, date), [state.workoutLog, date]);
  const exercises = useMemo(() => {
    let list = state.exercises.filter(e => !e.archived);
    if (muscleFilter !== "all") list = list.filter(e => (e.muscles||[]).includes(muscleFilter));
    if (search.trim()) { const q = search.trim().toLowerCase(); list = list.filter(e => e.name.toLowerCase().includes(q)); }
    return list;
  }, [state.exercises, muscleFilter, search]);

  const VIEWS = [
    { id:"journal", label:"Дневник" },
    { id:"plan", label:"План" },
    { id:"body", label:"Тело" },
    { id:"exercises", label:`Упражнения${state.exercises.length ? ` (${state.exercises.length})` : ""}` },
    { id:"templates", label:"Тренировки" },
  ];

  function addLabel() {
    if (view === "exercises") return "Добавить упражнение";
    if (view === "templates") return "Новая тренировка";
    if (view === "plan") return "Новый план";
    return "Записать тренировку";
  }
  function onAdd() {
    if (view === "exercises") setExerciseModal({ initial:null });
    else if (view === "templates") setWorkoutModal({ initial:null });
    else if (view === "plan") setPlanOpen(true);
    else setAddOpen(true);
  }
  const goal = state.sportGoal || defaultSportGoal();
  const goalSet = isSportGoalSet(goal);
  const goalActive = isSportGoalActive(state);
  const plans = state.trainingPlans || [];
  const activePlans = plans.filter(pl => pl.status !== "archived");

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Тело и нагрузка" title="Спорт" action={<KebabMenu items={[
        { icon: Upload, label:"Загрузить план…", onClick: () => setImportOpen(true) },
        { icon: FileJson, label:"Инструкция для ИИ", onClick: () => setGuideOpen(true) },
      ]} />} />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`py-2.5 rounded-xl text-xs font-medium border transition ${view===v.id ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "border-zinc-800 text-zinc-500"}`}>{v.label}</button>
        ))}
      </div>

      {view === "journal" && (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => setDate(addDaysToDateStr(date,-1))} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400"><ChevronLeft className="w-4 h-4"/></button>
              <div className="text-center">
                <div className="text-sm text-zinc-200 font-medium">{fmtDateWithYear(date)}</div>
                {date !== todayStr() && <button onClick={() => setDate(todayStr())} className="text-xs text-amber-400 hover:text-amber-300">Сегодня</button>}
              </div>
              <button onClick={() => setDate(addDaysToDateStr(date,1))} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400"><ChevronRight className="w-4 h-4"/></button>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[
                { label:"Тренировок за неделю", value: week.sessions },
                { label:"Минут", value: week.minutes },
                { label:"Тоннаж, кг", value: Math.round(week.volume) },
              ].map(x => (
                <div key={x.label} className="rounded-xl border border-zinc-800 p-3 text-center">
                  <div className="font-data text-lg text-zinc-100">{x.value}</div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-600">{x.label}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-zinc-600 mt-2 text-center font-data">неделя {fmtDateShort(week.from)} — {fmtDateShort(week.to)}</div>
            {dayFraction != null && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-zinc-500">Выполнение дня</span>
                  {/* tierLabel для ярусов ниже второго возвращает null — у «почти ничего» нет
                      названия. Раньше здесь было обращение к .cls напрямую, и вкладка падала. */}
                  <span className={(tierLabel(tierFromFraction(dayFraction))||{}).cls || "text-zinc-500"}>
                    {(tierLabel(tierFromFraction(dayFraction))||{}).text || "Начато"} · {Math.round(dayFraction*100)}%
                  </span>
                </div>
                <ProgressBar value={dayFraction} colorClass="bg-emerald-500" heightClass="h-1.5" />
              </div>
            )}
          </Card>

          {sessions.length === 0 ? (
            <EmptyState icon={Dumbbell} title="В этот день тренировок нет"
              subtitle="Запишите тренировку по шаблону или свободную — состав можно собрать прямо в карточке."
              action={<Button size="sm" onClick={() => setAddOpen(true)}>Записать тренировку</Button>} />
          ) : (
            <div className="space-y-3">
              {sessions.map(s => (
                <WorkoutSessionCard key={s.id} session={s} state={state} actions={actions} onAddExercise={setEntryPicker} />
              ))}
            </div>
          )}
        </>
      )}

      {view === "plan" && (
        <>
          <TrainingParamsCard state={state} actions={actions}
            collapsed={paramsCollapsed} onToggle={() => actions.updateSportPrefs({ paramsCollapsed: !paramsCollapsed })} />

          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-200">Цель</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {goalSet
                    ? `${fmtDateShort(goal.startDate)} → ${fmtDateShort(goal.endDate)} · ${goal.sessionsPerWeek} ${pluralRu(goal.sessionsPerWeek,"тренировка","тренировки","тренировок")} и ${goal.minutesPerWeek} мин в неделю${goal.focus ? ` · ${BODY_FOCUS[goal.focus]}` : ""}`
                    : "Цель не поставлена."}
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setGoalOpen(true)}>{goalSet ? "Изменить" : "Поставить цель"}</Button>
            </div>
            {goalSet && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs font-data text-zinc-500 mb-1">
                  <span>На этой неделе</span>
                  <span>{week.sessions}/{goal.sessionsPerWeek} · {week.minutes}/{goal.minutesPerWeek} мин</span>
                </div>
                <ProgressBar value={goal.sessionsPerWeek ? week.sessions/goal.sessionsPerWeek : 0} colorClass="bg-emerald-500" heightClass="h-1.5" />
              </div>
            )}
            {/* Цель без плана — неполная: измерять её нечем, поэтому привычка не заводится и
                награда не идёт. Молча оставлять человека с «поставил цель, а ничего не происходит»
                нельзя, отсюда явная подсказка с двумя кнопками. */}
            {goalSet && !goalActive && (
              <div className="mt-3 flex items-start gap-2 text-xs text-amber-200/90 bg-amber-500/5 border border-amber-500/25 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5"/>
                <span>
                  Цель пока неполная — нет плана, а значит нечего засчитывать и не за что награждать.
                  <button onClick={() => setPlanOpen(true)} className="ml-1 underline hover:text-amber-100">Составить план</button>
                </span>
              </div>
            )}
          </Card>

          {plans.length === 0 ? (
            <EmptyState icon={Rocket} title="Плана тренировок нет"
              subtitle="План раскладывает тренировки по дням: дальше остаётся только отмечать подходы. Награда считается по самой длинной серии подряд выполненных."
              action={
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <Button size="sm" onClick={() => setPlanOpen(true)} disabled={!state.workouts.length}>Составить план</Button>
                  <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}><Upload className="w-3.5 h-3.5"/>Загрузить план</Button>
                  <Button size="sm" variant="ghost" onClick={() => setGuideOpen(true)}><FileJson className="w-3.5 h-3.5"/>Инструкция для ИИ</Button>
                </div>
              } />
          ) : (
            <div className="space-y-3">
              {[...activePlans, ...plans.filter(pl => pl.status==="archived")].map(pl => (
                <TrainingPlanCard key={pl.id} plan={pl} state={state} actions={actions}
                  onOpenDate={(d) => { setDate(d); setView("journal"); }} />
              ))}
            </div>
          )}
        </>
      )}

      {view === "body" && <BodyPanel state={state} actions={actions} />}

      {view === "exercises" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={muscleFilter} onChange={e=>setMuscleFilter(e.target.value)}>
              <option value="all">Все группы</option>
              {MUSCLE_GROUP_ORDER.map(g => <option key={g} value={g}>{MUSCLE_GROUPS[g]}</option>)}
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-600 absolute" style={{ left:10, top:"50%", transform:"translateY(-50%)" }} />
              <input className="bg-zinc-900 border border-zinc-800 rounded-lg pr-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600" style={{ width:180, paddingLeft:30 }} placeholder="Поиск..." value={search} onChange={e=>setSearch(e.target.value)} />
            </div>
          </div>
          {exercises.length === 0 ? (
            <EmptyState icon={Dumbbell} title="Упражнений нет" subtitle="Добавьте те, которые реально делаете — они появятся в шаблонах и в плане." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {exercises.map(ex => {
                const KindIcon = EXERCISE_KINDS[ex.kind].icon;
                const load = ex.defaultLoad || {};
                return (
                  <Card key={ex.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0"><KindIcon className="w-5 h-5"/></div>
                      <div className="flex-1 min-w-0" style={{ minHeight:40 }}>
                        <div className="text-sm font-semibold text-zinc-100 break-words">{ex.name}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {EXERCISE_KINDS[ex.kind].label}
                          {(ex.muscles||[]).length > 0 && ` · ${ex.muscles.map(m => MUSCLE_GROUPS[m]).filter(Boolean).join(", ")}`}
                        </div>
                        <div className="text-xs text-zinc-600 font-data mt-1">
                          {ex.kind==="strength"
                            ? `${load.sets||3}×${load.reps||10}${load.weight ? ` · ${load.weight} кг` : ""}`
                            : `${load.sets||1}×${load.minutes||10} мин${load.km ? ` · ${load.km} км` : ""}`}
                        </div>
                      </div>
                      <KebabMenu items={[
                        { icon: Pencil, label:"Редактировать", onClick: () => setExerciseModal({ initial:ex }) },
                        { icon: Trash2, label:"Удалить", onClick: () => actions.deleteExercise(ex.id), danger:true },
                      ]} />
                    </div>
                    {ex.notes && <div className="text-xs text-zinc-500 mt-2">{ex.notes}</div>}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {view === "templates" && (
        state.workouts.length === 0 ? (
          <EmptyState icon={ListPlus} title="Шаблонов тренировок нет"
            subtitle="Соберите набор упражнений один раз — дальше тренировка записывается в один клик." />
        ) : (
          <div className="space-y-3">
            {state.workouts.map(w => (
              <Card key={w.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0"><ListPlus className="w-5 h-5"/></div>
                  <div className="flex-1 min-w-0" style={{ minHeight:40 }}>
                    <div className="text-sm font-semibold text-zinc-100 break-words">{w.title}</div>
                    {w.description && <div className="text-xs text-zinc-500 mt-0.5">{w.description}</div>}
                    <div className="text-xs text-zinc-600 mt-1">
                      {(w.items||[]).map(it => (state.exercises.find(e=>e.id===it.exerciseId)||{}).name).filter(Boolean).join(" · ") || "Пусто"}
                    </div>
                  </div>
                  <KebabMenu items={[
                    { icon: Dumbbell, label:"Провести сегодня", onClick: () => { actions.addWorkoutSession({ date: todayStr(), workoutId: w.id }); setDate(todayStr()); setView("journal"); } },
                    { icon: Pencil, label:"Редактировать", onClick: () => setWorkoutModal({ initial:w }) },
                    { icon: Trash2, label:"Удалить", onClick: () => actions.deleteWorkout(w.id), danger:true },
                  ]} />
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Записать тренировку">
        <div className="space-y-3">
          <div className="text-sm text-zinc-400">Выберите шаблон или запишите свободную — состав можно собрать прямо в карточке.</div>
          {state.workouts.map(w => (
            <button key={w.id} onClick={() => { actions.addWorkoutSession({ date, workoutId: w.id }); setAddOpen(false); }}
              className="w-full text-left px-3 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700">
              <div className="text-sm text-zinc-100">{w.title}</div>
              <div className="text-xs text-zinc-600 truncate">{(w.items||[]).length} {pluralRu((w.items||[]).length,"упражнение","упражнения","упражнений")}</div>
            </button>
          ))}
          <Button variant="secondary" className="w-full" onClick={() => { actions.addWorkoutSession({ date, workoutId:null }); setAddOpen(false); }}>Свободная тренировка</Button>
        </div>
      </Modal>

      <Modal open={!!exerciseModal} onClose={() => setExerciseModal(null)} title={exerciseModal && exerciseModal.initial ? "Упражнение" : "Новое упражнение"}>
        {exerciseModal && (
          <ExerciseForm initial={exerciseModal.initial}
            onSubmit={(data) => { if (exerciseModal.initial) actions.updateExercise(exerciseModal.initial.id, data); else actions.addExercise(data); setExerciseModal(null); }}
            onCancel={() => setExerciseModal(null)} />
        )}
      </Modal>

      <Modal open={!!workoutModal} onClose={() => setWorkoutModal(null)} title={workoutModal && workoutModal.initial ? "Тренировка" : "Новая тренировка"} maxWidth="max-w-xl">
        {workoutModal && (
          <WorkoutTemplateForm initial={workoutModal.initial} exercises={state.exercises.filter(e=>!e.archived)}
            onSubmit={(data) => { if (workoutModal.initial) actions.updateWorkout(workoutModal.initial.id, data); else actions.addWorkout(data); setWorkoutModal(null); }}
            onCancel={() => setWorkoutModal(null)} />
        )}
      </Modal>

      <Modal open={planOpen} onClose={() => setPlanOpen(false)} title="Новый план" maxWidth="max-w-xl">
        <TrainingPlanForm state={state}
          onSubmit={(data) => {
            actions.addTrainingPlan(data, (plan, prev, newId) => buildPlanSessions(plan, data.schedule, data.weeks, data.startDate, prev.exercises, prev.workouts, newId));
            setPlanOpen(false);
          }}
          onCancel={() => setPlanOpen(false)} />
      </Modal>

      <WorkoutPlanImportModal open={importOpen} onClose={() => setImportOpen(false)} state={state}
        onImport={({ plan, sessions, newExercises }) => { actions.importTrainingPlan(plan, sessions, newExercises); setView("plan"); }}
        onNotify={(m) => actions.notify(m)} />
      <AiWorkoutGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} state={state} onNotify={(m) => actions.notify(m)} />

      <Modal open={goalOpen} onClose={() => setGoalOpen(false)} title="Цель по спорту">
        <SportGoalForm goal={goal} onSubmit={(patch) => { actions.setSportGoal(patch); setGoalOpen(false); }} onCancel={() => setGoalOpen(false)} />
      </Modal>

      <Modal open={!!entryPicker} onClose={() => setEntryPicker(null)} title="Добавить упражнение">
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1 lq-scroll">
          {state.exercises.filter(e=>!e.archived).map(ex => (
            <button key={ex.id} onClick={() => { actions.addWorkoutEntry(entryPicker, ex.id); setEntryPicker(null); }}
              className="w-full text-left px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700">
              <div className="text-sm text-zinc-100">{ex.name}</div>
              <div className="text-xs text-zinc-600">{EXERCISE_KINDS[ex.kind].label}</div>
            </button>
          ))}
        </div>
      </Modal>

      <StickyAddButton onClick={onAdd} label={addLabel()} />
    </div>
  );
}
