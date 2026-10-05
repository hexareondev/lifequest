// Интерфейс раздела «Разное»: колесо выбора и подсказка, что приготовить.

import { useEffect, useRef, useState } from "react";
import {
  BookOpen, Check, ChevronDown, ChevronRight, Plus, Search, Shuffle, Utensils, X,
} from "lucide-react";
import {
  LIBRARY_KINDS, LIBRARY_KIND_ORDER, LIBRARY_STATUS_ORDER, libraryStatusLabel,
} from "../library/constants.js";
import { Button, Card, Modal, SectionHeader } from "../ui/atoms.jsx";
import {
  cookableDishes, defaultMiscPrefs, pickWheelIndex, wheelLibraryOptions, wheelOptionsFrom,
  wheelTargetRotation,
} from "./model.js";

const WHEEL_COLORS = ["#f59e0b", "#8b5cf6", "#10b981", "#0ea5e9", "#f43f5e", "#eab308", "#14b8a6", "#a855f7"];

function WheelDisc({ options, rotation, spinning }) {
  const n = options.length;
  const R = 140;
  const step = 360 / Math.max(1, n);
  const fontSize = n > 14 ? 8 : n > 9 ? 9 : n > 5 ? 11 : 12;
  // Подпись идёт ВДОЛЬ РАДИУСА от края к центру, а не поперёк сектора: поперёк её длина упирается
  // в ширину дуги и на десятке вариантов места не остаётся вовсе. Вдоль радиуса предел один и
  // тот же при любом числе секторов, поэтому и обрезка считается от него.
  // Подпись живёт между внешним краем и центральным кругом. Запас считается явно из его радиуса,
  // а не подобранным числом, и множитель ширины символа взят с запасом: кириллица шире латиницы,
  // и на узком множителе хвост залезал под круг.
  const HUB = 14, EDGE = 12, GAP = 8;
  const maxChars = Math.max(5, Math.floor((R - HUB - EDGE - GAP) / (fontSize * 0.62)));
  const cut = (t) => (t.length > maxChars ? t.slice(0, maxChars - 1) + "…" : t);
  function arc(i) {
    const a0 = (i * step - 90) * Math.PI / 180;
    const a1 = ((i + 1) * step - 90) * Math.PI / 180;
    const x0 = R + R * Math.cos(a0), y0 = R + R * Math.sin(a0);
    const x1 = R + R * Math.cos(a1), y1 = R + R * Math.sin(a1);
    return `M ${R} ${R} L ${x0} ${y0} A ${R} ${R} 0 ${step > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
  }
  return (
    <div className="relative mx-auto" style={{ width: R * 2, maxWidth: "100%" }}>
      {/* Стрелка неподвижна и указывает в верхнюю точку круга — вращается диск. */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-1 z-10 text-amber-400">
        <ChevronDown className="w-7 h-7 drop-shadow" />
      </div>
      <svg viewBox={`0 0 ${R * 2} ${R * 2}`} className="w-full block">
        {/* Поворачивается группа внутри, а не сам <svg>. У повёрнутого квадратного элемента углы
            вылезают за его габариты и наезжают на соседей — так колесо и перекрывало кнопку. */}
        <g style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "center",
          transformBox: "fill-box",
          transition: spinning ? "transform 3.6s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
        }}>
          {n === 0 && <circle cx={R} cy={R} r={R - 1} fill="#18181b" stroke="#3f3f46" />}
          {n === 1 && <circle cx={R} cy={R} r={R - 1} fill={WHEEL_COLORS[0]} fillOpacity="0.85" />}
          {options.map((o, i) => (
            <g key={o.id}>
              {n > 1 && <path d={arc(i)} fill={WHEEL_COLORS[i % WHEEL_COLORS.length]} fillOpacity="0.85" stroke="#18181b" strokeWidth="1.5" />}
              <g transform={`rotate(${i * step + step / 2 - 90} ${R} ${R})`}>
                <text x={R + R - EDGE} y={R} textAnchor="end" dominantBaseline="middle"
                  fontSize={fontSize} fill="#18181b" fontWeight="600">{cut(o.label)}</text>
              </g>
            </g>
          ))}
          <circle cx={R} cy={R} r="14" fill="#09090b" stroke="#3f3f46" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

// Окно выбора устроено как в выгрузке: категории сворачиваются, отметить можно и отдельную
// запись, и категорию целиком. Плоский список на несколько сотен записей библиотеки бесполезен.
function WheelPickerModal({ open, onClose, state, prefs, actions }) {
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState([]);
  useEffect(() => { if (open) setQ(""); }, [open]);
  const picked = prefs.wheelPicked || [];
  const statuses = prefs.wheelStatuses || [];
  const needle = q.trim().toLowerCase();

  const groups = LIBRARY_KIND_ORDER.map(k => ({
    id: k,
    label: LIBRARY_KINDS[k].label,
    items: wheelLibraryOptions(state, [k], statuses).filter(o => !needle || o.label.toLowerCase().includes(needle)),
  })).filter(g => g.items.length > 0);

  function toggleOne(id) {
    actions.updateMiscPrefs({ wheelPicked: picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id] });
  }
  function toggleGroup(g) {
    const ids = g.items.map(o => o.id);
    const allOn = ids.every(id => picked.includes(id));
    actions.updateMiscPrefs({ wheelPicked: allOn ? picked.filter(x => !ids.includes(x)) : [...picked, ...ids.filter(x => !picked.includes(x))] });
  }
  const chip = (on) => `text-xs px-2.5 py-1 rounded-lg border transition ${on ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500 hover:text-zinc-300"}`;
  const box = (on) => `w-4 h-4 rounded border shrink-0 flex items-center justify-center ${on ? "bg-amber-500 border-amber-500" : "border-zinc-700"}`;

  return (
    <Modal open={open} onClose={onClose} title="Что берём в колесо" maxWidth="max-w-md">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {LIBRARY_STATUS_ORDER.map(st => (
            <button key={st} className={chip(statuses.includes(st))}
              onClick={() => actions.updateMiscPrefs({ wheelStatuses: statuses.includes(st) ? statuses.filter(x => x !== st) : [...statuses, st] })}>
              {libraryStatusLabel("movie", st)}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по библиотеке"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600" />
        </div>
        <div className="max-h-[46vh] overflow-y-auto lq-scroll space-y-1">
          {groups.length === 0 && <div className="text-sm text-zinc-600 py-4 text-center">Ничего не найдено.</div>}
          {groups.map(g => {
            const ids = g.items.map(o => o.id);
            const allOn = ids.every(id => picked.includes(id));
            const someOn = !allOn && ids.some(id => picked.includes(id));
            // Во время поиска свёрнутость игнорируется: прятать найденное — не то, чего ждут.
            const isOpen = needle ? true : !collapsed.includes(g.id);
            return (
              <div key={g.id}>
                <div className="flex items-center gap-2 px-1 py-1">
                  <button onClick={() => toggleGroup(g)} className={box(allOn)}>
                    {allOn && <Check className="w-3 h-3 text-zinc-950" />}
                    {someOn && <span className="w-2 h-0.5 bg-amber-500 rounded" />}
                  </button>
                  <button onClick={() => setCollapsed(l => l.includes(g.id) ? l.filter(x => x !== g.id) : [...l, g.id])}
                    className="flex-1 flex items-center gap-1.5 text-left text-zinc-400 hover:text-zinc-200">
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />}
                    <span className="text-[11px] uppercase tracking-wide flex-1">{g.label}</span>
                    <span className="text-[10px] font-data text-zinc-600">{ids.filter(id => picked.includes(id)).length}/{ids.length}</span>
                  </button>
                </div>
                {isOpen && (
                  <div className="space-y-0.5 pl-6">
                    {g.items.map(o => {
                      const on = picked.includes(o.id);
                      return (
                        <button key={o.id} onClick={() => toggleOne(o.id)}
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition text-left ${on ? "bg-amber-500/10" : "hover:bg-zinc-800"}`}>
                          <span className={box(on)}>{on && <Check className="w-3 h-3 text-zinc-950" />}</span>
                          <span className={`text-sm truncate flex-1 ${on ? "text-zinc-100" : "text-zinc-300"}`}>{o.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => actions.updateMiscPrefs({ wheelPicked: [] })}>Снять всё</Button>
          <Button onClick={onClose}>Готово</Button>
        </div>
      </div>
    </Modal>
  );
}

// Редактор списка вариантов. Раньше здесь была одна textarea: в неё удобно вставить готовый
// список и неудобно всё остальное — поправить одну строку, убрать один вариант, не задев соседние.
function WheelOptionsEditor({ options, onChange }) {
  const [draft, setDraft] = useState("");
  function add() {
    // Многострочная вставка разбирается сама: списки чаще приносят целиком, чем набирают руками.
    const parts = draft.split("\n").map(x => x.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...options, ...parts]);
    setDraft("");
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          onPaste={e => {
            const t = e.clipboardData.getData("text");
            if (!t.includes("\n")) return;
            e.preventDefault();
            onChange([...options, ...t.split("\n").map(x => x.trim()).filter(Boolean)]);
          }}
          placeholder="Вариант и Enter"
          className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600" />
        <Button variant="secondary" onClick={add} disabled={!draft.trim()}><Plus className="w-4 h-4" /></Button>
      </div>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o, i) => (
            <span key={`${o}-${i}`} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
              <span className="max-w-[140px] truncate">{o}</span>
              <button onClick={() => onChange(options.filter((_, j) => j !== i))}
                className="text-zinc-600 hover:text-rose-400"><X className="w-3 h-3" /></button>
            </span>
          ))}
          <button onClick={() => onChange([])} className="text-xs px-2 py-1 text-zinc-600 hover:text-zinc-300">очистить</button>
        </div>
      )}
    </div>
  );
}

function WheelTool({ state, actions, navigate }) {
  const prefs = { ...defaultMiscPrefs(), ...((state.uiPrefs && state.uiPrefs.misc) || {}) };
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  // Выбывшие живут в состоянии экрана, а не в настройках: это ход партии, а не предпочтение.
  // Ушёл с вкладки — партия закончилась, и возвращаться к её середине никто не ждёт.
  const [out, setOut] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const knockout = !!prefs.wheelKnockout;
  const all = wheelOptionsFrom(state, prefs);
  const options = knockout ? all.filter(o => !out.includes(o.id)) : all;
  // Партия закончена, только если кто-то ДЕЙСТВИТЕЛЬНО выбыл. Без этой проверки единственный
  // вариант на колесе сам себя объявлял победителем, а «Начать заново» ничего не меняло —
  // выбывших и так не было, и окно уже не закрывалось.
  const finished = knockout && out.length > 0 && options.length === 1;

  // Состав колеса изменился — партия начинается заново. Одна проверка на все способы это сделать:
  // правку своих вариантов, отметки в окне выбора, смену фильтра статусов. Вешать сброс на каждый
  // обработчик по отдельности значило бы однажды забыть его в новом месте — так и вышло с окном
  // выбора, после которого в списке выбывших оставались чужие id.
  const allKey = all.map(o => o.id).join("|");
  useEffect(() => { resetRound(); }, [allKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function spin() {
    if (spinning || options.length < 2) return;
    const index = pickWheelIndex(options.length);
    const picked = options[index];
    setResult(null);
    setSpinning(true);
    setRotation(r => wheelTargetRotation(r, index, options.length, 4));
    // Результат показываем после остановки: узнать ответ раньше, чем колесо докрутится, —
    // значит обесценить сам жест.
    timerRef.current = setTimeout(() => {
      setSpinning(false);
      setResult(picked);
      if (knockout) setOut(l => [...l, picked.id]);
    }, 3700);
  }
  // Отложенный показ результата надо СНИМАТЬ, а не просто игнорировать: иначе сброс посреди
  // вращения отработает, а через секунду сработает таймер прошлого броска и допишет в выбывшие
  // вариант, которого человек уже не ждёт.
  function cancelSpin() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setSpinning(false);
  }
  function resetRound() { cancelSpin(); setOut([]); setResult(null); }

  return (
    <Card className="p-5 space-y-4">
      <WheelOptionsEditor options={prefs.wheelOptions || []}
        onChange={(list) => actions.updateMiscPrefs({ wheelOptions: list })} />

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
          <BookOpen className="w-3.5 h-3.5 mr-1" />Из библиотеки
        </Button>
        <span className="text-xs text-zinc-500">отмечено: {(prefs.wheelPicked || []).length}</span>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
        <input type="checkbox" checked={knockout} disabled={spinning} className="accent-amber-500"
          onChange={() => { actions.updateMiscPrefs({ wheelKnockout: !knockout }); resetRound(); }} />
        На выбывание — выпавший вариант уходит с колеса
      </label>

      <WheelDisc options={options} rotation={rotation} spinning={spinning} />

      <div className="text-center space-y-2">
        {knockout && all.length > 1 && (
          <div className="text-xs text-zinc-500">Осталось {options.length} из {all.length}</div>
        )}
        {options.length < 2 && !finished && (
          <div className="text-xs text-zinc-600">Нужно хотя бы два варианта.</div>
        )}
        <Button onClick={spin} disabled={spinning || options.length < 2 || finished}>
          <Shuffle className="w-4 h-4 mr-1" />{spinning ? "Крутится…" : "Крутить"}
        </Button>
        {result && !spinning && !finished && (
          <div className="pt-1">
            <div className="text-xs text-zinc-500">{knockout ? "Выбывает" : "Выпало"}</div>
            <div className="text-lg font-semibold text-amber-300">{result.label}</div>
            {result.item && !knockout && (
              <Button variant="ghost" size="sm" onClick={() => navigate("library", { kind: result.libKind, id: result.item.id })}>
                Открыть карточку
              </Button>
            )}
          </div>
        )}
        {knockout && out.length > 0 && !finished && !spinning && (
          <button onClick={resetRound} className="text-xs text-zinc-600 hover:text-zinc-300">вернуть выбывших</button>
        )}
      </div>

      <WheelPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} state={state} prefs={prefs} actions={actions} />

      {/* Итог партии показывается окном, а не строкой под колесом: победитель — это конец, и его
          стоит объявить, а не дописать мелким текстом к тому же экрану. */}
      <Modal open={finished && !spinning} onClose={resetRound} title="Победитель" maxWidth="max-w-sm">
        <div className="space-y-4 text-center">
          <div className="text-3xl">🏆</div>
          <div className="text-xl font-semibold text-amber-300 break-words">{finished ? options[0].label : ""}</div>
          {finished && options[0].item && (
            <Button variant="ghost" size="sm" onClick={() => navigate("library", { kind: options[0].libKind, id: options[0].item.id })}>
              Открыть карточку
            </Button>
          )}
          <div className="flex justify-center gap-2">
            <Button variant="ghost" onClick={() => setOut(l => l.slice(0, -1))}>Вернуть последнего</Button>
            <Button onClick={resetRound}>Начать заново</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function CookTool({ state, actions, navigate }) {
  const prefs = { ...defaultMiscPrefs(), ...((state.uiPrefs && state.uiPrefs.misc) || {}) };
  const [pick, setPick] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const have = prefs.pantry || [];
  const { ready, almost } = cookableDishes(state.dishes, have);
  const foodName = (id) => { const f = (state.foods || []).find(x => x.id === id); return f ? f.name : "продукт"; };

  function roll() {
    if (!ready.length) return;
    setPick(ready[pickWheelIndex(ready.length)]);
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-200">Что приготовить</div>
          <div className="text-xs text-zinc-500">Отмечено продуктов: {have.length}</div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>Что есть дома</Button>
      </div>

      {have.length === 0 ? (
        <div className="text-sm text-zinc-600">Отметь продукты, которые есть под рукой — покажу, что из них выходит.</div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button onClick={roll} disabled={!ready.length}>
              <Shuffle className="w-4 h-4 mr-1" />Случайное блюдо
            </Button>
            <span className="text-xs text-zinc-500">готовых вариантов: {ready.length}</span>
          </div>

          {pick && (
            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-center gap-3">
              <span className="text-2xl">{pick.emoji || "🍲"}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-zinc-100 truncate">{pick.name}</div>
                <div className="text-[11px] text-zinc-500 truncate">
                  {(pick.ingredients || []).map(i => foodName(i.foodId)).join(", ")}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("nutrition")}>В питание</Button>
            </div>
          )}

          {almost.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-zinc-600">Почти хватает</div>
              {almost.slice(0, 5).map(({ dish, missing }) => (
                <div key={dish.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-800">
                  <span className="text-lg shrink-0">{dish.emoji || "🍲"}</span>
                  <span className="text-sm text-zinc-300 truncate flex-1">{dish.name}</span>
                  <span className="text-[11px] text-zinc-500 shrink-0 truncate">
                    нужен{missing.length > 1 ? "ы" : ""} {missing.map(foodName).join(", ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <PantryModal open={pickerOpen} onClose={() => setPickerOpen(false)} state={state} have={have}
        onToggle={(id) => actions.updateMiscPrefs({ pantry: have.includes(id) ? have.filter(x => x !== id) : [...have, id] })}
        onClear={() => actions.updateMiscPrefs({ pantry: [] })} />
    </Card>
  );
}

function PantryModal({ open, onClose, state, have, onToggle, onClear }) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const needle = q.trim().toLowerCase();
  const foods = (state.foods || []).filter(f => !needle || String(f.name || "").toLowerCase().includes(needle));
  return (
    <Modal open={open} onClose={onClose} title="Что есть дома" maxWidth="max-w-md">
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по продуктам"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto lq-scroll space-y-0.5">
          {foods.length === 0 && <div className="text-sm text-zinc-600 py-4 text-center">Ничего не найдено.</div>}
          {foods.map(f => {
            const on = have.includes(f.id);
            return (
              <button key={f.id} onClick={() => onToggle(f.id)}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition text-left ${on ? "bg-amber-500/10" : "hover:bg-zinc-800"}`}>
                <span className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${on ? "bg-amber-500 border-amber-500" : "border-zinc-700"}`}>
                  {on && <Check className="w-3 h-3 text-zinc-950" />}
                </span>
                <span className="text-base shrink-0">{f.emoji || "🥕"}</span>
                <span className={`text-sm truncate flex-1 ${on ? "text-zinc-100" : "text-zinc-300"}`}>{f.name}</span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={onClear}>Снять всё</Button>
          <Button onClick={onClose}>Готово</Button>
        </div>
      </div>
    </Modal>
  );
}

const MISC_TOOLS = [
  { id: "wheel", label: "Колесо", icon: Shuffle },
  { id: "cook", label: "Что приготовить", icon: Utensils },
];

export function MiscView({ state, actions, navigate }) {
  const prefs = { ...defaultMiscPrefs(), ...((state.uiPrefs && state.uiPrefs.misc) || {}) };
  const tool = MISC_TOOLS.some(t => t.id === prefs.tool) ? prefs.tool : "wheel";
  return (
    <div className="space-y-4">
      <SectionHeader eyebrow="Инструменты" title="Разное" />
      <div className="grid grid-cols-2 gap-2">
        {MISC_TOOLS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => actions.updateMiscPrefs({ tool: t.id })}
              className={`py-2.5 rounded-xl text-sm font-medium border transition flex items-center justify-center gap-2 ${tool===t.id ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>
              <Icon className="w-4 h-4 shrink-0" /><span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>
      {/* Инструмент пересоздаётся при переключении: у колеса есть ход партии, и возвращаться
          к его середине после ухода на другой инструмент никто не ждёт. */}
      {tool === "wheel"
        ? <WheelTool key="wheel" state={state} actions={actions} navigate={navigate} />
        : <CookTool key="cook" state={state} actions={actions} navigate={navigate} />}
    </div>
  );
}
