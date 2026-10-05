// Переключатель месяца ‹ 2026-10 ›: нужен и финансам, и календарю.

import { pad2 } from "../core/basics.js";
import { monthLabel } from "../core/format.js";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function MonthNav({ month, onChange }) {
  function shift(delta) {
    const [y,m] = month.split("-").map(Number);
    const d = new Date(y, m-1+delta, 1);
    onChange(`${d.getFullYear()}-${pad2(d.getMonth()+1)}`);
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => shift(-1)} className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"><ChevronLeft className="w-4 h-4"/></button>
      <div className="font-data text-sm text-zinc-200" style={{ minWidth:100, textAlign:"center" }}>{monthLabel(month)}</div>
      <button onClick={() => shift(1)} className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"><ChevronRight className="w-4 h-4"/></button>
    </div>
  );
}
