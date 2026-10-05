// Обмен частями сохранения: схемы разделов, сборка и разбор файла. Модель без разметки — что
// именно уезжает в файл, решается здесь, и здесь же проходит граница между справочной частью
// записи и личным прогрессом, который сохранение не покидает.

import { todayStr } from "../core/basics.js";
import { LIBRARY_KINDS, LIBRARY_KIND_ORDER } from "../library/constants.js";
import { collectionBranches, collectionRefs, refBranchId } from "../library/collections.js";

// выбранные записи выбранного раздела с выбранным набором полей — чтобы можно было передать
// другому человеку свою подборку книг, список продуктов или карточки людей.
//
// Принципы:
// • Выгружается только СПРАВОЧНАЯ часть записи. Личный прогресс и связи с остальным приложением
//   не покидают сохранение: XP и уровни, долги/переводы/квесты/привычки людей, прочитанные
//   страницы и часы, оценки-прогресс библиотеки. Их нет даже в списке необязательных полей —
//   это не настройка, а граница по смыслу (см. SHARE_EXCLUDED_NOTE у каждой схемы).
// • Статус элемента библиотеки принудительно приводится к "want" ("Хочу прочитать/поиграть/
//   посмотреть") — получателю передаётся рекомендация, а не чужая отметка о прохождении.
// • Обязательные поля (required) нельзя отключить: без них запись бессмысленна.
// • Файл самоописательный: раздел и версия внутри, поэтому импорт умеет отличить "не тот раздел"
//   от "испорченный файл" и сказать это человеку понятным текстом.

export const SHARE_FILE_APP = "questlife";
// Файлы, выгруженные до переименования, читаются по-прежнему: формат не изменился, изменилось
// только имя. Отвергать собственные старые выгрузки было бы обидной мелочью.
const SHARE_FILE_APP_LEGACY = "lifequest";
export function isOurFileApp(app) { return !app || app === SHARE_FILE_APP || app === SHARE_FILE_APP_LEGACY; }
const SHARE_FILE_VERSION = 1;

// Ключи, которые нужно скопировать для поля. Для библиотеки часть ключей относится только к
// своему виду (pagesTotal у книг и т.д.) — лишние просто отсутствуют в объекте и не копируются.
export const SHARE_SCHEMAS = {
  people: {
    id:"people", label:"Люди", stateKey:"people", itemLabel: (p) => p.name || "Без имени",
    excludedNote:"Долги, переводы, квесты, привычки, XP и уровень не выгружаются.",
    fields: [
      { id:"name",          label:"Имя",                    keys:["name"], required:true, default:true },
      // avatarImage — ссылка на картинку-аватар. Раньше её тут не было, и у человека с
      // загруженным аватаром в файл уезжали только цвет и иконка-заглушка.
      { id:"avatar",        label:"Аватар (эмодзи/иконка/картинка)", keys:["avatarEmoji","icon","color","avatarImage","avatarPos"], default:true },
      { id:"relation",      label:"Тип отношений",           keys:["relation"], default:false },
      { id:"birthday",      label:"День рождения",           keys:["birthday"], default:false },
      { id:"notes",         label:"Заметки",                 keys:["notes"], default:false },
      { id:"trackBirthday", label:"Отслеживание ДР",         keys:["trackBirthday"], default:false },
    ],
  },
  library: {
    id:"library", label:"Библиотека", itemLabel: (x) => x.title || "Без названия",
    excludedNote:"Прогресс (страницы, часы, серии, достижения) и оценка не выгружаются. Статус передаётся как «Хочу». Отмеченная коллекция везёт с собой все свои записи и структуру веток.",
    fields: [
      { id:"title",   label:"Название",                              keys:["title","displayTitle"], required:true, default:true },
      { id:"libKind", label:"Тип (книга/игра/фильм)",                 keys:["libKind","kind"], required:true, default:true },
      { id:"cover",   label:"Обложка",                                keys:["coverEmoji","coverImage","coverPos"], default:true },
      { id:"totals",  label:"Всего страниц / серий / достижений",     keys:["pagesTotal","episodesTotal","achievementsTotal"], default:true },
      { id:"sphere",  label:"Привязка к сфере",                       keys:["sphereId"], default:false },
      { id:"reward",  label:"Награда за завершение",                  keys:["impact","manualReward","rewardXp"], default:false },
      { id:"link",    label:"Ссылка на источник",                     keys:["productUrl"], default:false },
    ],
  },
  foods: {
    id:"foods", label:"Продукты", stateKey:"foods", itemLabel: (f) => f.name || "Без названия",
    excludedNote:"Выгружаются все параметры продукта.",
    fields: [
      { id:"name",   label:"Название",           keys:["name"], required:true, default:true },
      { id:"emoji",  label:"Эмодзи",             keys:["emoji"], default:true },
      { id:"macros", label:"КБЖУ на 100 г",      keys:["caloriesPer100","proteinPer100","fatPer100","carbsPer100"], default:true },
      { id:"piece",  label:"Вес одной штуки",    keys:["pieceWeight"], default:true },
    ],
  },
  dishes: {
    id:"dishes", label:"Блюда", stateKey:"dishes", itemLabel: (d) => d.name || "Без названия",
    // Блюдо ссылается на продукты по id, а у получателя эти id ничего не значат. Поэтому в файл
    // кладутся и сами использованные продукты, а при импорте они сопоставляются по названию:
    // совпавший продукт переиспользуется, недостающий создаётся. Иначе блюдо приезжало бы битым.
    excludedNote:"Продукты-ингредиенты выгружаются вместе с блюдом, чтобы состав не потерялся.",
    fields: [
      { id:"name",        label:"Название",     keys:["name"], required:true, default:true },
      { id:"emoji",       label:"Эмодзи",       keys:["emoji"], default:true },
      { id:"ingredients", label:"Состав",       keys:["ingredients"], required:true, default:true },
    ],
  },
};

export function shareDefaultFieldIds(sectionId) {
  const schema = SHARE_SCHEMAS[sectionId];
  return schema.fields.filter(f => f.required || f.default).map(f => f.id);
}

// Все записи раздела, доступные для выгрузки. Библиотека собирается из трёх массивов и получает
// служебный libKind, по которому импорт поймёт, в какой массив класть запись.
export function shareSectionItems(sectionId, state) {
  if (sectionId === "library") {
    const items = LIBRARY_KIND_ORDER.flatMap(k =>
      (state[LIBRARY_KINDS[k].stateKey] || []).map(x => ({ ...x, libKind:k }))
    );
    // Коллекции встают в тот же список отдельной категорией. Префикс в id нужен, чтобы ярлык
    // коллекции нельзя было спутать с записью: у них независимая нумерация.
    const collections = [...(state.libraryCollections || [])]
      .sort((a, b) => (a.order||0) - (b.order||0))
      .map(c => ({ id: `collection:${c.id}`, title: c.name, __collection: c }));
    return [...items, ...collections];
  }
  if (sectionId === "people") return (state.people || []).filter(p => !p.archived);
  return state[SHARE_SCHEMAS[sectionId].stateKey] || [];
}

/* Коллекция в списке выгрузки — не отдельная сущность, а ярлык на группу уже существующих
   записей библиотеки. Поэтому перед сборкой файла она РАСКРЫВАЕТСЯ в свои записи, и дальше это
   обычные записи раздела. Структура (ветки и их привязки) едет отдельным массивом рядом с
   items — ровно тем же приёмом, каким блюда возят с собой продукты.

   Ссылки внутри пакета — индексы, а не id: чужие id у получателя не значат ничего. */
function expandShareSelection(sectionId, selected, state) {
  const empty = { entries: selected, collections: [], membership: new Map() };
  if (sectionId !== "library") return empty;
  const picked = selected.filter(x => x.__collection).map(x => x.__collection);
  if (!picked.length) return empty;

  const entries = selected.filter(x => !x.__collection);
  const seen = new Set(entries.map(x => x.id));
  const membership = new Map();

  picked.forEach((c, ci) => {
    collectionRefs(state, c.id).forEach(r => {
      // Запись, отмеченную и отдельно, и в составе коллекции, кладём один раз — иначе у
      // получателя появится её дубль.
      if (!seen.has(r.item.id)) { entries.push({ ...r.item, libKind: r.libKind }); seen.add(r.item.id); }
      const bid = refBranchId(r.item, c);
      const bi = collectionBranches(c).findIndex(b => b.id === bid);
      membership.set(r.item.id, { collection: ci, branch: bi < 0 ? null : bi });
    });
  });

  const indexOfItem = new Map(entries.map((x, i) => [x.id, i]));
  const collections = picked.map(c => ({
    name: c.name,
    coverEmoji: c.coverEmoji || null,
    mainBranchName: c.mainBranchName || null,
    showProgress: c.showProgress !== false,
    branches: collectionBranches(c).map(b => ({
      name: b.name,
      anchor: b.anchorId && indexOfItem.has(b.anchorId) ? indexOfItem.get(b.anchorId) : null,
    })),
  }));
  return { entries, collections, membership };
}

/* Совпадения с уже имеющимся. Сверяем по названию, а не по id: id из чужого сохранения у нас
   ничего не значат, а одна и та же книга у двух людей называется одинаково.

   Сравниваются оба названия с обоими: у записи их два (настоящее и отображаемое), и человек мог
   завести её под одним, а прислать под другим. Вид записи должен совпадать — книга и фильм с
   одинаковым названием это разные вещи. */
export function shareDuplicateMatches(sectionId, items, state) {
  if (sectionId !== "library") return [];
  const norm = (v) => String(v || "").trim().toLowerCase();
  const namesOf = (x) => [norm(x.title), norm(x.displayTitle)].filter(Boolean);
  const pool = LIBRARY_KIND_ORDER.flatMap(k =>
    (state[LIBRARY_KINDS[k].stateKey] || []).map(item => ({ libKind: k, item, names: namesOf(item) })));
  const out = [];
  (items || []).forEach((it, index) => {
    const names = namesOf(it);
    if (!names.length) return;
    const hit = pool.find(p => p.libKind === it.libKind && p.names.some(n => names.includes(n)));
    if (hit) out.push({ index, incoming: it, existing: hit.item, libKind: hit.libKind });
  });
  return out;
}

// Чистая сборка файла: ничего не читает из внешнего мира, всё нужное приходит аргументами.
export function buildSharePayload(sectionId, items, fieldIds, state) {
  const schema = SHARE_SCHEMAS[sectionId];
  const active = schema.fields.filter(f => f.required || fieldIds.includes(f.id));
  const usedFoodIds = new Set();

  const { entries, collections, membership } = expandShareSelection(sectionId, items, state);

  const outItems = entries.map(item => {
    const out = {};
    active.forEach(f => {
      f.keys.forEach(k => {
        if (item[k] === undefined) return;
        out[k] = item[k];
      });
    });
    if (sectionId === "dishes" && Array.isArray(item.ingredients)) {
      item.ingredients.forEach(ing => { if (ing.foodId) usedFoodIds.add(ing.foodId); });
    }
    const m = membership.get(item.id);
    if (m) { out.collection = m.collection; out.branch = m.branch; }
    return out;
  });

  const payload = {
    app: SHARE_FILE_APP,
    kind: "share",
    section: sectionId,
    version: SHARE_FILE_VERSION,
    exportedAt: todayStr(),
    fields: active.map(f => f.id),
    items: outItems,
  };

  // Продукты, на которые ссылаются выгружаемые блюда — кладём рядом, а не внутрь блюда, чтобы
  // один и тот же продукт не дублировался в каждом блюде.
  if (collections.length) payload.collections = collections;

  if (sectionId === "dishes" && usedFoodIds.size) {
    payload.foods = (state.foods || [])
      .filter(f => usedFoodIds.has(f.id))
      .map(f => ({ id:f.id, name:f.name, emoji:f.emoji, caloriesPer100:f.caloriesPer100, proteinPer100:f.proteinPer100, fatPer100:f.fatPer100, carbsPer100:f.carbsPer100, pieceWeight:f.pieceWeight }));
  }
  return payload;
}

// Разбор и проверка файла. Возвращает { ok, items, foods, error } — текст ошибки уже готов к
// показу человеку, вызывающему коду не нужно ничего переформулировать.
export function parseSharePayload(text, expectedSection) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok:false, error:"Файл не читается: это не JSON." };
  }
  if (!data || typeof data !== "object") return { ok:false, error:"Файл пустой или повреждён." };
  // План кампании — соседний формат с тем же конвертом: отсылаем туда, где его ждут.
  if (data.kind === "campaign") return { ok:false, error:"Это план кампании. Его загружают на вкладке «Квесты» → «Кампании»." };
  if (!isOurFileApp(data.app) || data.kind !== "share") {
    // Полный бэкап из Настроек — частая и понятная ошибка, стоит отдельной подсказки.
    if (data.spheres && data.quests) return { ok:false, error:"Это полная выгрузка QuestLife. Её можно загрузить в Настройки → Данные." };
    return { ok:false, error:"Не похоже на файл обмена QuestLife." };
  }
  if (!SHARE_SCHEMAS[data.section]) return { ok:false, error:"Неизвестный раздел в файле." };
  if (data.section !== expectedSection) {
    return { ok:false, error:`Файл из раздела «${SHARE_SCHEMAS[data.section].label}», а загрузка идёт в «${SHARE_SCHEMAS[expectedSection].label}».` };
  }
  if ((data.version||1) > SHARE_FILE_VERSION) return { ok:false, error:"Файл создан более новой версией приложения." };
  if (!Array.isArray(data.items) || data.items.length === 0) return { ok:false, error:"В файле нет ни одной записи." };
  return { ok:true, items:data.items, foods: Array.isArray(data.foods) ? data.foods : [],
    collections: Array.isArray(data.collections) ? data.collections : [], section:data.section };
}

// Группировка списка для выбора. Пока осмысленна только для библиотеки (книги/игры/фильмы) —
// у остальных разделов записи однородные, и деление на группы было бы искусственным.
export function shareGroupsOf(sectionId, items) {
  if (sectionId !== "library") return null;
  return [
    ...LIBRARY_KIND_ORDER.map(k => ({ id:k, label:LIBRARY_KINDS[k].label, items: items.filter(i => i.libKind===k) })),
    { id:"collections", label:"Коллекции", items: items.filter(i => i.__collection) },
  ].filter(g => g.items.length > 0);
}
