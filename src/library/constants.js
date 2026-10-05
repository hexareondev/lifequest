// Библиотека: словари видов, статусов и значимости плюс мелкие чистые помощники, которые читают
// ровно эти словари — подписи, потолки прогресса, сортировка. Разметки здесь нет намеренно: на
// этот файл смотрят и интерфейс, и тесты, а тесты падают на разборе JSX.

import { BookOpen, Clapperboard, Gamepad2 } from "lucide-react";
import { clamp } from "../core/basics.js";

// Три независимых массива состояния (books/games/movies) — не одна полиморфная коллекция,
// у сущностей слишком разный набор полей. LIBRARY_KINDS — конфиг-паспорт на каждый вид,
// чтобы формы/карточки/экшены были одним общим кодом, а не тройным дублированием.
export const LIBRARY_KINDS = {
  book:  { stateKey:"books",  label:"Книги",  singular:"Книга",  icon:BookOpen,      defaultEmoji:"📚" },
  game:  { stateKey:"games",  label:"Игры",   singular:"Игра",   icon:Gamepad2,      defaultEmoji:"🎮" },
  movie: { stateKey:"movies", label:"Фильмы", singular:"Фильм",  icon:Clapperboard,  defaultEmoji:"🎬" },
};
export const LIBRARY_KIND_ORDER = ["book","game","movie"];
// "buy" — отдельный статус, а не пометка поверх "want": вещь, которую ещё надо купить, не то же
// самое, что вещь, лежащая в списке «начать». Такие элементы попадают в выбор наград (Магазин),
// а покупка награды переводит их в "want" — «куплено, теперь можно браться». Порядок статусов
// заодно задаёт и порядок сортировки «по статусу», поэтому "buy" стоит первым.
export const LIBRARY_STATUS_ORDER = ["buy","want","active","done","dropped"];
export const LIBRARY_STATUS_LABELS = {
  book:  { buy:"Хочу купить", want:"Хочу прочитать",  active:"Читаю",  done:"Прочитано",  dropped:"Брошено" },
  game:  { buy:"Хочу купить", want:"Хочу поиграть",   active:"Играю",  done:"Пройдено",   dropped:"Брошено" },
  movie: { buy:"Хочу купить", want:"Хочу посмотреть", active:"Смотрю", done:"Посмотрено", dropped:"Брошено" },
};
export const LIBRARY_STATUS_COLOR = { buy:"violet", want:"sky", active:"amber", done:"emerald", dropped:"zinc" };
// Опыт за завершение — уровнями значимости, тот же принцип, что DIFFICULTY у квестов (те же
// цифры XP, чтобы экономика не разъезжалась между разделами), а не произвольное число руками.
export const LIBRARY_IMPACT = {
  minor:      { label:"Незначительно", xp:15  },
  noticeable: { label:"Заметно",       xp:35  },
  major:      { label:"Существенно",   xp:70  },
  landmark:   { label:"Знаковое",      xp:150 },
};

export function libraryStatusLabel(kind, status) { return (LIBRARY_STATUS_LABELS[kind] && LIBRARY_STATUS_LABELS[kind][status]) || status; }

// Подпись вида записи. Для кино вид хранится в САМОЙ записи (kind: "movie" | "series"), а не в
// разделе, поэтому LIBRARY_KINDS.singular тут недостаточен — он всегда «Фильм», и сериал
// подписывался фильмом. Знание об этом собрано здесь, чтобы не расползаться тернарником по
// карточкам, спискам и виджетам, как было раньше.
export function libraryItemTypeLabel(libKind, item) {
  if (libKind === "movie") return item && item.kind === "series" ? "Сериал" : "Фильм";
  const meta = LIBRARY_KINDS[libKind];
  return meta ? meta.singular : "Запись";
}
// Хвост «· серия 4/10» — только у сериалов и только когда просмотр начат.
export function librarySeriesSuffix(item) {
  if (!item || item.kind !== "series" || !(item.episodeAt > 0)) return "";
  return ` · серия ${item.episodeAt}${item.episodesTotal > 0 ? `/${item.episodesTotal}` : ""}`;
}

// "Отображаемое название" — если задано, показывается вместо настоящего везде в UI (алфавитная
// сортировка тоже по нему — сортируем по тому, что реально видно). Настоящее title всегда
// сохраняется отдельно (автоподгружается поиском по источникам, как и раньше) и просто уходит на
// второй план мелким текстом, где для этого есть место.
export function libraryDisplayTitle(item) {
  return (item.displayTitle && item.displayTitle.trim()) || item.title;
}

// Пары "прогресс / объявленный максимум". Прочитанных страниц не может быть больше, чем есть в
// книге, серий — чем в сериале, ачивок — чем их в игре. Часы в игре в таблицу не входят
// намеренно: у наигранного времени потолка нет.
export const LIBRARY_PROGRESS_CAPS = {
  book:  [["pagesRead", "pagesTotal"]],
  game:  [["achievementsGot", "achievementsTotal"]],
  movie: [["episodeAt", "episodesTotal"]],
};
// Капание живёт здесь и вызывается из updateLibraryItem — единой точки входа. Повторять правило
// в ручном вводе, QuickAddButtons, кнопке "+1" на Хабе и в карточке привычки чтения по
// отдельности значило бы гарантированно забыть его в следующем месте, откуда прогресс меняют.
export function clampLibraryProgress(kind, item, patch) {
  const pairs = LIBRARY_PROGRESS_CAPS[kind];
  if (!pairs || !item || !patch) return patch;
  const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);
  let out = patch;
  pairs.forEach(([field, totalField]) => {
    if (!has(field) && !has(totalField)) return;
    // Максимум берём из патча, если он меняется тем же действием (форма присылает оба поля
    // разом): при уменьшении общего числа страниц прогресс обязан поехать вниз вместе с ним,
    // иначе книга навсегда останется "180 из 100" без единого способа это поправить.
    const total = has(totalField) ? (Number(patch[totalField]) || 0) : (Number(item[totalField]) || 0);
    const raw = has(field) ? (Number(patch[field]) || 0) : (Number(item[field]) || 0);
    // Максимум не задан (0 = "?") — капать не по чему, остаётся только защита от минуса.
    const capped = total > 0 ? clamp(raw, 0, total) : Math.max(0, raw);
    if (has(field) || capped !== raw) out = { ...out, [field]: capped };
  });
  return out;
}

// Множественное число для подписи состава. Считаем по ВИДУ ЗАПИСИ, а не по разделу: сериалы
// лежат в списке фильмов, и «фильмы: 3» про коллекцию из трёх сезонов — неправда.
export const LIBRARY_TYPE_PLURALS = { "Книга": "книги", "Игра": "игры", "Фильм": "фильмы", "Сериал": "сериалы", "Запись": "записи" };
export function libraryTypePlural(label) { return LIBRARY_TYPE_PLURALS[label] || String(label || "").toLowerCase(); }

// Прогресс библиотечной записи для полоски в карточке. Берётся из той же таблицы пар
// "прогресс/максимум", по которой прогресс капается при вводе — второго списка полей не заводим.
export function libraryProgressOf(libKind, item) {
  const pairs = LIBRARY_PROGRESS_CAPS[libKind] || [];
  for (const [field, totalField] of pairs) {
    const total = Number(item[totalField]) || 0;
    const value = Number(item[field]) || 0;
    if (total > 0) return { value, total, ratio: clamp(value / total, 0, 1) };
  }
  return null;
}

export const LIBRARY_SORT_COMMON = [
  { id:"created_desc", label:"Дата добавления (новые)" },
  { id:"created_asc",  label:"Дата добавления (старые)" },
  { id:"title_asc",    label:"Алфавит (А-Я)" },
  { id:"title_desc",   label:"Алфавит (Я-А)" },
  { id:"rating_desc",  label:"Оценка (высокая)" },
  { id:"rating_asc",   label:"Оценка (низкая)" },
];
// Ключи сортировки: общие для всех трёх разделов плюс пара специфичных для книг и игр
// (прогресс/часы). Список ключей и их разбор лежат рядом намеренно — ключ, добавленный в список
// и забытый в switch, молча даёт сортировку по умолчанию.
export const LIBRARY_SORT_EXTRA = {
  book:  [{ id:"progress_desc", label:"Прогресс чтения" }],
  game:  [{ id:"hours_desc", label:"Часы" }, { id:"achievements_desc", label:"Прогресс ачивок" }],
  movie: [],
};

export function sortLibraryItems(items, sortKey) {
  const arr = items.slice();
  switch (sortKey) {
    case "created_asc":  return arr.sort((a,b) => a.createdAt.localeCompare(b.createdAt));
    case "title_asc":    return arr.sort((a,b) => libraryDisplayTitle(a).localeCompare(libraryDisplayTitle(b), "ru"));
    case "title_desc":   return arr.sort((a,b) => libraryDisplayTitle(b).localeCompare(libraryDisplayTitle(a), "ru"));
    case "rating_desc":  return arr.sort((a,b) => (b.rating||0)-(a.rating||0));
    case "rating_asc":   return arr.sort((a,b) => (a.rating||0)-(b.rating||0));
    case "status":       return arr.sort((a,b) => LIBRARY_STATUS_ORDER.indexOf(a.status)-LIBRARY_STATUS_ORDER.indexOf(b.status));
    case "progress_desc": {
      const pct = x => x.pagesTotal>0 ? x.pagesRead/x.pagesTotal : -1;
      return arr.sort((a,b) => pct(b)-pct(a));
    }
    case "hours_desc":        return arr.sort((a,b) => (b.hours||0)-(a.hours||0));
    case "achievements_desc": {
      const pct = x => x.achievementsTotal>0 ? x.achievementsGot/x.achievementsTotal : -1;
      return arr.sort((a,b) => pct(b)-pct(a));
    }
    case "created_desc":
    default: return arr.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
}

// В списке показываем отображаемое название (то же, что видно в самой Библиотеке), а настоящее —
// мелкой строкой под ним. Переключателя «какое показать» нет намеренно: видны сразу оба, и не
// приходится гадать, в каком режиме сейчас список.
export function libraryPickerItem(item) {
  const shown = libraryDisplayTitle(item);
  return { id: item.id, name: shown, alt: shown === item.title ? null : item.title };
}
