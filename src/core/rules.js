// Правила начисления: сколько даёт квест за сложность и какие бывают степени важности. Цифры
// живут в одном месте — на них смотрят и квесты, и кампании, и привязанные привычки.

export const DIFFICULTY = {
  easy:   { label:"Лёгкий",    xp:15,  gold:5,  pips:1 },
  medium: { label:"Средний",   xp:35,  gold:15, pips:2 },
  hard:   { label:"Сложный",   xp:70,  gold:30, pips:3 },
  epic:   { label:"Эпический", xp:150, gold:75, pips:4 },
};
// За сколько дней до ДР появляется авто-квест "Поздравить" (ТЗ «Календарь», раздел 2.1).
export const BIRTHDAY_QUEST_LEAD_DAYS = 7;
export const PRIORITY = {
  low:      { label:"Низкий",      color:"zinc"   },
  medium:   { label:"Средний",     color:"sky"    },
  high:     { label:"Высокий",     color:"orange" },
  critical: { label:"Критический", color:"red"    },
};
