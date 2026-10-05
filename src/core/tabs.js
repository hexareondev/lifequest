// Вкладки приложения: полный список, сохранённый порядок и видимость. Хаб всегда первый и
// всегда виден — иначе было бы некуда вернуться.

import {
  Award, BookOpen, Calendar, CheckSquare, Compass, Dumbbell, FileText, Gem, LayoutGrid, ScrollText,
  Shield, Shuffle, Users, Utensils, Wallet,
} from "lucide-react";

export const TABS = [
  { id:"hub",          label:"Хаб",         icon:LayoutGrid },
  { id:"profile",      label:"Профиль",     icon:Shield },
  { id:"calendar",     label:"Календарь",   icon:Calendar },
  { id:"quests",       label:"Квесты",      icon:ScrollText },
  { id:"habits",       label:"Привычки",    icon:CheckSquare },
  { id:"spheres",      label:"Сферы",       icon:Compass },
  { id:"people",       label:"Люди",        icon:Users },
  { id:"library",      label:"Библиотека",  icon:BookOpen },
  { id:"notes",        label:"Заметки",     icon:FileText },
  { id:"misc",         label:"Разное",      icon:Shuffle },
  { id:"nutrition",    label:"Питание",     icon:Utensils },
  { id:"sport",        label:"Спорт",       icon:Dumbbell },
  { id:"finance",      label:"Финансы",     icon:Wallet },
  { id:"rewards",      label:"Награды",     icon:Gem },
  { id:"achievements", label:"Достижения",  icon:Award },
];
// Хаб всегда первый и всегда виден (иначе некуда возвращаться) — не участвует в перестановке
// и скрытии. Остальные вкладки — порядок и видимость настраиваются в Настройки → Меню и
// хранятся в state.uiPrefs.tabs. Самовосстанавливается, если появилась новая вкладка,
// которой нет в сохранённом порядке (дописывает её в конец), — старые сохранения не ломает.
export function fullTabOrder(state) {
  const tabsPref = (state.uiPrefs && state.uiPrefs.tabs) || {};
  const order = Array.isArray(tabsPref.order) && tabsPref.order.length ? tabsPref.order : TABS.map(t=>t.id);
  const known = new Set(order);
  return [...order, ...TABS.map(t=>t.id).filter(id => !known.has(id))];
}
export function visibleTabsOf(state) {
  const hidden = new Set((state.uiPrefs && state.uiPrefs.tabs && state.uiPrefs.tabs.hidden) || []);
  return fullTabOrder(state)
    .filter(id => id==="hub" || !hidden.has(id))
    .map(id => TABS.find(t=>t.id===id))
    .filter(Boolean);
}
