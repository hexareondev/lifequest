// Палитра: одно место, где цвет-ключ («amber», «sky») превращается в классы Tailwind и hex.
// Разделы хранят в состоянии только ключ, поэтому смена оттенка правится здесь, а не по всему
// приложению.

export const PALETTE = {
  amber:   { text:"text-amber-400",   bgSolid:"bg-amber-500",   bgSoft:"bg-amber-500/15",   border:"border-amber-500/30",   hex:"#f59e0b" },
  yellow:  { text:"text-yellow-400",  bgSolid:"bg-yellow-500",  bgSoft:"bg-yellow-500/15",  border:"border-yellow-500/30",  hex:"#eab308" },
  lime:    { text:"text-lime-400",    bgSolid:"bg-lime-500",    bgSoft:"bg-lime-500/15",    border:"border-lime-500/30",    hex:"#84cc16" },
  green:   { text:"text-green-400",   bgSolid:"bg-green-500",   bgSoft:"bg-green-500/15",   border:"border-green-500/30",   hex:"#22c55e" },
  emerald: { text:"text-emerald-400", bgSolid:"bg-emerald-500", bgSoft:"bg-emerald-500/15", border:"border-emerald-500/30", hex:"#10b981" },
  teal:    { text:"text-teal-400",    bgSolid:"bg-teal-500",    bgSoft:"bg-teal-500/15",    border:"border-teal-500/30",    hex:"#14b8a6" },
  cyan:    { text:"text-cyan-400",    bgSolid:"bg-cyan-500",    bgSoft:"bg-cyan-500/15",    border:"border-cyan-500/30",    hex:"#06b6d4" },
  sky:     { text:"text-sky-400",     bgSolid:"bg-sky-500",     bgSoft:"bg-sky-500/15",     border:"border-sky-500/30",     hex:"#0ea5e9" },
  blue:    { text:"text-blue-400",    bgSolid:"bg-blue-500",    bgSoft:"bg-blue-500/15",    border:"border-blue-500/30",    hex:"#3b82f6" },
  indigo:  { text:"text-indigo-400",  bgSolid:"bg-indigo-500",  bgSoft:"bg-indigo-500/15",  border:"border-indigo-500/30",  hex:"#6366f1" },
  violet:  { text:"text-violet-400",  bgSolid:"bg-violet-500",  bgSoft:"bg-violet-500/15",  border:"border-violet-500/30",  hex:"#8b5cf6" },
  purple:  { text:"text-purple-400",  bgSolid:"bg-purple-500",  bgSoft:"bg-purple-500/15",  border:"border-purple-500/30",  hex:"#a855f7" },
  fuchsia: { text:"text-fuchsia-400", bgSolid:"bg-fuchsia-500", bgSoft:"bg-fuchsia-500/15", border:"border-fuchsia-500/30", hex:"#d946ef" },
  pink:    { text:"text-pink-400",    bgSolid:"bg-pink-500",    bgSoft:"bg-pink-500/15",    border:"border-pink-500/30",    hex:"#ec4899" },
  rose:    { text:"text-rose-400",    bgSolid:"bg-rose-500",    bgSoft:"bg-rose-500/15",    border:"border-rose-500/30",    hex:"#f43f5e" },
  red:     { text:"text-red-400",     bgSolid:"bg-red-500",     bgSoft:"bg-red-500/15",     border:"border-red-500/30",     hex:"#ef4444" },
  orange:  { text:"text-orange-400",  bgSolid:"bg-orange-500",  bgSoft:"bg-orange-500/15",  border:"border-orange-500/30",  hex:"#f97316" },
  zinc:    { text:"text-zinc-400",    bgSolid:"bg-zinc-500",    bgSoft:"bg-zinc-500/15",    border:"border-zinc-500/30",    hex:"#71717a" },
};
export const PALETTE_KEYS = ["amber","yellow","lime","green","emerald","teal","cyan","sky","blue","indigo","violet","purple","fuchsia","pink","rose","red","orange"];
export function pal(color) { return PALETTE[color] || PALETTE.amber; }
