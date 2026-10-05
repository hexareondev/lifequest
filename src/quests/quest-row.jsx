// Строка квеста: один и тот же ряд на Хабе, в журнале, в карточке человека и в календаре.

import { Sparkles, Users } from "lucide-react";
import { todayStr } from "../core/basics.js";
import { DIFFICULTY } from "../core/rules.js";
import { Button, Pips } from "../ui/atoms.jsx";
import { pal } from "../ui/theme.js";
import { questPersonIds } from "./links.js";
import { questDateLabel } from "./spans.js";

export function QuestRow({ quest, sphere, onComplete, onClick }) {
  const d = DIFFICULTY[quest.difficulty] || DIFFICULTY.easy;
  const c = pal(sphere && sphere.color);
  const overdue = quest.deadline && quest.deadline < todayStr() && quest.status==="active";
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 transition ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
      <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-200 font-medium truncate">{quest.title}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-xs ${c.text}`}>{sphere ? sphere.name : "Без сферы"}</span>
          {questPersonIds(quest).length > 0 && quest.personName && <span className="text-xs text-rose-300 flex items-center gap-1"><Users className="w-3 h-3"/>{quest.personName}</span>}
          <Pips count={d.pips} />
          {quest.deadline && <span className={`text-xs font-data ${overdue ? "text-red-400" : "text-zinc-500"}`}>{questDateLabel(quest)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs font-data text-amber-300 shrink-0"><Sparkles className="w-3.5 h-3.5"/>{quest.rewardXp}</div>
      {onComplete && <Button size="sm" variant="secondary" onClick={(e)=>{ e.stopPropagation(); onComplete(); }}>Готово</Button>}
    </div>
  );
}
