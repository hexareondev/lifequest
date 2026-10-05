// Интерфейс привычек, который нужен не только разделу «Привычки»: компактная строка для Хаба и календаря.

import { clamp, todayStr } from "../core/basics.js";
import { ProgressBar } from "../ui/atoms.jsx";
import { linkedHabitProgress, tierLabel } from "./model.js";

// Компактный вариант LinkedHabitCard для узкой карточки "Сегодня" в Хабе — мини-прогресс-бар +
// одна быстрая кнопка вместо полного набора действий.
export function LinkedHabitCompactRow({ habit, state, actions, navigate }) {
  const progress = linkedHabitProgress(habit, state);
  if (!progress) return null;
  const label = tierLabel(progress.tier);
  const barColor = progress.kind==="nutritionMacros" ? "bg-amber-500" : progress.kind==="nutritionWater" ? "bg-sky-500" : progress.kind==="sportPlan" ? "bg-emerald-500" : "bg-violet-500";
  return (
    <div className="w-full px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-950/40">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm text-zinc-200 flex-1 truncate">{habit.title}</span>
        {(progress.kind==="nutritionWater" || progress.kind==="reading" || progress.kind==="sportPlan") && (
          <span className="text-xs text-zinc-500 font-data shrink-0">{progress.actual}/{progress.target} {progress.unit}</span>
        )}
        {label && <span className={`text-[11px] font-data shrink-0 ${label.cls}`}>{label.text}</span>}
      </div>
      <ProgressBar value={clamp(progress.fraction,0,1)} colorClass={barColor} heightClass="h-1.5" />
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {progress.kind==="nutritionWater" && (
          <button onClick={() => actions.logWater(250, todayStr())} className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-sky-300 hover:bg-zinc-700 transition">+250 мл</button>
        )}
        {progress.kind==="reading" && (
          <button onClick={() => actions.updateLibraryItem("book", progress.book.id, { pagesRead:(progress.book.pagesRead||0)+1 })} className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-violet-300 hover:bg-zinc-700 transition">+1 стр</button>
        )}
        <button onClick={() => {
          if (progress.kind==="reading") return navigate("library", { kind:"book", id:progress.book.id });
          if (progress.kind==="sportPlan") return navigate("sport");
          return navigate("nutrition");
        }} className="text-[11px] text-amber-400 hover:text-amber-300 ml-auto">Открыть →</button>
      </div>
    </div>
  );
}
