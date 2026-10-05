// Уровни и опыт: во что превращается накопленный XP. Кривая одна и та же для сферы, человека и
// общего уровня — поэтому она здесь, а не в разделах, которые её показывают.

function xpForLevel(level) { return Math.round(80 + level*40); }
export function levelFromXp(totalXp) {
  let level = 1;
  let remaining = Math.max(0, Math.round(totalXp||0));
  let needed = xpForLevel(level);
  while (remaining >= needed) { remaining -= needed; level += 1; needed = xpForLevel(level); }
  return { level, xpIntoLevel: remaining, xpForNext: needed, ratio: needed ? remaining/needed : 0 };
}
export function overallOf(state) { return levelFromXp(state.spheres.reduce((a,s)=>a+s.xp,0)); }
export function continuousLevel(sphere) {
  const lvl = levelFromXp(sphere.xp);
  return (lvl.level - 1) + (lvl.xpForNext ? lvl.xpIntoLevel/lvl.xpForNext : 0);
}
