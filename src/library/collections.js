// Коллекции библиотеки: объединение частей, сезонов и ответвлений одной истории поверх видов
// записей. Модель без разметки — на этот файл смотрят и интерфейс, и тесты.

import { uid } from "../core/basics.js";
import { LIBRARY_IMPACT, LIBRARY_KINDS, LIBRARY_KIND_ORDER, libraryItemTypeLabel, libraryTypePlural } from "./constants.js";

// Коллекция объединяет части, сезоны и ответвления одной истории — и делает это ПОВЕРХ видов
// записей: «Ведьмак» это книги, игры и сериал разом. Поэтому список коллекций лежит на верхнем
// уровне состояния, а не внутри books/games/movies.
//
// Структура ровно двухуровневая: коллекция → ветка → записи по порядку. Дерево произвольной
// вложенности потребовало бы защиты от циклов, как в папках заметок, а реальные франшизы двумя
// уровнями исчерпываются. Ветки живут ВНУТРИ объекта коллекции: отдельным списком верхнего уровня
// они осиротели бы при удалении коллекции, и за этим пришлось бы следить руками.
//
// Записи без ветки попадают в неявную «Основную линию» — у обычной трилогии веток нет вовсе, и
// заводить их ради неё не нужно.
export const COLLECTION_MAIN_BRANCH = "__main__";

export function collectionById(collections, id) { return (collections || []).find(c => c.id === id) || null; }
export function collectionBranches(collection) {
  return [...((collection && collection.branches) || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
}

// Все записи коллекции из всех трёх списков разом, в порядке следования.
export function collectionRefs(state, collectionId) {
  if (!collectionId) return [];
  const out = [];
  LIBRARY_KIND_ORDER.forEach(libKind => {
    const key = LIBRARY_KINDS[libKind].stateKey;
    (state[key] || []).forEach(item => { if (item.collectionId === collectionId) out.push({ libKind, item }); });
  });
  return out.sort((a, b) => (a.item.collectionOrder || 0) - (b.item.collectionOrder || 0));
}

// Ветка записи с самопочинкой: если ветку удалили, а запись про неё ещё помнит, она показывается
// в основной линии, а не пропадает из коллекции насовсем.
export function refBranchId(item, collection) {
  const known = ((collection && collection.branches) || []).some(b => b.id === item.branchId);
  return known ? item.branchId : COLLECTION_MAIN_BRANCH;
}

/* --- Привязка ветки к записи ---
   Ветка бывает двух родов. Параллельная (anchorId пуст) идёт рядом со всей коллекцией — так
   устроены «Игры» у «Ведьмака». Привязанная относится к КОНКРЕТНОЙ записи: спин-офф, раскрывающий
   события первого сезона, относится к первому сезону, а не к сериалу вообще, и в карточке второго
   сезона ему делать нечего.

   Привязка действует, только пока запись-якорь в этой коллекции. Убрали запись — ветка не
   пропадает, а поднимается на верхний уровень: терять содержимое из-за удаления одной записи
   нельзя. Тот же приём самопочинки, что у refBranchId с удалённой веткой. */
export function anchorIsValid(state, collection, anchorId) {
  if (!anchorId) return false;
  return collectionRefs(state, collection && collection.id).some(r => r.item.id === anchorId);
}
export function topLevelBranches(state, collection) {
  return collectionBranches(collection).filter(b => !anchorIsValid(state, collection, b.anchorId));
}
export function branchesAnchoredTo(state, collection, itemId) {
  if (!itemId) return [];
  return collectionBranches(collection).filter(b => b.anchorId === itemId);
}

// Все ветки внутри данной: её записи → привязанные к ним ветки → их записи и так далее.
// Ограничитель витков — страховка от испорченного руками сохранения с кольцом, как в folderPathOf.
export function branchSubtreeIds(state, collection, branchId) {
  const ids = [branchId];
  const refs = collectionRefs(state, collection && collection.id);
  const branches = collectionBranches(collection);
  let i = 0;
  while (i < ids.length && i < 256) {
    const bid = ids[i++];
    refs.filter(r => refBranchId(r.item, collection) === bid).forEach(r => {
      branches.forEach(b => { if (b.anchorId === r.item.id && !ids.includes(b.id)) ids.push(b.id); });
    });
  }
  return ids;
}
// Ветку нельзя привязать к записи, лежащей внутри неё самой: получится кольцо, обход по которому
// не завершается, и починить его через интерфейс уже нечем.
export function canAnchorBranch(state, collection, branchId, itemId) {
  if (!itemId) return true;
  const ref = collectionRefs(state, collection && collection.id).find(r => r.item.id === itemId);
  if (!ref) return false;
  return !branchSubtreeIds(state, collection, branchId).includes(refBranchId(ref.item, collection));
}
// То же кольцо с другой стороны: запись нельзя положить в ветку, которая к ней же и привязана.
export function canPlaceItemInBranch(state, collection, itemId, branchId) {
  if (!branchId || branchId === COLLECTION_MAIN_BRANCH) return true;
  const anchored = branchesAnchoredTo(state, collection, itemId);
  return !anchored.some(b => branchSubtreeIds(state, collection, b.id).includes(branchId));
}

// Дерево для показа коллекции: основная линия и параллельные ветки на верхнем уровне, привязанные
// — под своей записью. seen страхует отрисовку от кольца в чужих данных: ветка, уже встреченная на
// этом пути, второй раз не разворачивается.
export function collectionTree(state, collection) {
  const branches = collectionBranches(collection);
  const refs = collectionRefs(state, collection && collection.id);
  const inBranch = (bid) => refs.filter(r => refBranchId(r.item, collection) === bid);
  const seen = new Set();
  function node(id, name, implicit) {
    seen.add(id);
    return {
      id, name, implicit,
      refs: inBranch(id).map(r => ({
        ...r,
        branches: branches.filter(b => b.anchorId === r.item.id && !seen.has(b.id)).map(b => node(b.id, b.name, false)),
      })),
    };
  }
  const out = [node(COLLECTION_MAIN_BRANCH, branchNameOf(collection, COLLECTION_MAIN_BRANCH), true)];
  topLevelBranches(state, collection).forEach(b => { if (!seen.has(b.id)) out.push(node(b.id, b.name, false)); });
  return out;
}

export function branchNameOf(collection, branchId) {
  // Основная линия — ветка неявная, объекта у неё нет, поэтому её название лежит на самой
  // коллекции. Пустое значит «по умолчанию»: так переименование можно откатить, просто очистив
  // поле, и старые коллекции без этого поля продолжают работать.
  if (!branchId || branchId === COLLECTION_MAIN_BRANCH) {
    const own = collection && collection.mainBranchName && String(collection.mainBranchName).trim();
    return own || "Основная линия";
  }
  const b = collectionBranches(collection).find(x => x.id === branchId);
  return b ? b.name : "Основная линия";
}

/* Лента обложек в карточке записи: одна общая очередь, где ответвления выбранной записи вставлены
   сразу после неё — 1, 2, 2.1, 2.2, 3, 4. Переключились на третью — раскрывается уже она:
   1, 2, 3, 3.1, 4. Раскрыта всегда ровно одна запись, иначе лента разрастается и перестаёт быть
   очередью.

   Для ВЛОЖЕННОЙ записи опорной считается её родитель, а не она сама: открыв спин-офф, человек
   должен по-прежнему видеть очередь сезонов, из которой в него свернул, — иначе сериал пропадает
   из виду целиком. */
export function collectionStrip(state, collection, item) {
  if (!collection || !item) return [];
  const refs = collectionRefs(state, collection.id);
  const ownBranchId = refBranchId(item, collection);
  const ownBranch = collectionBranches(collection).find(b => b.id === ownBranchId);
  const anchorRef = ownBranch && ownBranch.anchorId ? refs.find(r => r.item.id === ownBranch.anchorId) : null;
  const pivot = anchorRef ? anchorRef.item : item;

  // Основная очередь — это вся коллекция: сначала основная линия, следом смежные ветки в том
  // порядке, в каком они заданы. Показывать только свою ветку было ошибкой: открыв игру из
  // «Ведьмака», человек терял из виду книги и сериал, ради связи с которыми коллекция и заводилась.
  const queue = [COLLECTION_MAIN_BRANCH, ...topLevelBranches(state, collection).map(b => b.id)];
  const out = [];
  queue.forEach(bid => {
    refs.filter(r => refBranchId(r.item, collection) === bid).forEach(r => {
      out.push({ ...r, branchId: bid, nested: false });
      if (r.item.id !== pivot.id) return;
      branchesAnchoredTo(state, collection, pivot.id).forEach(b => {
        refs.filter(x => refBranchId(x.item, collection) === b.id)
            .forEach(x => out.push({ ...x, branchId: b.id, nested: true }));
      });
    });
  });
  return out;
}

export function collectionKindCounts(state, collectionId) {
  const counts = new Map();
  collectionRefs(state, collectionId).forEach(r => {
    const label = libraryTypePlural(libraryItemTypeLabel(r.libKind, r.item));
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"));
}

export function buildImportedLibraryItem(it, k, today, sphereId) {
  return {
    id: uid(), title: it.title || "Без названия",
    displayTitle: it.displayTitle || null,
    coverEmoji: it.coverEmoji || LIBRARY_KINDS[k].defaultEmoji,
    coverImage: it.coverImage || null,
    coverPos: it.coverPos || null,
    // Прогресс, оценка и заметки — личное: у получателя они начинаются с нуля, а статус со «Хочу».
    status: "want", rating: 0, notes: [], tracked: false,
    sphereId: sphereId || null,
    impact: it.impact || "noticeable",
    manualReward: !!it.manualReward,
    rewardXp: typeof it.rewardXp === "number" ? it.rewardXp : LIBRARY_IMPACT.noticeable.xp,
    productUrl: it.productUrl || "",
    createdAt: today,
    pagesRead: 0, pagesTotal: it.pagesTotal || 0,
    hours: 0, achievementsGot: 0, achievementsTotal: it.achievementsTotal || 0,
    kind: k === "movie" ? (it.kind === "series" ? "series" : "movie") : undefined,
    episodesTotal: it.episodesTotal || 0, episodeAt: 0,
  };
}

export function collectionProgress(state, collectionId) {
  const refs = collectionRefs(state, collectionId);
  return { done: refs.filter(r => r.item.status === "done").length, total: refs.length };
}

// Коллекция записи. Возвращает null и на «не в коллекции», и на ссылку в никуда (так выглядит
// запись, приехавшая импортом из чужого сохранения) — карточка в обоих случаях покажет одно и то же.
export function itemCollection(state, item) {
  return item && item.collectionId ? collectionById(state.libraryCollections, item.collectionId) : null;
}

export function nextCollectionOrder(state, collectionId, branchId, collection) {
  const bid = branchId || COLLECTION_MAIN_BRANCH;
  const refs = collectionRefs(state, collectionId).filter(r => refBranchId(r.item, collection) === bid);
  return refs.length ? Math.max(...refs.map(r => r.item.collectionOrder || 0)) + 1 : 0;
}

// Номера для пачки записей, добавляемых в ветку разом. Смещение берётся из позиции в выборе, а не
// из бегущего счётчика: так порядок в ветке повторяет порядок, в котором записи отмечали, и не
// зависит от того, в каких списках состояния они лежат.
export function addToBranchPatches(state, collection, collectionId, branchId, refs) {
  const start = nextCollectionOrder(state, collectionId, branchId, collection);
  return (refs || []).map((r, i) => ({ libKind: r.libKind, id: r.id, collectionOrder: start + i }));
}

// Перенумерация ветки после перетаскивания. Записи лежат в трёх разных списках состояния, поэтому
// возвращается плоский список правок, а не готовый массив: собрать его обратно может только тот,
// кто знает, в какой список какую запись класть.
export function assignBranchOrder(refs) {
  return refs.map((r, i) => ({ libKind: r.libKind, id: r.item.id, collectionOrder: i }));
}

// Перестановка списка: перемещаемый элемент встаёт ПЕРЕД целевым, beforeId === null означает
// «в конец». Одна реализация на записи и на ветки — правила одинаковые, а расходиться им незачем.
export function reorderBy(list, idOf, movedId, beforeId) {
  // Бросок на самого себя — обычное дело при промахе мышью. Без этой проверки элемент уезжал бы
  // в конец: сам себя в списке-без-себя он, разумеется, не находит.
  if (movedId === beforeId) return list;
  const from = list.findIndex(x => idOf(x) === movedId);
  if (from < 0) return list;
  const moved = list[from];
  const rest = list.filter(x => idOf(x) !== movedId);
  if (!beforeId) return [...rest, moved];
  const at = rest.findIndex(x => idOf(x) === beforeId);
  if (at < 0) return [...rest, moved];
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}
export function reorderRefs(refs, movedId, beforeId) { return reorderBy(refs, r => r.item.id, movedId, beforeId); }
export function reorderBranchList(branches, movedId, beforeId) { return reorderBy(branches, b => b.id, movedId, beforeId); }
