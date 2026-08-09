import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  LayoutGrid, ScrollText, CheckSquare, Compass, Wallet, Gem, Settings,
  Plus, X, Trash2, Pencil, Flame, Trophy, Coins, ChevronLeft, ChevronRight,
  ChevronDown, Sparkles, Shield, Heart, Brain, Users, Home, Palette,
  BookOpen, Briefcase, TrendingUp, TrendingDown, Filter, Search, Check,
  Menu, Calendar, Star, Target, PiggyBank, ArrowUpRight, ArrowDownRight,
  AlertCircle, Info, Gift, ShoppingBag, Award, Loader2, DollarSign, Lock,
  Repeat, ListPlus, GripVertical, ChevronUp,
} from "lucide-react";

/* ============================== CONSTANTS ============================== */

const STORAGE_KEY = "lifequest_state_v1";

const PALETTE = {
  amber:   { text:"text-amber-400",   bgSolid:"bg-amber-500",   bgSoft:"bg-amber-500/15",   border:"border-amber-500/30",   hex:"#f59e0b" },
  emerald: { text:"text-emerald-400", bgSolid:"bg-emerald-500", bgSoft:"bg-emerald-500/15", border:"border-emerald-500/30", hex:"#10b981" },
  indigo:  { text:"text-indigo-400",  bgSolid:"bg-indigo-500",  bgSoft:"bg-indigo-500/15",  border:"border-indigo-500/30",  hex:"#6366f1" },
  violet:  { text:"text-violet-400",  bgSolid:"bg-violet-500",  bgSoft:"bg-violet-500/15",  border:"border-violet-500/30",  hex:"#8b5cf6" },
  rose:    { text:"text-rose-400",    bgSolid:"bg-rose-500",    bgSoft:"bg-rose-500/15",    border:"border-rose-500/30",    hex:"#f43f5e" },
  orange:  { text:"text-orange-400",  bgSolid:"bg-orange-500",  bgSoft:"bg-orange-500/15",  border:"border-orange-500/30",  hex:"#f97316" },
  cyan:    { text:"text-cyan-400",    bgSolid:"bg-cyan-500",    bgSoft:"bg-cyan-500/15",    border:"border-cyan-500/30",    hex:"#06b6d4" },
  sky:     { text:"text-sky-400",     bgSolid:"bg-sky-500",     bgSoft:"bg-sky-500/15",     border:"border-sky-500/30",     hex:"#0ea5e9" },
  red:     { text:"text-red-400",     bgSolid:"bg-red-500",     bgSoft:"bg-red-500/15",     border:"border-red-500/30",     hex:"#ef4444" },
  fuchsia: { text:"text-fuchsia-400", bgSolid:"bg-fuchsia-500", bgSoft:"bg-fuchsia-500/15", border:"border-fuchsia-500/30", hex:"#d946ef" },
  zinc:    { text:"text-zinc-400",    bgSolid:"bg-zinc-500",    bgSoft:"bg-zinc-500/15",    border:"border-zinc-500/30",    hex:"#71717a" },
};
const PALETTE_KEYS = ["emerald","amber","indigo","violet","rose","orange","cyan","sky","fuchsia","red"];
function pal(color) { return PALETTE[color] || PALETTE.amber; }

const ICONS = { Heart, Coins, Briefcase, BookOpen, Users, Home, Palette, Brain, Compass, Star, Target, Shield, Sparkles, PiggyBank, Award, Gift, Wallet, Gem, Trophy };
const ICON_KEYS = Object.keys(ICONS);
function IconFor(name) { return ICONS[name] || Star; }

const DIFFICULTY = {
  easy:   { label:"Лёгкий",    xp:15,  gold:5,  pips:1 },
  medium: { label:"Средний",   xp:35,  gold:15, pips:2 },
  hard:   { label:"Сложный",   xp:70,  gold:30, pips:3 },
  epic:   { label:"Эпический", xp:150, gold:75, pips:4 },
};
const PRIORITY = {
  low:      { label:"Низкий",      color:"zinc"   },
  medium:   { label:"Средний",     color:"sky"    },
  high:     { label:"Высокий",     color:"orange" },
  critical: { label:"Критический", color:"red"    },
};

const TABS = [
  { id:"hub",          label:"Хаб",         icon:LayoutGrid },
  { id:"quests",       label:"Квесты",      icon:ScrollText },
  { id:"habits",       label:"Привычки",    icon:CheckSquare },
  { id:"spheres",      label:"Сферы",       icon:Compass },
  { id:"finance",      label:"Финансы",     icon:Wallet },
  { id:"rewards",      label:"Награды",     icon:Gem },
  { id:"achievements", label:"Достижения",  icon:Award },
];

const ACH_KINDS = {
  level:       { label:"Уровень персонажа",        unit:"уровня" },
  sphereLevel: { label:"Уровень сферы",             unit:"уровня" },
  quests:      { label:"Квестов выполнено",         unit:"квестов" },
  streak:      { label:"Серия дней подряд",         unit:"дней" },
  currency:    { label:"Накоплено золота",          unit:"золота" },
  savings:     { label:"Отложено в сбережения",     unit:"₽" },
  allSpheres:  { label:"Все сферы достигли уровня", unit:"уровня (минимум по всем)" },
};


/* ================================ HELPERS ================================ */

function uid() { return Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
function pad2(n) { return String(n).padStart(2,"0"); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayStr() { return toDateStr(new Date()); }
function addDaysStr(n) { const d = new Date(); d.setDate(d.getDate()+n); return toDateStr(d); }
function clamp(v,min,max) { return Math.max(min, Math.min(max,v)); }

function xpForLevel(level) { return Math.round(80 + level*40); }
function levelFromXp(totalXp) {
  let level = 1;
  let remaining = Math.max(0, Math.round(totalXp||0));
  let needed = xpForLevel(level);
  while (remaining >= needed) { remaining -= needed; level += 1; needed = xpForLevel(level); }
  return { level, xpIntoLevel: remaining, xpForNext: needed, ratio: needed ? remaining/needed : 0 };
}
function overallOf(state) { return levelFromXp(state.spheres.reduce((a,s)=>a+s.xp,0)); }
function continuousLevel(sphere) {
  const lvl = levelFromXp(sphere.xp);
  return (lvl.level - 1) + (lvl.xpForNext ? lvl.xpIntoLevel/lvl.xpForNext : 0);
}
function totalSavingsOf(state) {
  return (state.transactions||[]).filter(t => t.type==="savings").reduce((a,t) => a + (t.direction==="withdraw" ? -t.amount : t.amount), 0);
}
function savingsSourceOf(t) { return t.source || "manual"; }
// Начальный капитал — задним числом внесённые деньги, которые не были заработаны в отслеживаемый период:
// не считается ни доходом, ни движением по бюджету текущего месяца.
// Проценты по вкладу — реальная прибыль, которая тут же уходит в сбережения: считается и доходом, и движением по бюджету
// (эти два эффекта взаимно гасят друг друга в балансе месяца, что математически равно "доход + перевод в сбережения").
function savingsMovesBalance(t) { return t.type==="savings" && savingsSourceOf(t) !== "opening"; }
function savingsCountsAsIncome(t) { return t.type==="savings" && t.direction==="deposit" && savingsSourceOf(t)==="interest"; }
const SAVINGS_SOURCES = {
  manual:   { label:"Из бюджета" },
  opening:  { label:"Начальный капитал" },
  interest: { label:"Проценты по вкладу" },
};

// Долги — деньги, которые дали в долг другим людям (и когда-нибудь должны вернуть).
// "Новый долг" и "Мне вернули" — реальные события бюджета текущего месяца.
// "Долг с начала учёта" — долг, который уже существовал до начала учёта: не трогает бюджет
// месяца, но входит в общую сумму "мне должны" — тот же принцип, что с начальным капиталом сбережений.
function debtSourceOf(t) { return t.source || "manual"; }
function debtMovesBalance(t) { return t.type==="debt" && debtSourceOf(t) !== "opening"; }
function totalDebtOf(state) {
  return (state.transactions||[]).filter(t => t.type==="debt").reduce((a,t) => a + (t.direction==="repay" ? -t.amount : t.amount), 0);
}
function balanceAsOf(transactions, beforeDateExclusive) {
  return (transactions||[]).filter(t => t.date < beforeDateExclusive).reduce((a,t) => a + balanceEffectOf(t), 0);
}
function debtsByPerson(state) {
  const map = {};
  (state.transactions||[]).filter(t => t.type==="debt").forEach(t => {
    const key = (t.person||"").trim() || "Без имени";
    map[key] = (map[key]||0) + (t.direction==="repay" ? -t.amount : t.amount);
  });
  return Object.entries(map).map(([person, amount]) => ({ person, amount })).sort((a,b) => b.amount-a.amount);
}
const DEBT_SOURCES = {
  manual:  { label:"Новый долг" },
  opening: { label:"Долг с начала учёта" },
};

// Единый источник истины для "как эта операция влияет на располагаемый баланс" — используется и
// графиком баланса (сортировка внутри одного дня), и историей операций (знак +/−/ничего).
// >0 — пополняет баланс, <0 — расходует, 0 — не трогает баланс вовсе (задним числом добавленные
// начальный капитал/долг, а также проценты — доход и перевод в сбережения гасят друг друга).
function balanceEffectOf(t) {
  if (t.type==="income") return t.amount;
  if (t.type==="expense") return -t.amount;
  if (t.type==="savings") {
    let e = 0;
    if (savingsCountsAsIncome(t)) e += t.amount;
    if (savingsMovesBalance(t)) e += (t.direction==="withdraw" ? t.amount : -t.amount);
    return e;
  }
  if (t.type==="debt") {
    if (!debtMovesBalance(t)) return 0;
    return t.direction==="repay" ? t.amount : -t.amount;
  }
  return 0;
}
function achievementProgress(ach, state) {
  const target = ach.target || 1;
  let current = 0;
  let unlocked = false;
  if (ach.kind === "level") {
    current = overallOf(state).level; unlocked = current >= target;
  } else if (ach.kind === "sphereLevel") {
    const sphere = state.spheres.find(s => s.id===ach.sphereId);
    current = sphere ? levelFromXp(sphere.xp).level : 0; unlocked = current >= target;
  } else if (ach.kind === "quests") {
    current = state.quests.filter(q => q.status==="done").length; unlocked = current >= target;
  } else if (ach.kind === "streak") {
    current = state.habits.reduce((m,h) => Math.max(m, computeStreak(h.logs||[])), 0); unlocked = current >= target;
  } else if (ach.kind === "currency") {
    current = state.profile.currency; unlocked = current >= target;
  } else if (ach.kind === "savings") {
    current = totalSavingsOf(state); unlocked = current >= target;
  } else if (ach.kind === "allSpheres") {
    current = state.spheres.length ? Math.min(...state.spheres.map(s => levelFromXp(s.xp).level)) : 0;
    unlocked = state.spheres.length>0 && current >= target;
  }
  return { current, target, unlocked };
}

function computeStreak(logDates) {
  const set = new Set(logDates||[]);
  let streak = 0;
  let d = new Date();
  if (!set.has(toDateStr(d))) d.setDate(d.getDate()-1);
  while (set.has(toDateStr(d))) { streak++; d.setDate(d.getDate()-1); }
  return streak;
}

function fmtMoney(n) {
  const s = Math.round(Math.abs(n||0)).toLocaleString("ru-RU");
  return (n<0?"-":"") + s + " ₽";
}
const MONTHS_SHORT = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
const MONTHS_CAP = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
function fmtDateShort(dateStr) {
  if (!dateStr) return "";
  const [y,m,d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m-1]}`;
}
function monthKey(dateStr) { return dateStr.slice(0,7); }
function monthLabel(key) {
  const [y,m] = key.split("-").map(Number);
  return `${MONTHS_CAP[m-1]} ${String(y).slice(2)}`;
}
function sortByUrgency(a,b) {
  const pr = { critical:0, high:1, medium:2, low:3 };
  const pa = pr[a.priority] ?? 2, pb = pr[b.priority] ?? 2;
  if (pa!==pb) return pa-pb;
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
  if (a.deadline) return -1;
  if (b.deadline) return 1;
  return 0;
}
function categoryMeta(categories, type, name) {
  const list = (categories && (type==="income" ? categories.income : categories.expense)) || [];
  return list.find(c => c.name===name) || list.find(c => c.name==="Другое") || { name:"Другое", color:"zinc" };
}
// "Другое" всегда физически последний элемент списка категорий — эта функция поддерживает
// инвариант при любой мутации (добавление/перестановка/нормализация старых сохранений).
function withOtherLast(list) {
  const other = list.find(c => c.name==="Другое");
  if (!other) return list;
  return [...list.filter(c => c.name!=="Другое"), other];
}
function normalizeCategoryList(list) {
  let out;
  if (!Array.isArray(list) || list.length===0) out = [];
  else out = list.map((c,i) => (typeof c === "string") ? { name:c, color:PALETTE_KEYS[i % PALETTE_KEYS.length] } : { name:c.name, color:c.color || PALETTE_KEYS[i % PALETTE_KEYS.length] });
  if (!out.some(c => c.name==="Другое")) out.push({ name:"Другое", color:"zinc" });
  return withOtherLast(out);
}
function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  return {
    profile: { ...base.profile, ...raw.profile },
    uiPrefs: { collapsed: (raw.uiPrefs && raw.uiPrefs.collapsed && typeof raw.uiPrefs.collapsed==="object") ? raw.uiPrefs.collapsed : {} },
    spheres: Array.isArray(raw.spheres) && raw.spheres.length ? raw.spheres : base.spheres,
    quests: Array.isArray(raw.quests) ? raw.quests : base.quests,
    habits: Array.isArray(raw.habits) ? raw.habits : base.habits,
    transactions: Array.isArray(raw.transactions) ? raw.transactions : base.transactions,
    budgets: raw.budgets && typeof raw.budgets==="object" ? raw.budgets : base.budgets,
    rewards: Array.isArray(raw.rewards) ? raw.rewards : base.rewards,
    achievements: Array.isArray(raw.achievements) && raw.achievements.length ? raw.achievements : defaultAchievements(),
    categories: {
      expense: normalizeCategoryList(raw.categories && raw.categories.expense),
      income: normalizeCategoryList(raw.categories && raw.categories.income),
    },
  };
}

/* ============================== SEED DATA ============================== */

function defaultState() {
  return {
    profile: { name: "Путник", currency: 165 },
    uiPrefs: { collapsed: {} },
    spheres: [
      { id:"health",     name:"Здоровье",   icon:"Heart",     color:"emerald", xp:210 },
      { id:"finance",    name:"Финансы",    icon:"Coins",     color:"amber",   xp:95  },
      { id:"career",     name:"Карьера",    icon:"Briefcase", color:"indigo",  xp:320 },
      { id:"knowledge",  name:"Обучение",   icon:"BookOpen",  color:"violet",  xp:150 },
      { id:"social",     name:"Отношения",  icon:"Users",     color:"rose",    xp:70  },
      { id:"home",       name:"Быт",        icon:"Home",      color:"orange",  xp:55  },
      { id:"creativity", name:"Творчество", icon:"Palette",   color:"cyan",    xp:25  },
      { id:"mind",       name:"Дисциплина", icon:"Brain",     color:"sky",     xp:130 },
    ],
    quests: [
      { id:uid(), title:"Собрать команду для нового проекта", description:"Найти и утвердить состав команды под запуск продукта.", sphereId:"career", priority:"high", difficulty:"hard", rewardXp:70, rewardGold:30, status:"active", deadline:addDaysStr(3), subtasks:[
        { id:uid(), text:"Составить список кандидатов", done:true },
        { id:uid(), text:"Провести собеседования", done:false },
        { id:uid(), text:"Сделать оффер финалисту", done:false },
      ], createdAt:addDaysStr(-2) },
      { id:uid(), title:"Прочитать книгу по инвестициям", description:"", sphereId:"knowledge", priority:"low", difficulty:"easy", rewardXp:15, rewardGold:5, status:"active", deadline:addDaysStr(10), subtasks:[], createdAt:addDaysStr(-5) },
      { id:uid(), title:"Организовать день рождения друга", description:"Забронировать место, придумать программу, купить подарок.", sphereId:"social", priority:"critical", difficulty:"epic", rewardXp:150, rewardGold:75, status:"active", deadline:addDaysStr(1), subtasks:[
        { id:uid(), text:"Забронировать кафе", done:true },
        { id:uid(), text:"Купить подарок", done:false },
      ], createdAt:addDaysStr(-3) },
      { id:uid(), title:"Пробежать 5 км", description:"", sphereId:"health", priority:"medium", difficulty:"medium", rewardXp:35, rewardGold:15, status:"done", deadline:addDaysStr(-1), subtasks:[], createdAt:addDaysStr(-4), completedAt:addDaysStr(-1) },
      { id:uid(), title:"Убраться в гараже", description:"", sphereId:"home", priority:"low", difficulty:"medium", rewardXp:35, rewardGold:15, status:"failed", deadline:addDaysStr(-4), subtasks:[], createdAt:addDaysStr(-9) },
    ],
    habits: [
      { id:"h1", title:"Пить 2 литра воды", sphereId:"health", logs:[addDaysStr(0),addDaysStr(-1),addDaysStr(-2),addDaysStr(-3),addDaysStr(-4)] },
      { id:"h2", title:"30 минут спорта", sphereId:"health", logs:[addDaysStr(0),addDaysStr(-1),addDaysStr(-3),addDaysStr(-4),addDaysStr(-7)] },
      { id:"h3", title:"Читать 20 страниц", sphereId:"knowledge", logs:[addDaysStr(-1),addDaysStr(-2),addDaysStr(-5)] },
      { id:"h4", title:"Планировать день", sphereId:"mind", logs:[addDaysStr(0),addDaysStr(-1),addDaysStr(-2),addDaysStr(-3),addDaysStr(-4),addDaysStr(-5),addDaysStr(-6)] },
    ],
    transactions: [
      { id:uid(), type:"income",  amount:120000, category:"Зарплата",    date:addDaysStr(-2),  description:"Зарплата за месяц" },
      { id:uid(), type:"expense", amount:32000,  category:"Жильё",       date:addDaysStr(-2),  description:"Аренда квартиры" },
      { id:uid(), type:"expense", amount:8400,   category:"Еда",         date:addDaysStr(-4),  description:"Продукты на неделю" },
      { id:uid(), type:"expense", amount:2200,   category:"Транспорт",   date:addDaysStr(-6),  description:"Проездной" },
      { id:uid(), type:"income",  amount:18000,  category:"Фриланс",     date:addDaysStr(-9),  description:"Проект для клиента" },
      { id:uid(), type:"expense", amount:5600,   category:"Развлечения", date:addDaysStr(-10), description:"Кино и ужин" },
      { id:uid(), type:"expense", amount:1200,   category:"Подписки",    date:addDaysStr(-15), description:"Стриминг-сервисы" },
      { id:uid(), type:"income",  amount:120000, category:"Зарплата",    date:addDaysStr(-33), description:"Зарплата за месяц" },
      { id:uid(), type:"expense", amount:29500,  category:"Жильё",       date:addDaysStr(-33), description:"Аренда квартиры" },
      { id:uid(), type:"expense", amount:9700,   category:"Еда",         date:addDaysStr(-36), description:"Продукты" },
      { id:uid(), type:"expense", amount:14300,  category:"Одежда",      date:addDaysStr(-40), description:"Новая куртка" },
      { id:uid(), type:"income",  amount:120000, category:"Зарплата",    date:addDaysStr(-63), description:"Зарплата за месяц" },
      { id:uid(), type:"expense", amount:31000,  category:"Жильё",       date:addDaysStr(-63), description:"Аренда квартиры" },
      { id:uid(), type:"expense", amount:7100,   category:"Еда",         date:addDaysStr(-58), description:"Продукты" },
      { id:uid(), type:"savings", direction:"deposit", amount:15000, category:"Сбережения", date:addDaysStr(-2),  description:"Отложил с зарплаты" },
      { id:uid(), type:"savings", direction:"deposit", amount:10000, category:"Сбережения", date:addDaysStr(-33), description:"Отложил с зарплаты" },
    ],
    budgets: { "Еда":28000, "Транспорт":6000, "Развлечения":9000, "Подписки":3000, "Жильё":33000 },
    rewards: [
      { id:uid(), title:"Вечер кино дома", cost:30,  repeatable:true,  purchases:[addDaysStr(-6)] },
      { id:uid(), title:"Новая игра",      cost:120, repeatable:false, purchases:[] },
      { id:uid(), title:"Поход в спа",     cost:280, repeatable:false, purchases:[] },
    ],
    achievements: defaultAchievements(),
    categories: {
      expense: [
        { name:"Еда",         color:"emerald" },
        { name:"Транспорт",   color:"sky" },
        { name:"Жильё",       color:"indigo" },
        { name:"Развлечения", color:"violet" },
        { name:"Подписки",    color:"fuchsia" },
        { name:"Здоровье",    color:"rose" },
        { name:"Одежда",      color:"orange" },
        { name:"Другое",      color:"zinc" },
      ],
      income: [
        { name:"Зарплата",    color:"amber" },
        { name:"Фриланс",     color:"cyan" },
        { name:"Подарки",     color:"rose" },
        { name:"Инвестиции",  color:"emerald" },
        { name:"Другое",      color:"zinc" },
      ],
    },
  };
}

function defaultAchievements() {
  return [
    { id:uid(), title:"Опытный искатель",     desc:"Достигни 5 уровня персонажа",     icon:"Trophy",    kind:"level",       target:5,    sphereId:null, unlockedAt:null },
    { id:uid(), title:"Мастер жизни",          desc:"Достигни 10 уровня персонажа",    icon:"Award",     kind:"level",       target:10,   sphereId:null, unlockedAt:null },
    { id:uid(), title:"Охотник за квестами",   desc:"Заверши 10 квестов",              icon:"Target",    kind:"quests",      target:10,   sphereId:null, unlockedAt:null },
    { id:uid(), title:"Неделя дисциплины",     desc:"Держи серию 7 дней подряд",       icon:"Sparkles",  kind:"streak",      target:7,    sphereId:null, unlockedAt:null },
    { id:uid(), title:"Копилка",               desc:"Накопи 500 золота",               icon:"Coins",     kind:"currency",    target:500,  sphereId:null, unlockedAt:null },
    { id:uid(), title:"Первые сбережения",     desc:"Отложи 20 000 ₽ в сбережения",    icon:"PiggyBank", kind:"savings",     target:20000, sphereId:null, unlockedAt:null },
    { id:uid(), title:"Гармония",              desc:"Все сферы достигли 3 уровня",     icon:"Compass",   kind:"allSpheres",  target:3,    sphereId:null, unlockedAt:null },
  ];
}

// Состояние для честного сброса ("Сбросить все данные"): структурные примеры (сферы, привычки,
// награды, категории, бюджеты, достижения) остаются, чтобы новый пользователь видел, как ими
// пользоваться, но весь НАКОПЛЕННЫЙ прогресс — опыт, стрики, покупки, золото, квесты, история
// операций — обнулён. defaultState() с его богатыми тестовыми данными используется только при
// самом первом запуске (когда в хранилище вообще ничего нет), но не при ручном сбросе.
function cleanState() {
  const seed = defaultState();
  return {
    profile: { name: seed.profile.name, currency: 0 },
    spheres: seed.spheres.map(s => ({ ...s, xp: 0 })),
    quests: [],
    habits: seed.habits.map(h => ({ id: h.id, title: h.title, sphereId: h.sphereId, logs: [], claimedDates: [] })),
    transactions: [],
    budgets: seed.budgets,
    rewards: seed.rewards.map(r => ({ ...r, purchases: [] })),
    achievements: defaultAchievements(),
    categories: seed.categories,
  };
}

/* ============================ SHARED UI ATOMS ============================ */

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      .font-display { font-family: 'Cinzel', ui-serif, serif; }
      .font-body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
      .font-data { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      .lq-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
      .lq-scroll::-webkit-scrollbar-track { background: transparent; }
      .lq-scroll::-webkit-scrollbar-thumb { background: rgba(161,161,170,0.25); border-radius: 8px; }
      .lq-scroll::-webkit-scrollbar-thumb:hover { background: rgba(161,161,170,0.4); }
      @keyframes lq-toast-in { from { opacity:0; transform: translateY(10px) scale(0.96);} to {opacity:1; transform:translateY(0) scale(1);} }
      @keyframes lq-pop { 0% { opacity:0; transform: scale(0.85);} 60% { opacity:1; transform: scale(1.03);} 100% { opacity:1; transform: scale(1);} }
      @keyframes lq-pulse-soft { 0%,100% { opacity:0.55; } 50% { opacity:0.9; } }
      .lq-toast { animation: lq-toast-in 0.25s ease-out; }
      .lq-pop { animation: lq-pop 0.35s cubic-bezier(.2,.9,.3,1.2); }
      .lq-pulse { animation: lq-pulse-soft 2.6s ease-in-out infinite; }
      input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }
    `}</style>
  );
}

const inputCls = "w-full bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition";
const labelCls = "text-xs text-zinc-500 uppercase tracking-wide font-data mb-1.5 block";

function Card({ children, className="", ...rest }) {
  return <div className={`bg-zinc-900/70 border border-zinc-800 rounded-2xl ${className}`} {...rest}>{children}</div>;
}

function ProgressBar({ value, colorClass="bg-amber-500", trackClass="bg-zinc-800", heightClass="h-2" }) {
  const v = clamp(value,0,1)*100;
  return (
    <div className={`w-full ${trackClass} rounded-full overflow-hidden ${heightClass}`}>
      <div className={`${colorClass} h-full rounded-full transition-all duration-500 ease-out`} style={{ width: `${v}%` }} />
    </div>
  );
}

function Pips({ count, total=4, colorClass="bg-amber-400" }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({length: total}).map((_,i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < count ? colorClass : "bg-zinc-700"}`} />
      ))}
    </span>
  );
}

// Постраничная навигация для списков с лимитом (10/20/50 и т.п.) — стрелки листают группами по `limit`.
function Pager({ page, limit, total, onChange }) {
  if (limit===Infinity || total<=limit) return null;
  const totalPages = Math.max(1, Math.ceil(total/limit));
  const from = total===0 ? 0 : (page-1)*limit + 1;
  const to = Math.min(total, page*limit);
  return (
    <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
      <div className="text-xs text-zinc-600">Показано {from}–{to} из {total}</div>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(1, page-1))} disabled={page<=1} className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition"><ChevronLeft className="w-4 h-4"/></button>
        <span className="text-xs font-data text-zinc-500" style={{ minWidth:64, textAlign:"center" }}>Стр. {page} из {totalPages}</span>
        <button onClick={() => onChange(Math.min(totalPages, page+1))} disabled={page>=totalPages} className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition"><ChevronRight className="w-4 h-4"/></button>
      </div>
    </div>
  );
}

function EmptyState({ icon:Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 border border-dashed border-zinc-800 rounded-2xl">
      {Icon && <Icon className="w-9 h-9 text-zinc-600 mb-3" strokeWidth={1.5} />}
      <div className="text-zinc-300 font-medium mb-1">{title}</div>
      {subtitle && <div className="text-zinc-500 text-sm max-w-sm mb-4">{subtitle}</div>}
      {action}
    </div>
  );
}

// Сворачиваемая карточка — для длинных страниц вроде "Финансы", где не всё нужно держать развёрнутым.
function CollapsibleCard({ id, title, headerExtra, defaultOpen=true, collapsedMap, onToggle, children }) {
  const hasPref = collapsedMap && Object.prototype.hasOwnProperty.call(collapsedMap, id);
  const open = hasPref ? !collapsedMap[id] : defaultOpen;
  return (
    <Card className="p-5">
      <button onClick={() => onToggle(id, open)} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        <span className="flex items-center gap-3 shrink-0">
          {headerExtra}
          <ChevronDown className="w-4 h-4 text-zinc-500 transition-transform duration-200" style={{ transform: open ? "none" : "rotate(-90deg)" }} />
        </span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </Card>
  );
}

function Button({ children, variant="primary", size="md", className="", ...rest }) {
  const sizes = { sm:"px-3 py-1.5 text-xs gap-1.5", md:"px-4 py-2.5 text-sm gap-2", lg:"px-5 py-3 text-sm gap-2" };
  const variants = {
    primary:   "bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold shadow-lg shadow-amber-500/20",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700",
    ghost:     "hover:bg-zinc-800/70 text-zinc-300",
    danger:    "bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30",
  };
  return (
    <button className={`inline-flex items-center justify-center rounded-xl transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

function Modal({ open, onClose, title, children, maxWidth="max-w-lg" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex:50 }}>
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl lq-pop flex flex-col`} style={{ maxHeight:"88vh" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <h3 className="font-display text-lg text-zinc-100 tracking-wide">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800"><X className="w-5 h-5"/></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto lq-scroll">{children}</div>
      </div>
    </div>
  );
}

function ToastStack({ toasts, onUndo }) {
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 items-end" style={{ zIndex:45, maxWidth:"22rem", pointerEvents:"none" }}>
      {toasts.map(t => (
        <div key={t.id} className="lq-toast bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3" style={{ pointerEvents:"auto" }}>
          {t.icon}
          <div className="text-sm text-zinc-100 flex-1">{t.text}</div>
          {t.undo && <button onClick={() => onUndo(t.id)} className="text-xs font-semibold text-amber-400 hover:text-amber-300 shrink-0">Отменить</button>}
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
      <div>
        {eyebrow && <div className="font-data text-xs tracking-widest text-zinc-500 uppercase mb-1">{eyebrow}</div>}
        <h2 className="font-display text-2xl text-zinc-100 tracking-wide">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/* ============================== QUEST ROW ============================== */

function QuestRow({ quest, sphere, onComplete, onClick }) {
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
          <Pips count={d.pips} />
          {quest.deadline && <span className={`text-xs font-data ${overdue ? "text-red-400" : "text-zinc-500"}`}>{fmtDateShort(quest.deadline)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs font-data text-amber-300 shrink-0"><Sparkles className="w-3.5 h-3.5"/>{quest.rewardXp}</div>
      {onComplete && <Button size="sm" variant="secondary" onClick={(e)=>{ e.stopPropagation(); onComplete(); }}>Готово</Button>}
    </div>
  );
}

/* ============================ ACTIVITY HEATMAP ============================ */

function ActivityHeatmap({ habits }) {
  const days = 84;
  const cells = useMemo(() => {
    const arr = [];
    for (let i = days-1; i >= 0; i--) {
      const ds = addDaysStr(-i);
      const total = habits.length;
      const done = habits.filter(h => (h.logs||[]).includes(ds)).length;
      arr.push({ date: ds, ratio: total ? done/total : 0 });
    }
    return arr;
  }, [habits]);

  if (habits.length === 0) {
    return <div className="text-sm text-zinc-500">Добавь привычки во вкладке «Привычки» — здесь появится карта активности.</div>;
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  function shade(ratio) {
    if (ratio <= 0) return "bg-zinc-800/60";
    if (ratio < 0.34) return "bg-emerald-900";
    if (ratio < 0.67) return "bg-emerald-700";
    if (ratio < 1) return "bg-emerald-500";
    return "bg-emerald-400";
  }

  return (
    <div className="overflow-x-auto lq-scroll pb-1">
      <div className="inline-flex gap-1">
        {weeks.map((w,wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {w.map(c => <div key={c.date} title={`${c.date}: ${Math.round(c.ratio*100)}%`} className={`w-3 h-3 rounded-sm ${shade(c.ratio)}`} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ ATTRIBUTE ROSETTE ============================ */

function AttributeRosette({ spheres, onSelectSphere }) {
  const cx = 220, cy = 190, maxR = 100;
  const N = Math.max(spheres.length, 1);
  const rings = [0.25, 0.5, 0.75, 1];
  const maxContinuous = Math.max(0.001, ...spheres.map(continuousLevel));

  function polar(i, r) {
    const theta = i * (2*Math.PI/N);
    return { x: cx + r*Math.sin(theta), y: cy - r*Math.cos(theta), thetaDeg: (theta*180/Math.PI) };
  }
  function anchorFor(thetaDeg) {
    const t = ((thetaDeg % 360) + 360) % 360;
    if (t < 15 || t > 345) return { anchor:"middle", dy:-8 };
    if (t > 165 && t < 195) return { anchor:"middle", dy:18 };
    if (t <= 165) return { anchor:"start", dy:4 };
    return { anchor:"end", dy:4 };
  }
  function ratioOf(sphere) {
    return clamp(continuousLevel(sphere) / maxContinuous, 0.08, 1);
  }

  const ringPts = rings.map(f => spheres.map((_,i) => { const p = polar(i, maxR*f); return `${p.x},${p.y}`; }).join(" "));
  const valuePts = spheres.map((s,i) => { const p = polar(i, maxR*ratioOf(s)); return `${p.x},${p.y}`; }).join(" ");

  return (
    <svg viewBox="0 0 440 400" className="w-full h-auto" style={{ maxWidth: 440 }}>
      <defs>
        <radialGradient id="lq-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={maxR*0.55} fill="url(#lq-core-glow)" className="lq-pulse" />
      {ringPts.map((pts,ri) => <polygon key={ri} points={pts} fill="none" stroke="#3f3f46" strokeOpacity="0.6" strokeWidth="1" />)}
      {spheres.map((s,i) => { const p = polar(i, maxR); return <line key={s.id} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#3f3f46" strokeOpacity="0.6" strokeWidth="1" />; })}
      <polygon points={valuePts} fill="#f59e0b" fillOpacity="0.18" stroke="#fbbf24" strokeWidth="2" strokeLinejoin="round" />
      {spheres.map((s,i) => {
        const p = polar(i, maxR*ratioOf(s));
        const lp = polar(i, maxR + 38);
        const a = anchorFor(lp.thetaDeg);
        const c = pal(s.color);
        const lvl = levelFromXp(s.xp);
        return (
          <g key={s.id} className="cursor-pointer" onClick={() => onSelectSphere && onSelectSphere(s.id)}>
            <circle cx={p.x} cy={p.y} r="5.5" fill={c.hex} stroke="#09090b" strokeWidth="2" />
            <text x={lp.x} y={lp.y + a.dy} textAnchor={a.anchor} fill="#d4d4d8" fontSize="12" fontWeight="600" className="font-body">{s.name}</text>
            <text x={lp.x} y={lp.y + a.dy + 14} textAnchor={a.anchor} fill={c.hex} fontSize="10" className="font-data">Ур. {lvl.level}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ================================== HUB ================================== */


function HubView({ state, actions, navigate }) {
  const overall = overallOf(state);
  const activeQuests = useMemo(() => state.quests.filter(q => q.status==="active").sort(sortByUrgency).slice(0,4), [state.quests]);
  const doneToday = state.habits.filter(h => (h.logs||[]).includes(todayStr())).length;
  const bestStreak = state.habits.reduce((m,h) => Math.max(m, computeStreak(h.logs||[])), 0);
  const topSphere = useMemo(() => {
    if (state.spheres.length===0) return null;
    return state.spheres.reduce((best,s) => continuousLevel(s) > continuousLevel(best) ? s : best, state.spheres[0]);
  }, [state.spheres]);
  const hubAchievements = useMemo(() => {
    const list = state.achievements || [];
    const withProg = list.map(a => ({ a, prog: achievementProgress(a, state) }));
    const unlocked = withProg.filter(x => x.a.unlockedAt).sort((x,y) => y.a.unlockedAt.localeCompare(x.a.unlockedAt));
    const locked = withProg.filter(x => !x.a.unlockedAt).sort((x,y) => (y.prog.current/(y.prog.target||1)) - (x.prog.current/(x.prog.target||1)));
    return [...unlocked.slice(0,3), ...locked.slice(0,3)].slice(0,6).map(x => x.a);
  }, [state.achievements, state.spheres, state.quests, state.habits, state.profile, state.transactions]);

  return (
    <div className="space-y-6">
      {/* Character status bar — first, as requested */}
      <Card className="p-5">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-display text-2xl text-zinc-950" style={{ boxShadow:"0 0 24px rgba(245,158,11,0.35)" }}>{overall.level}</div>
            <div>
              <div className="text-zinc-100 font-semibold">{state.profile.name}</div>
              <div className="text-xs text-zinc-500 font-data">{overall.xpIntoLevel} / {overall.xpForNext} XP</div>
            </div>
          </div>
          <div className="flex-1" style={{ minWidth:160 }}><ProgressBar value={overall.ratio} colorClass="bg-gradient-to-r from-amber-500 to-amber-300" /></div>
          <div className="flex items-center gap-5 shrink-0">
            <div className="flex items-center gap-2 text-amber-300"><Coins className="w-5 h-5"/><span className="font-data font-semibold text-lg">{state.profile.currency}</span></div>
            <div className="flex items-center gap-2 text-orange-400"><Flame className="w-5 h-5"/><span className="font-data font-semibold text-lg">{bestStreak}</span><span className="text-xs text-zinc-500">дн.</span></div>
          </div>
        </div>
      </Card>

      {/* Sphere balance rosette — second */}
      <Card className="p-6 flex flex-col items-center">
        <div className="w-full flex items-start justify-between mb-1 flex-wrap gap-1">
          <div className="font-data text-xs tracking-widest text-zinc-500 uppercase">Баланс сфер жизни</div>
          {topSphere && <div className="text-xs text-zinc-600">Шкала — по сфере «{topSphere.name}»</div>}
        </div>
        <AttributeRosette spheres={state.spheres} onSelectSphere={(id) => navigate("spheres", id)} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-zinc-200">Сегодня</div>
            <div className="font-data text-xs text-zinc-500">{doneToday}/{state.habits.length}</div>
          </div>
          {state.habits.length === 0 ? (
            <div className="text-sm text-zinc-500">Нет ежедневных задач. Добавь их во вкладке «Привычки».</div>
          ) : (
            <div className="space-y-2 overflow-y-auto lq-scroll pr-1" style={{ maxHeight:224 }}>
              {state.habits.map(h => {
                const done = (h.logs||[]).includes(todayStr());
                const sphere = state.spheres.find(s => s.id===h.sphereId);
                const c = pal(sphere && sphere.color);
                return (
                  <button key={h.id} onClick={() => actions.toggleHabitToday(h.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition text-left ${done ? "bg-zinc-800/40 border-zinc-800" : "bg-zinc-950/40 border-zinc-800 hover:border-zinc-700"}`}>
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${done ? c.bgSolid + " border-transparent" : "border-zinc-600"}`}>{done && <Check className="w-3.5 h-3.5 text-zinc-950"/>}</span>
                    <span className={`text-sm flex-1 ${done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{h.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-zinc-200">Активные квесты</div>
            <button onClick={() => navigate("quests")} className="text-xs text-amber-400 hover:text-amber-300 font-medium">Все квесты →</button>
          </div>
          {activeQuests.length === 0 ? (
            <EmptyState icon={ScrollText} title="Нет активных квестов" subtitle="Создай первый квест и получи опыт с наградой." action={<Button size="sm" onClick={() => navigate("quests")}>Создать квест</Button>} />
          ) : (
            <div className="space-y-2">
              {activeQuests.map(q => <QuestRow key={q.id} quest={q} sphere={state.spheres.find(s=>s.id===q.sphereId)} onComplete={() => actions.completeQuest(q.id)} />)}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="text-sm font-semibold text-zinc-200 mb-3">Активность за 12 недель</div>
        <ActivityHeatmap habits={state.habits} />
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-zinc-200">Достижения</div>
          <button onClick={() => navigate("achievements")} className="text-xs text-amber-400 hover:text-amber-300 font-medium">Все достижения →</button>
        </div>
        {hubAchievements.length === 0 ? (
          <div className="text-sm text-zinc-500">Пока нет достижений — загляни во вкладку «Достижения».</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto lq-scroll pb-1">
            {hubAchievements.map(a => <AchievementCard key={a.id} achievement={a} state={state} compact />)}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================== ACHIEVEMENTS ============================== */

function AchievementCard({ achievement, state, onDelete, compact }) {
  const prog = achievementProgress(achievement, state);
  const ratio = clamp(prog.target ? prog.current/prog.target : 0, 0, 1);
  const Icon = IconFor(achievement.icon);
  const unlocked = !!achievement.unlockedAt;
  return (
    <div className={`relative rounded-xl border p-3 flex flex-col shrink-0 ${unlocked ? "border-amber-500/30 bg-amber-500/10" : "border-zinc-800 bg-zinc-950/40"}`} style={compact ? { width:132 } : {}}>
      {onDelete && <button onClick={onDelete} className="absolute top-1.5 right-1.5 text-zinc-600 hover:text-red-400 p-1"><X className="w-3 h-3"/></button>}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${unlocked ? "bg-amber-500/20" : "bg-zinc-800"}`}>
        {unlocked ? <Icon className="w-5 h-5 text-amber-400"/> : <Lock className="w-4 h-4 text-zinc-600"/>}
      </div>
      <div className={`text-xs font-medium leading-tight ${unlocked ? "text-zinc-200" : "text-zinc-400"}`}>{achievement.title}</div>
      {achievement.desc && <div className="text-xs text-zinc-600 leading-tight mt-0.5">{achievement.desc}</div>}
      {!unlocked ? (
        <div className="mt-2">
          <ProgressBar value={ratio} heightClass="h-1" colorClass="bg-amber-500" />
          <div className="text-xs text-zinc-600 font-data mt-1">{Math.min(prog.current, prog.target)}/{prog.target}</div>
        </div>
      ) : (
        <div className="text-xs text-amber-500/70 font-data mt-2">Получено {fmtDateShort(achievement.unlockedAt)}</div>
      )}
    </div>
  );
}

function AchievementForm({ spheres, onSubmit, onCancel }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [icon, setIcon] = useState("Award");
  const [kind, setKind] = useState("level");
  const [target, setTarget] = useState(5);
  const [sphereId, setSphereId] = useState((spheres[0] && spheres[0].id) || "");

  function submit() {
    if (!title.trim() || !target) return;
    onSubmit({ title: title.trim(), desc: desc.trim(), icon, kind, target: Number(target)||1, sphereId: kind==="sphereLevel" ? sphereId : null });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название</label>
        <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: Марафонец" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Описание (необязательно)</label>
        <input className={inputCls} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Что нужно сделать" />
      </div>
      <div>
        <label className={labelCls}>Иконка</label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Тип условия</label>
          <select className={inputCls} value={kind} onChange={e=>setKind(e.target.value)}>
            {Object.entries(ACH_KINDS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Цель ({ACH_KINDS[kind].unit})</label>
          <input type="number" min="1" className={inputCls} value={target} onChange={e=>setTarget(e.target.value)} />
        </div>
      </div>
      {kind==="sphereLevel" && (
        <div>
          <label className={labelCls}>Сфера</label>
          <select className={inputCls} value={sphereId} onChange={e=>setSphereId(e.target.value)}>
            {spheres.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>Создать</Button>
      </div>
    </div>
  );
}

function AchievementsView({ state, actions }) {
  const [modalOpen, setModalOpen] = useState(false);
  const unlockedCount = (state.achievements||[]).filter(a => a.unlockedAt).length;
  return (
    <div className="space-y-5">
      <SectionHeader eyebrow={`${unlockedCount}/${(state.achievements||[]).length} получено`} title="Достижения" action={<Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4"/>Своё достижение</Button>} />
      {(!state.achievements || state.achievements.length===0) ? (
        <EmptyState icon={Award} title="Пока нет достижений" subtitle="Добавь своё условие — уровень, серия дней, накопления и другое." action={<Button size="sm" onClick={() => setModalOpen(true)}>Добавить</Button>} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {state.achievements.map(a => <AchievementCard key={a.id} achievement={a} state={state} onDelete={() => actions.deleteAchievement(a.id)} />)}
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Новое достижение">
        <AchievementForm spheres={state.spheres} onSubmit={(a) => { actions.addAchievement(a); setModalOpen(false); }} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}

/* ============================== QUESTS VIEW ============================== */


function QuestCard({ quest, sphere, onComplete, onFail, onReopen, onEdit, onDelete, onToggleSubtask }) {
  const [expanded, setExpanded] = useState(false);
  const d = DIFFICULTY[quest.difficulty] || DIFFICULTY.easy;
  const p = PRIORITY[quest.priority] || PRIORITY.medium;
  const c = pal(sphere && sphere.color);
  const pc = pal(p.color);
  const overdue = quest.deadline && quest.deadline < todayStr() && quest.status === "active";
  const subtasks = quest.subtasks || [];
  const doneSubtasks = subtasks.filter(s => s.done).length;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: c.hex, minHeight: 24 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`text-sm font-semibold break-words ${quest.status==="done" ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{quest.title}</div>
              {quest.description && <div className="text-xs text-zinc-500 mt-1">{quest.description}</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onEdit} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"><Pencil className="w-3.5 h-3.5"/></button>
              <button onClick={onDelete} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${c.bgSoft} ${c.text}`}>{sphere ? sphere.name : "Без сферы"}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${pc.bgSoft} ${pc.text}`}>{p.label}</span>
            <Pips count={d.pips} />
            {quest.deadline && <span className={`text-xs font-data flex items-center gap-1 ${overdue ? "text-red-400" : "text-zinc-500"}`}><Calendar className="w-3 h-3"/>{fmtDateShort(quest.deadline)}</span>}
            {subtasks.length > 0 && (
              <button onClick={() => setExpanded(v => !v)} className="text-xs font-data text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                <ListPlus className="w-3 h-3"/>{doneSubtasks}/{subtasks.length}
                <ChevronDown className="w-3 h-3 transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "none" }}/>
              </button>
            )}
            <span className="text-xs font-data text-amber-300 flex items-center gap-1 ml-auto"><Sparkles className="w-3 h-3"/>{quest.rewardXp}<Coins className="w-3 h-3 ml-1"/>{quest.rewardGold}</span>
          </div>
          {expanded && subtasks.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3">
              {subtasks.map(st => (
                <button key={st.id} onClick={() => onToggleSubtask(st.id)} className="w-full flex items-center gap-2 text-left">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${st.done ? "bg-amber-500 border-amber-500" : "border-zinc-600"}`}>{st.done && <Check className="w-3 h-3 text-zinc-950"/>}</span>
                  <span className={`text-xs ${st.done ? "text-zinc-500 line-through" : "text-zinc-300"}`}>{st.text}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-3">
            {quest.status === "active" && (
              <>
                <Button size="sm" onClick={onComplete}>Завершить</Button>
                <Button size="sm" variant="ghost" onClick={onFail}>Провалить</Button>
              </>
            )}
            {quest.status === "done" && <span className="text-xs text-emerald-400 flex items-center gap-1"><Check className="w-3.5 h-3.5"/>Выполнено{quest.completedAt ? " " + fmtDateShort(quest.completedAt) : ""}</span>}
            {quest.status === "failed" && (
              <>
                <span className="text-xs text-red-400 flex items-center gap-1"><X className="w-3.5 h-3.5"/>Провалено</span>
                <Button size="sm" variant="ghost" onClick={onReopen}>Вернуть в работу</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function QuestForm({ initial, spheres, onSubmit, onCancel }) {
  const [title, setTitle] = useState((initial && initial.title) || "");
  const [description, setDescription] = useState((initial && initial.description) || "");
  const [sphereId, setSphereId] = useState((initial && initial.sphereId) || (spheres[0] && spheres[0].id) || "");
  const [priority, setPriority] = useState((initial && initial.priority) || "medium");
  const [difficulty, setDifficulty] = useState((initial && initial.difficulty) || "medium");
  const [manualReward, setManualReward] = useState(!!(initial && initial.manualReward));
  const [rewardXp, setRewardXp] = useState((initial && initial.rewardXp) ?? DIFFICULTY.medium.xp);
  const [rewardGold, setRewardGold] = useState((initial && initial.rewardGold) ?? DIFFICULTY.medium.gold);
  const [deadline, setDeadline] = useState((initial && initial.deadline) || "");
  const [subtasks, setSubtasks] = useState((initial && initial.subtasks) || []);
  const [subtaskDraft, setSubtaskDraft] = useState("");

  useEffect(() => {
    if (!manualReward) { const d = DIFFICULTY[difficulty]; setRewardXp(d.xp); setRewardGold(d.gold); }
  }, [difficulty, manualReward]);

  function addSubtask() {
    if (!subtaskDraft.trim()) return;
    setSubtasks(list => [...list, { id: uid(), text: subtaskDraft.trim(), done:false }]);
    setSubtaskDraft("");
  }
  function removeSubtask(id) { setSubtasks(list => list.filter(s => s.id!==id)); }
  function submit() {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: description.trim(), sphereId, priority, difficulty, manualReward, rewardXp: Number(rewardXp)||0, rewardGold: Number(rewardGold)||0, deadline: deadline || null, subtasks });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название квеста</label>
        <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: Подготовить презентацию" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Описание (необязательно)</label>
        <textarea className={inputCls} rows={2} value={description} onChange={e=>setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Сфера жизни</label>
          <select className={inputCls} value={sphereId} onChange={e=>setSphereId(e.target.value)}>
            {spheres.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Срок (необязательно)</label>
          <input type="date" className={inputCls} value={deadline||""} onChange={e=>setDeadline(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Приоритет</label>
          <select className={inputCls} value={priority} onChange={e=>setPriority(e.target.value)}>
            {Object.entries(PRIORITY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Сложность</label>
          <select className={inputCls} value={difficulty} onChange={e=>setDifficulty(e.target.value)}>
            {Object.entries(DIFFICULTY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className={labelCls} style={{ marginBottom:0 }}>Награда</span>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={manualReward} onChange={e=>setManualReward(e.target.checked)} />
            Своя награда
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <Sparkles className="w-4 h-4 text-amber-400 absolute" style={{ left:12, top:"50%", transform:"translateY(-50%)" }} />
            <input type="number" min="0" disabled={!manualReward} className={inputCls + " disabled:opacity-60"} style={{ paddingLeft:36 }} value={rewardXp} onChange={e=>setRewardXp(e.target.value)} />
          </div>
          <div className="relative">
            <Coins className="w-4 h-4 text-amber-400 absolute" style={{ left:12, top:"50%", transform:"translateY(-50%)" }} />
            <input type="number" min="0" disabled={!manualReward} className={inputCls + " disabled:opacity-60"} style={{ paddingLeft:36 }} value={rewardGold} onChange={e=>setRewardGold(e.target.value)} />
          </div>
        </div>
      </div>
      <div>
        <label className={labelCls}>Подзадачи</label>
        <div className="space-y-1.5 mb-2">
          {subtasks.map(s => (
            <div key={s.id} className="flex items-center gap-2 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-1.5">
              <span className="text-xs text-zinc-300 flex-1">{s.text}</span>
              <button onClick={() => removeSubtask(s.id)} className="text-zinc-600 hover:text-red-400"><X className="w-3.5 h-3.5"/></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls} value={subtaskDraft} onChange={e=>setSubtaskDraft(e.target.value)} onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); addSubtask(); } }} placeholder="Добавить пункт..." />
          <Button variant="secondary" onClick={addSubtask}><Plus className="w-4 h-4"/></Button>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>{initial ? "Сохранить" : "Создать квест"}</Button>
      </div>
    </div>
  );
}

function QuestsView({ state, actions }) {
  const [filter, setFilter] = useState("active");
  const [sphereFilter, setSphereFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const counts = useMemo(() => {
    const today = todayStr();
    return {
      active: state.quests.filter(q=>q.status==="active" && !(q.deadline && q.deadline<today)).length,
      overdue: state.quests.filter(q=>q.status==="active" && q.deadline && q.deadline<today).length,
      done: state.quests.filter(q=>q.status==="done").length,
      failed: state.quests.filter(q=>q.status==="failed").length,
    };
  }, [state.quests]);

  const filtered = useMemo(() => {
    let list = state.quests.slice();
    const today = todayStr();
    if (filter === "active") list = list.filter(q => q.status==="active" && !(q.deadline && q.deadline<today));
    else if (filter === "done") list = list.filter(q => q.status==="done");
    else if (filter === "overdue") list = list.filter(q => q.status==="active" && q.deadline && q.deadline<today);
    else if (filter === "failed") list = list.filter(q => q.status==="failed");
    if (sphereFilter !== "all") list = list.filter(q => q.sphereId===sphereFilter);
    if (search.trim()) { const s = search.trim().toLowerCase(); list = list.filter(q => q.title.toLowerCase().includes(s)); }
    return list.sort(sortByUrgency);
  }, [state.quests, filter, sphereFilter, search]);

  const FILTERS = [
    { id:"active", label:`Активные (${counts.active})` },
    { id:"overdue", label:`Просроченные (${counts.overdue})` },
    { id:"done", label:`Выполненные (${counts.done})` },
    { id:"failed", label:`Провалено (${counts.failed})` },
    { id:"all", label:"Все" },
  ];

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(q) { setEditing(q); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updateQuest(editing.id, data); else actions.addQuest(data);
    setModalOpen(false);
  }

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Журнал заданий" title="Квесты" action={<Button onClick={openCreate}><Plus className="w-4 h-4"/>Новый квест</Button>} />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${filter===f.id ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "text-zinc-400 border-zinc-800 hover:border-zinc-700"}`}>{f.label}</button>
        ))}
        <div className="flex-1" />
        <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={sphereFilter} onChange={e=>setSphereFilter(e.target.value)}>
          <option value="all">Все сферы</option>
          {state.spheres.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-600 absolute" style={{ left:10, top:"50%", transform:"translateY(-50%)" }} />
          <input className="bg-zinc-900 border border-zinc-800 rounded-lg pr-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600" style={{ width:160, paddingLeft:30 }} placeholder="Поиск..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ScrollText} title="Здесь пока пусто" subtitle="Измени фильтры или создай новый квест." action={<Button size="sm" onClick={openCreate}>Создать квест</Button>} />
      ) : (
        <div className="space-y-3">
          {filtered.map(q => (
            <QuestCard key={q.id} quest={q} sphere={state.spheres.find(s=>s.id===q.sphereId)}
              onComplete={() => actions.completeQuest(q.id)}
              onFail={() => actions.failQuest(q.id)}
              onReopen={() => actions.reopenQuest(q.id)}
              onEdit={() => openEdit(q)}
              onDelete={() => actions.deleteQuest(q.id)}
              onToggleSubtask={(subId) => actions.toggleSubtask(q.id, subId)}
            />
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Редактировать квест" : "Новый квест"} maxWidth="max-w-xl">
        <QuestForm initial={editing} spheres={state.spheres} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}

function HabitMiniHeatmap({ logs, colorHex }) {
  const days = 35;
  const cells = [];
  for (let i=days-1;i>=0;i--) { const ds = addDaysStr(-i); cells.push({ date:ds, done:(logs||[]).includes(ds) }); }
  const weeks = [];
  for (let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));
  return (
    <div className="inline-flex gap-1">
      {weeks.map((w,wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {w.map(c => <div key={c.date} title={c.date} className="rounded-sm" style={{ width:8, height:8, backgroundColor: c.done ? colorHex : "rgba(63,63,70,0.5)" }} />)}
        </div>
      ))}
    </div>
  );
}

function HabitRow({ habit, sphere, onToggleToday, onEdit, onDelete }) {
  const c = pal(sphere && sphere.color);
  const streak = computeStreak(habit.logs||[]);
  const done = (habit.logs||[]).includes(todayStr());
  const last30 = (habit.logs||[]).filter(d => d >= addDaysStr(-29)).length;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={onToggleToday} className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition ${done ? c.bgSolid + " border-transparent" : "border-zinc-700 hover:border-zinc-500"}`}>
          {done && <Check className="w-5 h-5 text-zinc-950"/>}
        </button>
        <div className="min-w-0" style={{ minWidth:140 }}>
          <div className="text-sm font-medium text-zinc-100 truncate">{habit.title}</div>
          <div className={`text-xs ${c.text} mt-0.5`}>{sphere ? sphere.name : "Без сферы"}</div>
        </div>
        <div className="flex items-center gap-1.5 text-orange-400 text-sm font-data shrink-0"><Flame className="w-4 h-4"/>{streak}</div>
        <div className="text-xs text-zinc-500 font-data shrink-0">{last30}/30 дней</div>
        <div className="flex-1 flex justify-end overflow-x-auto lq-scroll">
          <HabitMiniHeatmap logs={habit.logs} colorHex={c.hex} />
        </div>
        <button onClick={onEdit} className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 shrink-0"><Pencil className="w-4 h-4"/></button>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800 shrink-0"><Trash2 className="w-4 h-4"/></button>
      </div>
    </Card>
  );
}

function HabitForm({ spheres, initial, onSubmit, onCancel }) {
  const [title, setTitle] = useState((initial && initial.title) || "");
  const [sphereId, setSphereId] = useState((initial && initial.sphereId) || (spheres[0] && spheres[0].id) || "");
  function submit() { if (!title.trim()) return; onSubmit({ title: title.trim(), sphereId }); }
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название привычки</label>
        <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: Медитация 10 минут" autoFocus onKeyDown={e=>{ if (e.key==="Enter") { e.preventDefault(); submit(); } }} />
      </div>
      <div>
        <label className={labelCls}>Сфера жизни</label>
        <select className={inputCls} value={sphereId} onChange={e=>setSphereId(e.target.value)}>
          {spheres.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>{initial ? "Сохранить" : "Добавить"}</Button>
      </div>
    </div>
  );
}

function HabitsView({ state, actions }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const doneToday = state.habits.filter(h => (h.logs||[]).includes(todayStr())).length;

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(h) { setEditing(h); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updateHabit(editing.id, data); else actions.addHabit(data);
    setModalOpen(false);
  }

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Ежедневный ритуал" title="Привычки" action={<Button onClick={openCreate}><Plus className="w-4 h-4"/>Новая привычка</Button>} />
      <Card className="p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-zinc-200">Сегодня выполнено</div>
          <div className="font-data text-sm text-zinc-400">{doneToday}/{state.habits.length}</div>
        </div>
        <ProgressBar value={state.habits.length ? doneToday/state.habits.length : 0} colorClass="bg-gradient-to-r from-emerald-500 to-emerald-300" />
      </Card>
      {state.habits.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Пока нет привычек" subtitle="Добавь то, что хочешь делать каждый день — вода, спорт, чтение." action={<Button size="sm" onClick={openCreate}>Добавить привычку</Button>} />
      ) : (
        <div className="space-y-3">
          {state.habits.map(h => (
            <HabitRow key={h.id} habit={h} sphere={state.spheres.find(s=>s.id===h.sphereId)} onToggleToday={() => actions.toggleHabitToday(h.id)} onEdit={() => openEdit(h)} onDelete={() => actions.deleteHabit(h.id)} />
          ))}
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Изменить привычку" : "Новая привычка"}>
        <HabitForm spheres={state.spheres} initial={editing} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}
function IconPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {ICON_KEYS.map(name => {
        const Icon = ICONS[name];
        const active = value === name;
        return (
          <button key={name} type="button" onClick={() => onChange(name)} className={`aspect-square rounded-xl border flex items-center justify-center transition ${active ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"}`}>
            <Icon className="w-5 h-5"/>
          </button>
        );
      })}
    </div>
  );
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE_KEYS.map(key => {
        const c = PALETTE[key];
        const active = value === key;
        return (
          <button key={key} type="button" onClick={() => onChange(key)} className="rounded-full transition"
            style={{ width:30, height:30, backgroundColor:c.hex, boxShadow: active ? `0 0 0 2px #09090b, 0 0 0 4px ${c.hex}` : "none" }} />
        );
      })}
    </div>
  );
}

function SphereForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState((initial && initial.name) || "");
  const [icon, setIcon] = useState((initial && initial.icon) || "Star");
  const [color, setColor] = useState((initial && initial.color) || "amber");
  function submit() { if (!name.trim()) return; onSubmit({ name: name.trim(), icon, color }); }
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название сферы</label>
        <input className={inputCls} value={name} onChange={e=>setName(e.target.value)} placeholder="Например: Духовность" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Иконка</label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <div>
        <label className={labelCls}>Цвет</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>{initial ? "Сохранить" : "Создать сферу"}</Button>
      </div>
    </div>
  );
}

function SphereCard({ sphere, questCount, habitCount, onClick }) {
  const c = pal(sphere.color);
  const lvl = levelFromXp(sphere.xp);
  const Icon = IconFor(sphere.icon);
  return (
    <button onClick={onClick} className="text-left h-full">
      <Card className="p-5 h-full hover:border-zinc-700 transition">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${c.bgSoft}`}><Icon className={`w-5 h-5 ${c.text}`}/></div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-100 truncate">{sphere.name}</div>
            <div className="text-xs text-zinc-500 font-data">Уровень {lvl.level}</div>
          </div>
        </div>
        <ProgressBar value={lvl.ratio} colorClass={c.bgSolid} />
        <div className="flex items-center justify-between mt-3 text-xs text-zinc-500">
          <span>{questCount} квестов</span>
          <span>{habitCount} привычек</span>
        </div>
      </Card>
    </button>
  );
}

function SphereDetail({ sphere, state, actions, onBack, onEdit }) {
  const c = pal(sphere.color);
  const Icon = IconFor(sphere.icon);
  const lvl = levelFromXp(sphere.xp);
  const quests = state.quests.filter(q => q.sphereId===sphere.id).sort(sortByUrgency);
  const habits = state.habits.filter(h => h.sphereId===sphere.id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"><ChevronLeft className="w-3.5 h-3.5"/>Все сферы</button>
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${c.bgSoft}`}><Icon className={`w-8 h-8 ${c.text}`}/></div>
            <div>
              <div className="font-display text-2xl text-zinc-100 tracking-wide">{sphere.name}</div>
              <div className="text-sm text-zinc-500 font-data mt-0.5">Уровень {lvl.level} · {lvl.xpIntoLevel}/{lvl.xpForNext} XP</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit}><Pencil className="w-3.5 h-3.5"/>Изменить</Button>
            {!confirmDelete ? (
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="w-3.5 h-3.5"/></Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Button variant="danger" size="sm" onClick={() => { actions.deleteSphere(sphere.id); onBack(); }}>Удалить</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Отмена</Button>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4"><ProgressBar value={lvl.ratio} colorClass={c.bgSolid} /></div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <div className="text-sm font-semibold text-zinc-200 mb-3">Квесты этой сферы ({quests.length})</div>
          {quests.length === 0 ? <div className="text-sm text-zinc-500">Пока нет квестов в этой сфере.</div> : (
            <div className="space-y-2">
              {quests.map(q => <QuestRow key={q.id} quest={q} sphere={sphere} onComplete={q.status==="active" ? () => actions.completeQuest(q.id) : undefined} />)}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="text-sm font-semibold text-zinc-200 mb-3">Привычки этой сферы ({habits.length})</div>
          {habits.length === 0 ? <div className="text-sm text-zinc-500">Пока нет привычек в этой сфере.</div> : (
            <div className="space-y-2">
              {habits.map(h => {
                const done = (h.logs||[]).includes(todayStr());
                const streak = computeStreak(h.logs||[]);
                return (
                  <button key={h.id} onClick={() => actions.toggleHabitToday(h.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition text-left ${done ? "bg-zinc-800/40 border-zinc-800" : "bg-zinc-950/40 border-zinc-800 hover:border-zinc-700"}`}>
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${done ? c.bgSolid + " border-transparent" : "border-zinc-600"}`}>{done && <Check className="w-3.5 h-3.5 text-zinc-950"/>}</span>
                    <span className={`text-sm flex-1 ${done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{h.title}</span>
                    <span className="text-xs text-orange-400 font-data flex items-center gap-1"><Flame className="w-3 h-3"/>{streak}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SpheresView({ state, actions, focus, setFocus, navigate }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const focused = focus ? state.spheres.find(s => s.id===focus) : null;

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(s) { setEditing(s); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updateSphere(editing.id, data); else actions.addSphere(data);
    setModalOpen(false);
  }

  if (focused) {
    return (
      <>
        <SphereDetail sphere={focused} state={state} actions={actions} onBack={() => setFocus(null)} onEdit={() => openEdit(focused)} />
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Изменить сферу">
          <SphereForm initial={editing} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
        </Modal>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Атрибуты персонажа" title="Сферы жизни" action={<Button onClick={openCreate}><Plus className="w-4 h-4"/>Новая сфера</Button>} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.spheres.map(s => (
          <SphereCard key={s.id} sphere={s}
            questCount={state.quests.filter(q => q.sphereId===s.id).length}
            habitCount={state.habits.filter(h => h.sphereId===s.id).length}
            onClick={() => setFocus(s.id)}
          />
        ))}
      </div>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Изменить сферу" : "Новая сфера"}>
        <SphereForm initial={editing} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}

function MonthNav({ month, onChange }) {
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

function ColoredPieTooltip({ active, payload }) {
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

function ExpenseByCategoryPie({ transactions, month, categories }) {
  const data = useMemo(() => {
    const map = {};
    transactions.filter(t => t.type==="expense" && monthKey(t.date)===month).forEach(t => {
      const meta = categoryMeta(categories, "expense", t.category);
      if (!map[meta.name]) map[meta.name] = { name: meta.name, value: 0, color: meta.color };
      map[meta.name].value += t.amount;
    });
    return Object.values(map).sort((a,b) => b.value-a.value);
  }, [transactions, month, categories]);
  if (data.length === 0) return <div className="text-sm text-zinc-500">Нет расходов за этот месяц.</div>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((d) => <Cell key={d.name} fill={pal(d.color).hex} stroke="#09090b" strokeWidth={1} />)}
        </Pie>
        <Tooltip content={ColoredPieTooltip} />
        <Legend wrapperStyle={{ fontSize:11 }} />
      </PieChart>
    </ResponsiveContainer>

  );
}

function DistributionPie({ transactions, month }) {
  const data = useMemo(() => {
    const monthStart = `${month}-01`;
    const startBalance = balanceAsOf(transactions, monthStart);
    const monthTx = transactions.filter(t => monthKey(t.date)===month);
    const monthIncome = monthTx.reduce((a,t) => {
      if (t.type==="income") return a + t.amount;
      if (savingsCountsAsIncome(t)) return a + t.amount;
      return a;
    }, 0);
    const spent = monthTx.filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
    const savingsDelta = monthTx.filter(savingsMovesBalance).reduce((a,t)=> a + (t.direction==="withdraw" ? -t.amount : t.amount), 0);
    const debtDelta = monthTx.filter(debtMovesBalance).reduce((a,t)=> a + (t.direction==="repay" ? -t.amount : t.amount), 0);
    const pool = startBalance + monthIncome;
    const saved = Math.max(0, savingsDelta);
    const lent = Math.max(0, debtDelta);
    const remaining = Math.max(0, pool - spent - saved - lent);
    const segs = [
      { name:"Потрачено", value: spent, color:"rose" },
      { name:"Отложено", value: saved, color:"violet" },
    ];
    if (lent > 0) segs.push({ name:"Дано в долг", value: lent, color:"cyan" });
    segs.push({ name:"Остаток", value: remaining, color:"emerald" });
    return { segs: segs.filter(s => s.value > 0), pool };
  }, [transactions, month]);

  if (data.pool <= 0 && data.segs.every(s => s.value===0)) return <div className="text-sm text-zinc-500">Нет данных за этот месяц.</div>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data.segs} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.segs.map((d) => <Cell key={d.name} fill={pal(d.color).hex} stroke="#09090b" strokeWidth={1} />)}
        </Pie>
        <Tooltip content={ColoredPieTooltip} />
        <Legend wrapperStyle={{ fontSize:11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}


function BalanceLine({ transactions }) {
  const data = useMemo(() => {
    const sorted = transactions.slice().sort((a,b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return balanceEffectOf(b) - balanceEffectOf(a); // в один день: пополнения раньше списаний
    });
    let running = 0;
    return sorted.map(t => {
      running += balanceEffectOf(t);
      return { date:t.date, label:fmtDateShort(t.date), balance:running };
    });
  }, [transactions]);
  if (data.length === 0) return <div className="text-sm text-zinc-500">Нет операций.</div>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="label" stroke="#71717a" fontSize={10} tickLine={false} axisLine={{ stroke:"#27272a" }} minTickGap={30} />
        <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (v>=1000||v<=-1000) ? `${Math.round(v/1000)}k` : v} />
        <Tooltip contentStyle={{ background:"#18181b", border:"1px solid #3f3f46", borderRadius:10, fontSize:12 }} formatter={(v) => fmtMoney(v)} />
        <Line type="monotone" dataKey="balance" stroke="#fbbf24" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TransactionForm({ categories, knownPersons, initial, isEdit, onSubmit, onCancel }) {
  const [type, setType] = useState((initial && initial.type) || "expense");
  const [direction, setDirection] = useState((initial && initial.direction) || "deposit");
  const [source, setSource] = useState((initial && initial.source) || "manual");
  const [person, setPerson] = useState((initial && initial.person) || "");
  const [amount, setAmount] = useState((initial && initial.amount != null) ? initial.amount : "");
  const [category, setCategory] = useState((initial && initial.category) || (categories.expense[0] && categories.expense[0].name) || "");
  const [date, setDate] = useState((initial && initial.date) || todayStr());
  const [description, setDescription] = useState((initial && initial.description) || "");

  function switchType(newType) {
    setType(newType);
    if (newType==="income") setCategory((categories.income[0] && categories.income[0].name) || "");
    else if (newType==="expense") setCategory((categories.expense[0] && categories.expense[0].name) || "");
    else if (newType==="savings") { setDirection(d => (d==="lend"||d==="repay") ? "deposit" : d); setSource(s => s==="opening" ? s : "manual"); }
    else if (newType==="debt") { setDirection(d => (d==="deposit"||d==="withdraw") ? "lend" : d); setSource(s => s==="interest" ? "manual" : s); }
  }

  function submit() {
    const amt = Number(amount);
    if (!amt || amt<=0) return;
    if (type==="savings") {
      onSubmit({ type, direction, source: direction==="deposit" ? source : "manual", amount:amt, category:"Сбережения", date, description: description.trim() });
    } else if (type==="debt") {
      if (!person.trim()) return;
      onSubmit({ type, direction, source: direction==="lend" ? source : "manual", person: person.trim(), amount:amt, category:"Долг", date, description: description.trim() });
    } else {
      onSubmit({ type, amount:amt, category, date, description: description.trim() });
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
          <div>
            <label className={labelCls}>Кому / от кого</label>
            <input list="lq-debt-persons" className={inputCls} value={person} onChange={e=>setPerson(e.target.value)} placeholder="Имя человека" />
            <datalist id="lq-debt-persons">
              {(knownPersons||[]).map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
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
        {type!=="savings" && type!=="debt" && (
          <div>
            <label className={labelCls}>Категория</label>
            <select className={inputCls} value={category} onChange={e=>setCategory(e.target.value)}>
              {list.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className={(type==="savings" || type==="debt") ? "col-span-2" : ""}>
          <label className={labelCls}>Дата</label>
          <input type="date" className={inputCls} value={date} onChange={e=>setDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Описание (необязательно)</label>
        <input className={inputCls} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Например: продукты на неделю" />
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

const LIMIT_OPTIONS = [10, 20, 50, Infinity];

function TransactionsTable({ transactions, categories, onDelete, onEdit }) {
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = transactions.slice();
    if (typeFilter !== "all") list = list.filter(t => t.type===typeFilter);
    if (search.trim()) { const s = search.trim().toLowerCase(); list = list.filter(t => (t.description||"").toLowerCase().includes(s) || t.category.toLowerCase().includes(s)); }
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
      const who = t.person || "?";
      const label = t.direction==="repay" ? `Возврат: ${who}` : `${DEBT_SOURCES[debtSourceOf(t)].label}: ${who}`;
      return <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">{label}</span>;
    }
    const meta = categoryMeta(categories, t.type, t.category);
    return <span className={`px-2 py-0.5 rounded-full ${pal(meta.color).bgSoft} ${pal(meta.color).text}`}>{meta.name}</span>;
  }
  function signedAmount(t) {
    const effect = balanceEffectOf(t);
    if (effect === 0) return { sign:"", cls:"text-zinc-500" };
    const positive = effect > 0;
    if (t.type==="income") return { sign:"+", cls:"text-emerald-400" };
    if (t.type==="expense") return { sign:"-", cls:"text-rose-400" };
    if (t.type==="debt") return positive ? { sign:"+", cls:"text-cyan-300" } : { sign:"-", cls:"text-cyan-400" };
    return positive ? { sign:"+", cls:"text-violet-300" } : { sign:"-", cls:"text-violet-400" };
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {["all","income","expense","savings","debt"].map(k => (
          <button key={k} onClick={() => setTypeFilter(k)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${typeFilter===k ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "text-zinc-400 border-zinc-800 hover:border-zinc-700"}`}>{k==="all" ? "Все" : k==="income" ? "Доходы" : k==="expense" ? "Расходы" : k==="savings" ? "Сбережения" : "Долги"}</button>
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
        <table className="w-full border-collapse" style={{ minWidth:520 }}>
          <thead>
            <tr className="border-b border-zinc-800">
              <Th k="date">Дата</Th>
              <Th k="category">Категория</Th>
              <th className="text-left text-xs font-data uppercase tracking-wide text-zinc-500 px-3 py-2">Описание</th>
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
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">{badgeFor(t)}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400" style={{ maxWidth:220 }}>{t.description || "—"}</td>
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

function CategoryRow({ category, index, isLast, dragActive, dragOver, onDragStart, onDragOver, onDrop, onDragEnd, onMoveUp, onMoveDown, onDelete, onRecolor, onRename }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const [recoloring, setRecoloring] = useState(false);
  const cancelledRef = useRef(false);

  function startRename() { setDraft(category.name); cancelledRef.current = false; setRenaming(true); }
  function commit() {
    if (!cancelledRef.current) {
      const n = draft.trim();
      if (n && n !== category.name) onRename(n);
    }
    cancelledRef.current = false;
    setRenaming(false);
  }

  return (
    <div>
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={`flex items-center gap-2 bg-zinc-950/50 border rounded-lg px-2 py-2 transition ${dragOver ? "border-amber-500/50" : "border-zinc-800"}`}
        style={{ opacity: dragActive ? 0.4 : 1 }}
      >
        <span className="text-zinc-700 shrink-0" style={{ cursor:"grab" }}><GripVertical className="w-4 h-4"/></span>
        <button onClick={() => setRecoloring(v=>!v)} className="rounded-full shrink-0" style={{ width:16, height:16, backgroundColor: pal(category.color).hex }} title="Изменить цвет" />
        {renaming ? (
          <input
            autoFocus
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-sm text-zinc-100"
            style={{ minWidth:0 }}
            value={draft}
            onChange={e=>setDraft(e.target.value)}
            onKeyDown={e=>{
              if (e.key==="Enter") { e.target.blur(); }
              if (e.key==="Escape") { cancelledRef.current = true; e.target.blur(); }
            }}
            onBlur={commit}
          />
        ) : (
          <button onClick={startRename} className="text-sm text-zinc-200 flex-1 text-left hover:text-amber-300 truncate" style={{ minWidth:0 }}>{category.name}</button>
        )}
        <div className="flex items-center shrink-0">
          <button onClick={onMoveUp} disabled={index===0} className="text-zinc-600 hover:text-zinc-200 disabled:opacity-20 p-0.5"><ChevronUp className="w-3.5 h-3.5"/></button>
          <button onClick={onMoveDown} disabled={isLast} className="text-zinc-600 hover:text-zinc-200 disabled:opacity-20 p-0.5"><ChevronDown className="w-3.5 h-3.5"/></button>
        </div>
        <button onClick={onDelete} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
      </div>
      {recoloring && (
        <div className="mt-2 mb-1 px-1"><ColorPicker value={category.color} onChange={onRecolor} /></div>
      )}
    </div>
  );
}

function CategoryManagerModal({ open, onClose, categories, onAdd, onDelete, onRecolor, onRename, onReorder }) {
  const [tab, setTab] = useState("expense");
  const [name, setName] = useState("");
  const [newColor, setNewColor] = useState("emerald");
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const list = categories[tab];
  const reorderable = list.filter(c => c.name !== "Другое");
  const other = list.find(c => c.name === "Другое");

  function submit() {
    const n = name.trim();
    if (!n) return;
    if (list.some(c => c.name.toLowerCase()===n.toLowerCase())) return;
    onAdd(tab, { name:n, color:newColor });
    setName("");
  }
  function handleDrop(index) {
    if (dragIndex !== null && dragIndex !== index) onReorder(tab, dragIndex, index);
    setDragIndex(null); setDragOverIndex(null);
  }

  return (
    <Modal open={open} onClose={onClose} title="Категории доходов и расходов" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setTab("expense")} className={`py-2 rounded-xl text-sm font-medium border transition ${tab==="expense" ? "bg-rose-500/15 border-rose-500/30 text-rose-400" : "border-zinc-800 text-zinc-500"}`}>Расходы</button>
          <button onClick={() => setTab("income")} className={`py-2 rounded-xl text-sm font-medium border transition ${tab==="income" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "border-zinc-800 text-zinc-500"}`}>Доходы</button>
        </div>
        <div className="space-y-2 overflow-y-auto lq-scroll" style={{ maxHeight:300 }}>
          {reorderable.map((c, i) => (
            <CategoryRow
              key={c.name}
              category={c}
              index={i}
              isLast={i===reorderable.length-1}
              dragActive={dragIndex===i}
              dragOver={dragOverIndex===i && dragIndex!==null && dragIndex!==i}
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
              onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
              onMoveUp={() => onReorder(tab, i, i-1)}
              onMoveDown={() => onReorder(tab, i, i+1)}
              onDelete={() => onDelete(tab, c.name)}
              onRecolor={(col) => onRecolor(tab, c.name, col)}
              onRename={(newName) => onRename(tab, c.name, newName)}
            />
          ))}
          {other && (
            <div className="flex items-center gap-2 bg-zinc-950/30 border border-dashed border-zinc-800/60 rounded-lg px-2 py-2">
              <span style={{ width:16 }} className="shrink-0" />
              <span className="rounded-full shrink-0" style={{ width:16, height:16, backgroundColor: pal(other.color).hex }} />
              <span className="text-sm text-zinc-500 flex-1">{other.name}</span>
              <span className="text-xs text-zinc-700">всегда внизу</span>
            </div>
          )}
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

function DebtsCard({ state, onQuickRepay, collapsedMap, onToggle }) {
  const list = useMemo(() => debtsByPerson(state).filter(d => d.amount > 0), [state.transactions]);
  return (
    <CollapsibleCard id="finance-debts" title="Кто вам должен" collapsedMap={collapsedMap} onToggle={onToggle}>
      {list.length === 0 ? (
        <div className="text-sm text-zinc-500">Пока никто не должен — отметь операцию с типом «Долг», когда одолжишь кому-то денег.</div>
      ) : (
        <div className="space-y-1">
          {list.map(d => (
            <div key={d.person} className="flex items-center justify-between gap-3 py-2 border-b border-zinc-800/60 last:border-0">
              <span className="text-sm text-zinc-300 truncate flex items-center gap-2"><Users className="w-3.5 h-3.5 text-cyan-400 shrink-0"/>{d.person}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-data font-semibold text-cyan-400">{fmtMoney(d.amount)}</span>
                <Button size="sm" variant="secondary" onClick={() => onQuickRepay(d.person, d.amount)}>Вернули</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

function FinanceView({ state, actions }) {
  const [month, setMonth] = useState(monthKey(todayStr()));
  const [modalOpen, setModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const collapsedMap = state.uiPrefs && state.uiPrefs.collapsed;

  const monthTx = useMemo(() => state.transactions.filter(t => monthKey(t.date)===month), [state.transactions, month]);
  const income = monthTx.reduce((a,t) => {
    if (t.type==="income") return a + t.amount;
    if (savingsCountsAsIncome(t)) return a + t.amount;
    return a;
  }, 0);
  const expense = monthTx.filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
  const savingsDelta = monthTx.filter(savingsMovesBalance).reduce((a,t)=> a + (t.direction==="withdraw" ? -t.amount : t.amount), 0);
  const debtDelta = monthTx.filter(debtMovesBalance).reduce((a,t)=> a + (t.direction==="repay" ? -t.amount : t.amount), 0);
  const monthBalance = income - expense - savingsDelta - debtDelta;
  const totalSavings = useMemo(() => totalSavingsOf(state), [state.transactions]);
  const totalDebt = useMemo(() => totalDebtOf(state), [state.transactions]);
  const allTimeBalance = useMemo(() => state.transactions.reduce((a,t) => {
    if (t.type==="income") return a + t.amount;
    if (t.type==="expense") return a - t.amount;
    if (t.type==="savings") {
      let r = a;
      if (savingsCountsAsIncome(t)) r += t.amount;
      if (savingsMovesBalance(t)) r += (t.direction==="withdraw" ? t.amount : -t.amount);
      return r;
    }
    if (t.type==="debt" && debtMovesBalance(t)) return a + (t.direction==="repay" ? t.amount : -t.amount);
    return a;
  }, 0), [state.transactions]);
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
  function openQuickRepay(person, amount) { setEditing(null); setPrefill({ type:"debt", direction:"repay", person, amount }); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updateTransaction(editing.id, data); else actions.addTransaction(data);
    setModalOpen(false);
  }

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Учёт денег" title="Финансы" action={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setCatModalOpen(true)}><Palette className="w-4 h-4"/>Категории</Button>
          <Button onClick={openCreate}><Plus className="w-4 h-4"/>Добавить операцию</Button>
        </div>
      } />

      <MonthNav month={month} onChange={setMonth} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Доходы за месяц" value={fmtMoney(income)} icon={ArrowUpRight} tone="emerald" />
        <StatCard label="Расходы за месяц" value={fmtMoney(expense)} icon={ArrowDownRight} tone="rose" />
        <StatCard label="Баланс месяца" value={fmtMoney(monthBalance)} icon={Wallet} tone={monthBalance>=0 ? "emerald" : "rose"} />
        <StatCard label="Общий баланс" value={fmtMoney(allTimeBalance)} icon={DollarSign} tone="amber" />
        <StatCard label="Сбережения" value={fmtMoney(totalSavings)} icon={PiggyBank} tone="violet" />
        <StatCard label="Мне должны" value={fmtMoney(totalDebt)} icon={Users} tone="cyan" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CollapsibleCard id="finance-pie-expense" title="Расходы по категориям" collapsedMap={collapsedMap} onToggle={actions.toggleSection}>
          <ExpenseByCategoryPie transactions={state.transactions} month={month} categories={state.categories} />
        </CollapsibleCard>
        <CollapsibleCard id="finance-pie-distribution" title="Куда делись деньги за месяц" collapsedMap={collapsedMap} onToggle={actions.toggleSection}>
          <DistributionPie transactions={state.transactions} month={month} />
        </CollapsibleCard>
      </div>

      <CollapsibleCard id="finance-bar" title="Доходы, расходы и сбережения по месяцам" collapsedMap={collapsedMap} onToggle={actions.toggleSection}>
        <IncomeExpenseBar transactions={state.transactions} />
      </CollapsibleCard>

      <CollapsibleCard id="finance-balance-line" title="Баланс нарастающим итогом" collapsedMap={collapsedMap} onToggle={actions.toggleSection}>
        <BalanceLine transactions={state.transactions} />
      </CollapsibleCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CollapsibleCard id="finance-budgets" title={`Бюджеты на ${monthLabel(month).toLowerCase()}`} collapsedMap={collapsedMap} onToggle={actions.toggleSection}>
          <div className="divide-y divide-zinc-800">
            {Object.keys(state.budgets).map(cat => (
              <BudgetRow key={cat} category={cat} limit={state.budgets[cat]} spent={spentByCategory[cat]||0} onChange={(v) => actions.setBudget(cat, v)} />
            ))}
          </div>
        </CollapsibleCard>
        <DebtsCard state={state} onQuickRepay={openQuickRepay} collapsedMap={collapsedMap} onToggle={actions.toggleSection} />
      </div>

      <CollapsibleCard id="finance-transactions" title="Все операции" collapsedMap={collapsedMap} onToggle={actions.toggleSection}>
        <TransactionsTable transactions={state.transactions} categories={state.categories} onDelete={actions.deleteTransaction} onEdit={openEdit} />
      </CollapsibleCard>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Изменить операцию" : "Новая операция"}>
        <TransactionForm categories={state.categories} knownPersons={knownPersons} initial={editing || prefill} isEdit={!!editing} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
      <CategoryManagerModal open={catModalOpen} onClose={() => setCatModalOpen(false)} categories={state.categories} onAdd={actions.addCategory} onDelete={actions.deleteCategory} onRecolor={actions.recolorCategory} onRename={actions.renameCategory} onReorder={actions.reorderCategory} />
    </div>
  );
}

function RewardForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState(30);
  const [repeatable, setRepeatable] = useState(true);
  function submit() { if (!title.trim() || !cost) return; onSubmit({ title: title.trim(), cost: Number(cost)||0, repeatable }); }
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название награды</label>
        <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: Вечер за игрой" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Стоимость, золото</label>
        <div className="relative">
          <Coins className="w-4 h-4 text-amber-400 absolute" style={{ left:12, top:"50%", transform:"translateY(-50%)" }} />
          <input type="number" min="1" className={inputCls} style={{ paddingLeft:36 }} value={cost} onChange={e=>setCost(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
        <input type="checkbox" checked={repeatable} onChange={e=>setRepeatable(e.target.checked)} />
        Можно покупать многократно
      </label>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>Добавить</Button>
      </div>
    </div>
  );
}

function RewardCard({ reward, currency, onBuy, onDelete }) {
  const canAfford = currency >= reward.cost;
  const purchased = (reward.purchases||[]).length;
  const locked = !reward.repeatable && purchased>0;
  return (
    <Card className="p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-violet-500/15"><Gem className="w-5 h-5 text-violet-400"/></div>
        <button onClick={onDelete} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
      </div>
      <div className="text-sm font-semibold text-zinc-100 mb-1">{reward.title}</div>
      <div className="text-xs text-zinc-500 mb-4 flex items-center gap-1">{reward.repeatable ? <Repeat className="w-3 h-3"/> : <Lock className="w-3 h-3"/>}{reward.repeatable ? "Многоразовая" : (purchased>0 ? "Уже получена" : "Одноразовая")}</div>
      <div className="mt-auto flex items-center justify-between">
        <span className="flex items-center gap-1 text-amber-300 font-data text-sm"><Coins className="w-4 h-4"/>{reward.cost}</span>
        <Button size="sm" disabled={!canAfford || locked} onClick={onBuy}>{locked ? "Получено" : "Купить"}</Button>
      </div>
    </Card>
  );
}

function RewardsView({ state, actions }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);
  const allPurchases = useMemo(() => {
    const list = [];
    state.rewards.forEach(r => (r.purchases||[]).forEach(d => list.push({ title:r.title, date:d, cost:r.cost })));
    return list.sort((a,b) => b.date.localeCompare(a.date));
  }, [state.rewards]);

  useEffect(() => { setHistoryPage(1); }, [historyLimit, allPurchases.length]);
  const historyTotalPages = historyLimit===Infinity ? 1 : Math.max(1, Math.ceil(allPurchases.length/historyLimit));
  const historySafePage = Math.min(historyPage, historyTotalPages);
  const shownPurchases = historyLimit===Infinity ? allPurchases : allPurchases.slice((historySafePage-1)*historyLimit, historySafePage*historyLimit);

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Трать честно заработанное" title="Магазин наград" action={<Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4"/>Новая награда</Button>} />

      <Card className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center"><Coins className="w-6 h-6 text-amber-400"/></div>
        <div>
          <div className="text-xs text-zinc-500">Доступно золота</div>
          <div className="font-data text-2xl font-semibold text-amber-300">{state.profile.currency}</div>
        </div>
      </Card>

      {state.rewards.length === 0 ? (
        <EmptyState icon={Gem} title="Пока нет наград" subtitle="Придумай, чем побалуешь себя за выполненные квесты." action={<Button size="sm" onClick={() => setModalOpen(true)}>Добавить награду</Button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.rewards.map(r => <RewardCard key={r.id} reward={r} currency={state.profile.currency} onBuy={() => actions.purchaseReward(r.id)} onDelete={() => actions.deleteReward(r.id)} />)}
        </div>
      )}

      <Card className="p-5">
        <div className="text-sm font-semibold text-zinc-200 mb-3">История покупок</div>
        {allPurchases.length === 0 ? <div className="text-sm text-zinc-500">Пока пусто.</div> : (
          <>
            <div className="flex items-center gap-1.5 text-xs mb-3">
              <span className="text-zinc-500">Показать:</span>
              {LIMIT_OPTIONS.map(n => (
                <button key={n===Infinity?"all":n} onClick={() => setHistoryLimit(n)} className={`px-2 py-1 rounded-md ${historyLimit===n ? "bg-amber-500/15 text-amber-300" : "text-zinc-500 hover:text-zinc-300"}`}>{n===Infinity ? "Все" : n}</button>
              ))}
            </div>
            <div className="space-y-2">
              {shownPurchases.map((p,i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-zinc-800/60 pb-2 last:border-0 gap-2 flex-wrap">
                  <span className="text-zinc-300">{p.title}</span>
                  <span className="text-xs text-zinc-500 font-data">{fmtDateShort(p.date)}</span>
                  <span className="text-xs text-amber-300 font-data flex items-center gap-1"><Coins className="w-3 h-3"/>-{p.cost}</span>
                </div>
              ))}
            </div>
            <Pager page={historySafePage} limit={historyLimit} total={allPurchases.length} onChange={setHistoryPage} />
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Новая награда">
        <RewardForm onSubmit={(r) => { actions.addReward(r); setModalOpen(false); }} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}

/* ============================ SHELL: SIDEBAR / TOPBAR ============================ */

function Sidebar({ tab, onNavigate, open, onClose, state, onOpenSettings }) {
  const overall = overallOf(state);
  const content = (
    <div className="h-full flex flex-col bg-zinc-950 border-r border-zinc-800" style={{ width:256 }}>
      <div className="px-5 py-5 flex items-center gap-2.5 border-b border-zinc-800">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0" style={{ boxShadow:"0 0 16px rgba(245,158,11,0.4)" }}><Compass className="w-5 h-5 text-zinc-950" strokeWidth={2.5}/></div>
        <div className="font-display text-lg tracking-wide text-zinc-100">QuestLife</div>
        <button onClick={onClose} className="ml-auto md:hidden text-zinc-500 hover:text-zinc-200"><X className="w-5 h-5"/></button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto lq-scroll">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab===t.id;
          return (
            <button key={t.id} onClick={() => onNavigate(t.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition border ${active ? "bg-amber-500/10 text-amber-300 border-amber-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border-transparent"}`}>
              <Icon className="w-5 h-5" strokeWidth={active ? 2.3 : 2} />
              {t.label}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-zinc-800 space-y-1">
        <button onClick={onOpenSettings} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition"><Settings className="w-5 h-5"/>Настройки</button>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-data text-xs font-bold text-zinc-950 shrink-0">{overall.level}</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-zinc-300 truncate font-medium">{state.profile.name}</div>
            <ProgressBar value={overall.ratio} heightClass="h-1" />
          </div>
        </div>
      </div>
    </div>
  );
  return (
    <>
      <div className="hidden md:block shrink-0">{content}</div>
      {open && (
        <div className="fixed inset-0 md:hidden flex" style={{ zIndex:50 }}>
          <div className="absolute inset-0 bg-zinc-950/70" onClick={onClose} />
          <div className="relative">{content}</div>
        </div>
      )}
    </>
  );
}

function TopBar({ tab, onMenu, state }) {
  const titles = { hub:"Хаб", quests:"Квесты", habits:"Ежедневные привычки", spheres:"Сферы жизни", finance:"Финансы", rewards:"Награды", achievements:"Достижения" };
  return (
    <div className="sticky top-0 backdrop-blur bg-zinc-950/80 border-b border-zinc-800 px-4 md:px-8 py-4 flex items-center gap-4" style={{ zIndex:30 }}>
      <button onClick={onMenu} className="md:hidden text-zinc-400 hover:text-zinc-100"><Menu className="w-5 h-5"/></button>
      <h1 className="font-display text-xl tracking-wide text-zinc-100">{titles[tab]}</h1>
      <div className="ml-auto flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-1.5 text-amber-300 font-data text-sm"><Coins className="w-4 h-4"/>{state.profile.currency}</div>
      </div>
    </div>
  );
}

function LevelUpModal({ level, onClose }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex:55 }}>
      <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative lq-pop text-center">
        <div className="mx-auto w-28 h-28 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center mb-5" style={{ boxShadow:"0 0 60px rgba(245,158,11,0.5)" }}>
          <span className="font-display text-5xl text-zinc-950">{level}</span>
        </div>
        <div className="font-display text-3xl text-amber-300 tracking-wide mb-1">Новый уровень!</div>
        <div className="text-zinc-400 text-sm mb-6">Ты достиг {level} уровня. Так держать.</div>
        <Button onClick={onClose}>Продолжить</Button>
      </div>
    </div>
  );
}

function SettingsModal({ open, onClose, state, actions }) {
  const [name, setName] = useState(state.profile.name);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setName(state.profile.name); }, [state.profile.name, open]);
  useEffect(() => { if (!open) { setShowExport(false); setShowImport(false); setImportText(""); setImportMsg(""); setCopied(false); } }, [open]);

  const exportText = showExport ? JSON.stringify(state, null, 2) : "";

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setCopied(false);
    }
  }

  function applyImport(raw) {
    try {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.spheres) && Array.isArray(data.quests)) {
        actions.replaceState(normalizeState(data));
        setImportText(""); setShowImport(false); setImportMsg("");
      } else {
        setImportMsg("Не похоже на выгрузку LifeQuest — нет ожидаемых полей.");
      }
    } catch (err) {
      setImportMsg("Не получилось прочитать JSON — проверь, что вставлен текст целиком.");
    }
  }
  function importFromFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyImport(reader.result);
    reader.readAsText(file);
  }

  return (
    <Modal open={open} onClose={onClose} title="Настройки">
      <div className="space-y-5">
        <div>
          <label className={labelCls}>Имя персонажа</label>
          <div className="flex gap-2">
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} />
            <Button variant="secondary" onClick={() => actions.updateProfile({ name })}>Сохранить</Button>
          </div>
        </div>
        <div className="border-t border-zinc-800 pt-4">
          <label className={labelCls}>Данные</label>
          <div className="text-xs text-zinc-600 mb-2">Прогресс и так сохраняется автоматически между сессиями. Это — на всякий случай, для ручного бэкапа или переноса.</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setShowExport(v => !v); setShowImport(false); }}>{showExport ? "Скрыть выгрузку" : "Выгрузить JSON"}</Button>
            <Button variant="secondary" size="sm" onClick={() => { setShowImport(v => !v); setShowExport(false); }}>{showImport ? "Скрыть вставку" : "Вставить JSON"}</Button>
            <label className="inline-flex items-center justify-center rounded-xl transition-colors duration-150 px-3 py-1.5 text-xs gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 cursor-pointer">
              Загрузить файл
              <input type="file" accept="application/json" style={{ display:"none" }} onChange={importFromFile} />
            </label>
          </div>
          {showExport && (
            <div className="mt-3">
              <textarea readOnly value={exportText} onClick={e => e.target.select()} onFocus={e => e.target.select()} className={inputCls + " font-data"} style={{ height:140, resize:"vertical" }} />
              <div className="flex items-center gap-2 mt-1.5">
                <Button variant="secondary" size="sm" onClick={copyExport}>{copied ? "Скопировано ✓" : "Скопировать"}</Button>
                <span className="text-xs text-zinc-600">Или выдели весь текст в поле и скопируй вручную.</span>
              </div>
            </div>
          )}
          {showImport && (
            <div className="mt-3">
              <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportMsg(""); }} placeholder="Вставь сюда скопированный JSON..." className={inputCls + " font-data"} style={{ height:140, resize:"vertical" }} />
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => applyImport(importText)}>Импортировать</Button>
                {importMsg && <span className="text-xs text-red-400">{importMsg}</span>}
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-zinc-800 pt-4">
          <label className="text-xs text-red-400/80 uppercase tracking-wide font-data mb-2 block">Опасная зона</label>
          {!confirmReset ? (
            <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>Сбросить все данные</Button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-400">Точно? Это необратимо.</span>
              <Button variant="danger" size="sm" onClick={() => { actions.resetAll(); setConfirmReset(false); onClose(); }}>Да, сбросить</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Отмена</Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* =================================== APP =================================== */

export default function App() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("hub");
  const [sphereFocus, setSphereFocus] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [levelUp, setLevelUp] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!cancelled) {
        if (raw) setState(normalizeState(JSON.parse(raw)));
        else setState(defaultState());
      }
    } catch (e) {
      if (!cancelled) setState(defaultState());
    } finally {
      if (!cancelled) setLoaded(true);
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded || !state) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* хранилище недоступно/переполнено */ }
    }, 350);
    return () => clearTimeout(t);
  }, [state, loaded]);

  // Держим отметку "получено" на достижениях в актуальном состоянии: как только условие
  // выполнено впервые — фиксируем дату. unlockedAt никогда не сбрасывается сам по себе.
  useEffect(() => {
    if (!loaded || !state) return;
    setState(prev => {
      let changed = false;
      const achievements = (prev.achievements||[]).map(a => {
        if (a.unlockedAt) return a;
        if (achievementProgress(a, prev).unlocked) { changed = true; return { ...a, unlockedAt: todayStr() }; }
        return a;
      });
      return changed ? { ...prev, achievements } : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, state && state.spheres, state && state.quests, state && state.habits, state && state.profile && state.profile.currency, state && state.transactions]);


  function pushToast(text, icon, undo) {
    const id = uid();
    setToasts(ts => [...ts, { id, text, icon, undo }]);
    setTimeout(() => setToasts(ts => ts.filter(t=>t.id!==id)), undo ? 6000 : 3200);
  }

  function handleUndo(id) {
    setToasts(ts => {
      const t = ts.find(x => x.id===id);
      if (t && t.undo) t.undo();
      return ts.filter(x => x.id!==id);
    });
  }

  function navigate(nextTab, focus) {
    setTab(nextTab);
    if (focus) setSphereFocus(focus);
    setNavOpen(false);
  }

  const actions = {
    addQuest(q) {
      setState(prev => ({ ...prev, quests: [{ id:uid(), status:"active", subtasks:[], createdAt:todayStr(), ...q }, ...prev.quests] }));
      pushToast("Квест создан", <ScrollText className="w-4 h-4 text-amber-400"/>);
    },
    updateQuest(id, patch) { setState(prev => ({ ...prev, quests: prev.quests.map(q => q.id===id ? { ...q, ...patch } : q) })); },
    deleteQuest(id) {
      setState(prev => {
        const removed = prev.quests.find(q => q.id===id);
        if (!removed) return prev;
        setTimeout(() => pushToast("Квест удалён", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, quests: [removed, ...p2.quests] }));
        }), 0);
        return { ...prev, quests: prev.quests.filter(q => q.id!==id) };
      });
    },
    toggleSubtask(questId, subId) {
      setState(prev => ({ ...prev, quests: prev.quests.map(q => q.id!==questId ? q : { ...q, subtasks: q.subtasks.map(s => s.id===subId ? { ...s, done: !s.done } : s) }) }));
    },
    completeQuest(id) {
      setState(prev => {
        const quest = prev.quests.find(q => q.id===id);
        if (!quest || quest.status!=="active") return prev;
        const prevLevel = overallOf(prev).level;
        const spheres = prev.spheres.map(s => s.id===quest.sphereId ? { ...s, xp: s.xp + (quest.rewardXp||0) } : s);
        const newLevel = levelFromXp(spheres.reduce((a,s)=>a+s.xp,0)).level;
        const sphereId = quest.sphereId, rewardXp = quest.rewardXp||0, rewardGold = quest.rewardGold||0;
        setTimeout(() => {
          pushToast(`Квест выполнен: +${rewardXp} XP, +${rewardGold} золота`, <Trophy className="w-4 h-4 text-amber-400"/>, () => {
            setState(p2 => ({
              ...p2,
              quests: p2.quests.map(q => q.id===id ? { ...q, status:"active", completedAt:null } : q),
              spheres: p2.spheres.map(s => s.id===sphereId ? { ...s, xp: Math.max(0, s.xp-rewardXp) } : s),
              profile: { ...p2.profile, currency: Math.max(0, p2.profile.currency-rewardGold) },
            }));
          });
          if (newLevel > prevLevel) setLevelUp(newLevel);
        }, 0);
        return { ...prev, quests: prev.quests.map(q => q.id===id ? { ...q, status:"done", completedAt:todayStr() } : q), spheres, profile: { ...prev.profile, currency: prev.profile.currency + rewardGold } };
      });
    },
    failQuest(id) { setState(prev => ({ ...prev, quests: prev.quests.map(q => q.id===id ? { ...q, status:"failed" } : q) })); },
    reopenQuest(id) { setState(prev => ({ ...prev, quests: prev.quests.map(q => q.id===id ? { ...q, status:"active" } : q) })); },

    addHabit(h) {
      setState(prev => ({ ...prev, habits: [{ id:uid(), logs:[], claimedDates:[], ...h }, ...prev.habits] }));
      pushToast("Привычка добавлена", <CheckSquare className="w-4 h-4 text-amber-400"/>);
    },
    deleteHabit(id) {
      setState(prev => {
        const removed = prev.habits.find(h => h.id===id);
        if (!removed) return prev;
        setTimeout(() => pushToast("Привычка удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, habits: [removed, ...p2.habits] }));
        }), 0);
        return { ...prev, habits: prev.habits.filter(h => h.id!==id) };
      });
    },
    updateHabit(id, patch) { setState(prev => ({ ...prev, habits: prev.habits.map(h => h.id===id ? { ...h, ...patch } : h) })); },
    toggleHabitToday(id) {
      // Наградa начисляется не более одного раза в день на привычку, даже если чекбокс
      // кликнули туда-обратно несколько раз — статус "выполнено" при этом переключается свободно.
      // Полный откат (с очисткой claimedDates) доступен только через "Отменить" в тосте сразу после отметки.
      setState(prev => {
        const t = todayStr();
        const prevLevel = overallOf(prev).level;
        let grantedNow = false;
        const habits = prev.habits.map(h => {
          if (h.id!==id) return h;
          const logs = h.logs || [];
          const claimed = h.claimedDates || [];
          const isDone = logs.includes(t);
          if (isDone) return { ...h, logs: logs.filter(d => d!==t) };
          const alreadyClaimed = claimed.includes(t);
          grantedNow = !alreadyClaimed;
          return { ...h, logs: [...logs, t], claimedDates: alreadyClaimed ? claimed : [...claimed, t] };
        });
        const habit = habits.find(h => h.id===id);
        let spheres = prev.spheres;
        let currency = prev.profile.currency;
        if (habit && grantedNow) {
          spheres = prev.spheres.map(s => s.id===habit.sphereId ? { ...s, xp: s.xp + 8 } : s);
          currency = currency + 3;
        }
        const newLevel = levelFromXp(spheres.reduce((a,s)=>a+s.xp,0)).level;
        if (grantedNow) {
          const sphereId = habit.sphereId;
          setTimeout(() => {
            pushToast("Привычка отмечена: +8 XP", <Flame className="w-4 h-4 text-orange-400"/>, () => {
              setState(p2 => ({
                ...p2,
                habits: p2.habits.map(h => h.id===id ? { ...h, logs:(h.logs||[]).filter(d=>d!==t), claimedDates:(h.claimedDates||[]).filter(d=>d!==t) } : h),
                spheres: p2.spheres.map(s => s.id===sphereId ? { ...s, xp: Math.max(0, s.xp-8) } : s),
                profile: { ...p2.profile, currency: Math.max(0, p2.profile.currency-3) },
              }));
            });
            if (newLevel > prevLevel) setLevelUp(newLevel);
          }, 0);
        }
        return { ...prev, habits, spheres, profile: { ...prev.profile, currency } };
      });
    },

    addSphere(s) { setState(prev => ({ ...prev, spheres: [...prev.spheres, { id:uid(), xp:0, ...s }] })); },
    updateSphere(id, patch) { setState(prev => ({ ...prev, spheres: prev.spheres.map(s => s.id===id ? { ...s, ...patch } : s) })); },
    deleteSphere(id) {
      setState(prev => {
        const inUse = prev.quests.some(q=>q.sphereId===id) || prev.habits.some(h=>h.sphereId===id);
        if (inUse) { setTimeout(() => pushToast("Нельзя удалить: есть связанные квесты или привычки", <Shield className="w-4 h-4 text-red-400"/>), 0); return prev; }
        const removed = prev.spheres.find(s => s.id===id);
        setTimeout(() => pushToast("Сфера удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, spheres: [...p2.spheres, removed] }));
        }), 0);
        return { ...prev, spheres: prev.spheres.filter(s => s.id!==id) };
      });
    },

    addTransaction(tx) { setState(prev => ({ ...prev, transactions: [{ id:uid(), ...tx }, ...prev.transactions] })); },
    updateTransaction(id, patch) { setState(prev => ({ ...prev, transactions: prev.transactions.map(t => t.id===id ? { ...t, ...patch } : t) })); },
    deleteTransaction(id) {
      setState(prev => {
        const removed = prev.transactions.find(t => t.id===id);
        if (!removed) return prev;
        setTimeout(() => pushToast("Операция удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, transactions: [removed, ...p2.transactions] }));
        }), 0);
        return { ...prev, transactions: prev.transactions.filter(t => t.id!==id) };
      });
    },
    setBudget(category, amount) { setState(prev => ({ ...prev, budgets: { ...prev.budgets, [category]: amount } })); },

    addCategory(type, cat) {
      setState(prev => {
        if (prev.categories[type].some(c => c.name.toLowerCase()===cat.name.toLowerCase())) return prev;
        return { ...prev, categories: { ...prev.categories, [type]: withOtherLast([...prev.categories[type], cat]) } };
      });
    },
    deleteCategory(type, name) {
      setState(prev => {
        if (name === "Другое") return prev;
        const removed = prev.categories[type].find(c => c.name===name);
        setTimeout(() => pushToast("Категория удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => (p2.categories[type].some(c=>c.name===name) ? p2 : { ...p2, categories: { ...p2.categories, [type]: withOtherLast([...p2.categories[type], removed]) } }));
        }), 0);
        return { ...prev, categories: { ...prev.categories, [type]: prev.categories[type].filter(c => c.name!==name) } };
      });
    },
    recolorCategory(type, name, color) {
      setState(prev => ({ ...prev, categories: { ...prev.categories, [type]: prev.categories[type].map(c => c.name===name ? { ...c, color } : c) } }));
    },
    renameCategory(type, oldName, newName) {
      const n = (newName||"").trim();
      setState(prev => {
        if (!n || oldName==="Другое" || oldName===n) return prev;
        if (prev.categories[type].some(c => c.name!==oldName && c.name.toLowerCase()===n.toLowerCase())) {
          setTimeout(() => pushToast("Такая категория уже есть", <AlertCircle className="w-4 h-4 text-red-400"/>), 0);
          return prev;
        }
        const budgetHasOld = type==="expense" && Object.prototype.hasOwnProperty.call(prev.budgets, oldName);
        let budgets = prev.budgets;
        if (budgetHasOld) {
          budgets = { ...prev.budgets };
          budgets[n] = budgets[oldName];
          delete budgets[oldName];
        }
        return {
          ...prev,
          categories: { ...prev.categories, [type]: prev.categories[type].map(c => c.name===oldName ? { ...c, name:n } : c) },
          transactions: prev.transactions.map(t => (t.type===type && t.category===oldName) ? { ...t, category:n } : t),
          budgets,
        };
      });
    },
    reorderCategory(type, fromIndex, toIndex) {
      setState(prev => {
        const list = prev.categories[type];
        if (!list[fromIndex] || list[fromIndex].name==="Другое") return prev;
        const next = list.slice();
        const [moved] = next.splice(fromIndex, 1);
        next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
        return { ...prev, categories: { ...prev.categories, [type]: withOtherLast(next) } };
      });
    },

    addAchievement(a) {
      setState(prev => ({ ...prev, achievements: [{ id:uid(), unlockedAt:null, ...a }, ...(prev.achievements||[])] }));
      pushToast("Достижение создано", <Award className="w-4 h-4 text-amber-400"/>);
    },
    deleteAchievement(id) {
      setState(prev => {
        const removed = (prev.achievements||[]).find(a => a.id===id);
        if (!removed) return prev;
        setTimeout(() => pushToast("Достижение удалено", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, achievements: [removed, ...(p2.achievements||[])] }));
        }), 0);
        return { ...prev, achievements: (prev.achievements||[]).filter(a => a.id!==id) };
      });
    },

    addReward(r) { setState(prev => ({ ...prev, rewards: [{ id:uid(), purchases:[], ...r }, ...prev.rewards] })); },
    deleteReward(id) {
      setState(prev => {
        const removed = prev.rewards.find(r => r.id===id);
        if (!removed) return prev;
        setTimeout(() => pushToast("Награда удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, rewards: [removed, ...p2.rewards] }));
        }), 0);
        return { ...prev, rewards: prev.rewards.filter(r => r.id!==id) };
      });
    },
    purchaseReward(id) {
      setState(prev => {
        const reward = prev.rewards.find(r => r.id===id);
        if (!reward || prev.profile.currency < reward.cost) { setTimeout(() => pushToast("Недостаточно золота", <Coins className="w-4 h-4 text-red-400"/>), 0); return prev; }
        setTimeout(() => pushToast(`Награда получена: ${reward.title}`, <Gem className="w-4 h-4 text-violet-400"/>), 0);
        return { ...prev, profile: { ...prev.profile, currency: prev.profile.currency - reward.cost }, rewards: prev.rewards.map(r => r.id===id ? { ...r, purchases:[...(r.purchases||[]), todayStr()] } : r) };
      });
    },

    resetAll() { setState(cleanState()); setTab("hub"); pushToast("Данные сброшены", <Sparkles className="w-4 h-4 text-amber-400"/>); },
    updateProfile(patch) { setState(prev => ({ ...prev, profile: { ...prev.profile, ...patch } })); },
    toggleSection(id, collapsed) {
      setState(prev => ({ ...prev, uiPrefs: { ...prev.uiPrefs, collapsed: { ...(prev.uiPrefs && prev.uiPrefs.collapsed), [id]: collapsed } } }));
    },
    replaceState(data) { setState(data); },
  };

  if (!loaded || !state) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <GlobalStyles />
        <div className="text-zinc-500 font-data text-sm">Загрузка мира...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-body text-zinc-100" style={{ backgroundImage:"radial-gradient(circle at 15% 0%, rgba(99,102,241,0.08), transparent 40%), radial-gradient(circle at 85% 15%, rgba(245,158,11,0.06), transparent 35%)" }}>
      <GlobalStyles />
      <div className="flex" style={{ minHeight:"100vh" }}>
        <Sidebar tab={tab} onNavigate={navigate} open={navOpen} onClose={() => setNavOpen(false)} state={state} onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar tab={tab} onMenu={() => setNavOpen(true)} state={state} />
          <main className="flex-1 px-4 md:px-8 py-6 w-full mx-auto" style={{ maxWidth:1180 }}>
            {tab==="hub" && <HubView state={state} actions={actions} navigate={navigate} />}
            {tab==="quests" && <QuestsView state={state} actions={actions} />}
            {tab==="habits" && <HabitsView state={state} actions={actions} />}
            {tab==="spheres" && <SpheresView state={state} actions={actions} focus={sphereFocus} setFocus={setSphereFocus} navigate={navigate} />}
            {tab==="finance" && <FinanceView state={state} actions={actions} />}
            {tab==="rewards" && <RewardsView state={state} actions={actions} />}
            {tab==="achievements" && <AchievementsView state={state} actions={actions} />}
          </main>
        </div>
      </div>
      <ToastStack toasts={toasts} onUndo={handleUndo} />
      {levelUp && <LevelUpModal level={levelUp} onClose={() => setLevelUp(null)} />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} state={state} actions={actions} />
    </div>
  );
}
