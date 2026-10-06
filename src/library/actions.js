// Действия раздела «Библиотека»: книги, игры, фильмы, заметки к ним, цель по чтению и коллекции.
// Устроены как действия финансов — см. finance/actions.js. Дополнительно получают setLevelUp:
// завершение записи может поднять уровень, и App показывает об этом окно.

import { todayStr, uid } from "../core/basics.js";
import { insertAt } from "../core/lists.js";
import { defaultLibraryPrefs, defaultLibrarySources } from "../core/prefs.js";
import { levelFromXp, overallOf } from "../core/xp.js";
import { isReadingGoalActiveOn } from "../habits/model.js";
import { addToBranchPatches, canAnchorBranch, collectionById, nextCollectionOrder } from "./collections.js";
import {
  LIBRARY_KINDS, LIBRARY_KIND_ORDER, clampLibraryProgress, libraryDisplayTitle,
} from "./constants.js";
import { AlertCircle, BookOpen, Layers, Target, Trash2, Trophy, X } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function libraryActions({ setState, commit, pushToast, setLevelUp }) {
  return {
    // Один набор экшенов на все три вида (kind: "book"|"game"|"movie"), stateKey берётся из
    // LIBRARY_KINDS — не дублировать по три копии каждого действия.
    addLibraryItem(kind, data) {
      // id и дата всюду считаются ДО функции обновления: React вправе прогнать её дважды.
      const key = LIBRARY_KINDS[kind].stateKey, id = uid(), today = todayStr();
      setState(prev => ({ ...prev, [key]: [{ id, rating:0, notes:[], sphereId:null, rewardXp:0, status:"want", tracked:false, createdAt:today, ...data }, ...prev[key]] }));
      pushToast("Добавлено в библиотеку", toastIcon(BookOpen, "text-amber-400"));
    },

    updateLibraryItem(kind, id, patch) {
      const key = LIBRARY_KINDS[kind].stateKey, d = todayStr(), logId = uid();
      setState(prev => {
        const item = prev[key].find(x => x.id===id);
        // Прогресс не может превысить объявленный максимум (страницы/серии/ачивки) — капаем
        // здесь, в единой точке входа, чтобы правило работало одинаково откуда угодно.
        const finalPatch = clampLibraryProgress(kind, item, patch);
        // Просмотрено/прочитано/пройдено ИЛИ брошено — больше не "сейчас отслеживаю". Снимаем и
        // для "dropped" тоже: иначе глазик у брошенного скрыт, а слот из пятёрки отслеживаемых
        // так и останется занят без возможности его освободить. Единая точка входа — работает
        // одинаково что через выпадающий статус, что через кнопку "Завершить".
        const finalPatch2 = ((finalPatch.status==="done" || finalPatch.status==="dropped") && item && item.tracked) ? { ...finalPatch, tracked:false } : finalPatch;
        let readingLog = prev.readingLog;
        // Книга с активной целью по чтению + меняется pagesRead — попутно логируем дельту на
        // сегодня (нужно для дневной разбивки авто-цели чтения). Единая точка входа: что бы ни
        // меняло pagesRead — ручной ввод, QuickAddButtons, кнопка "+N" в карточке привычки — все
        // идут через это же действие, так что дневник страниц не может разъехаться с реальным
        // прогрессом книги.
        if (kind==="book" && item && Object.prototype.hasOwnProperty.call(finalPatch2, "pagesRead") && isReadingGoalActiveOn(item.readingGoal, d)) {
          const delta = (Number(finalPatch2.pagesRead)||0) - (item.pagesRead||0);
          if (delta !== 0) {
            const existing = (readingLog||[]).find(e => e.bookId===id && e.date===d);
            readingLog = existing
              ? (readingLog||[]).map(e => e.id===existing.id ? { ...e, pages: Math.max(0, (e.pages||0)+delta) } : e)
              : [{ id:logId, bookId:id, date:d, pages: Math.max(0, delta) }, ...(readingLog||[])];
          }
        }
        return { ...prev, [key]: prev[key].map(x => x.id===id ? { ...x, ...finalPatch2 } : x), readingLog };
      });
    },

    // Цель по чтению книги: дочитать к endDate по pagesPerDay страниц/день. startDate всегда
    // "сегодня" (форма спрашивает только дату дедлайна и норму — так же просто, как задумано).
    setBookReadingGoal(bookId, { endDate, pagesPerDay }) {
      const today = todayStr();
      setState(prev => ({ ...prev, books: (prev.books||[]).map(b => b.id===bookId ? { ...b, readingGoal: { startDate: today, endDate, pagesPerDay: Number(pagesPerDay)||0 } } : b) }));
      pushToast("Цель по чтению задана", toastIcon(Target, "text-amber-400"));
    },

    clearBookReadingGoal(bookId) {
      setState(prev => ({ ...prev, books: (prev.books||[]).map(b => b.id===bookId ? { ...b, readingGoal: null } : b) }));
    },

    // "Отслеживаемое" — прежде "избранное", тот же лимит на 5 сразу (проверяется на уровне UI,
    // LibrarySectionView). Особое правило: включить слежение у "хочу посмотреть" сразу переводит в
    // "смотрю" (наблюдать что-то ещё не начатое странно) — обратного перехода при снятии слежения
    // нет, статус просто остаётся как есть.
    setTracked(kind, id, value) {
      const key = LIBRARY_KINDS[kind].stateKey;
      setState(prev => ({
        ...prev,
        [key]: prev[key].map(x => {
          if (x.id!==id) return x;
          const next = { ...x, tracked:value };
          if (value && (next.status==="want" || next.status==="buy")) next.status = "active";
          return next;
        }),
      }));
    },

    // Заменить одно отслеживаемое на другое одним атомарным действием (для окна "уже 5"). Считаем
    // со старого массива по ходу, поэтому корректно работает и когда оба — один вид.
    swapTracked(oldKind, oldId, newKind, newId) {
      setState(prev => {
        const next = { ...prev };
        const oldKey = LIBRARY_KINDS[oldKind].stateKey;
        next[oldKey] = next[oldKey].map(x => x.id===oldId ? { ...x, tracked:false } : x);
        const newKey = LIBRARY_KINDS[newKind].stateKey;
        next[newKey] = next[newKey].map(x => {
          if (x.id!==newId) return x;
          const upd = { ...x, tracked:true };
          if (upd.status==="want" || upd.status==="buy") upd.status = "active";
          return upd;
        });
        return next;
      });
    },

    deleteLibraryItem(kind, id) {
      const key = LIBRARY_KINDS[kind].stateKey;
      commit((prev, defer) => {
        const removedIdx = prev[key].findIndex(x => x.id===id);
        const removed = prev[key][removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Запись удалена", toastIcon(Trash2, "text-zinc-400"), () => {
          setState(p2 => ({ ...p2, [key]: insertAt(p2[key], removedIdx, removed) }));
        }));
        return { ...prev, [key]: prev[key].filter(x => x.id!==id) };
      });
    },

    // "Завершить" — единственный способ получить XP (обычная смена статуса через селект его не
    // даёт, во избежание повторного начисления при ручном туда-сюда). Тот же паттерн полного
    // отменяемого начисления, что и у completeQuest.
    completeLibraryItem(kind, id) {
      const key = LIBRARY_KINDS[kind].stateKey;
      commit((prev, defer) => {
        const item = prev[key].find(x => x.id===id);
        if (!item || item.status==="done") return prev;
        const prevStatus = item.status;
        const prevTracked = !!item.tracked;
        const prevLevel = overallOf(prev).level;
        const rewardXp = item.rewardXp||0, sphereId = item.sphereId;
        const spheres = sphereId ? prev.spheres.map(s => s.id===sphereId ? { ...s, xp: s.xp + rewardXp } : s) : prev.spheres;
        const newLevel = levelFromXp(spheres.reduce((a,s)=>a+s.xp,0)).level;
        defer(() => {
          pushToast(rewardXp ? `Отмечено как завершённое: +${rewardXp} XP` : "Отмечено как завершённое", toastIcon(Trophy, "text-amber-400"), () => {
            setState(p2 => ({
              ...p2,
              [key]: p2[key].map(x => x.id===id ? { ...x, status: prevStatus, tracked: prevTracked } : x),
              spheres: sphereId ? p2.spheres.map(s => s.id===sphereId ? { ...s, xp: Math.max(0, s.xp-rewardXp) } : s) : p2.spheres,
            }));
          });
          if (newLevel > prevLevel) setLevelUp(newLevel);
        });
        // Просмотрено/прочитано/пройдено больше не "сейчас отслеживаю" — снимаем автоматически.
        return { ...prev, [key]: prev[key].map(x => x.id===id ? { ...x, status:"done", tracked:false } : x), spheres };
      });
    },

    addLibraryNote(kind, id, text) {
      const key = LIBRARY_KINDS[kind].stateKey, noteId = uid(), today = todayStr();
      setState(prev => ({ ...prev, [key]: prev[key].map(x => x.id===id ? { ...x, notes:[...(x.notes||[]), { id:noteId, text, date:today }] } : x) }));
    },

    updateLibraryNote(kind, id, noteId, text) {
      const key = LIBRARY_KINDS[kind].stateKey;
      setState(prev => ({ ...prev, [key]: prev[key].map(x => x.id===id
        ? { ...x, notes:(x.notes||[]).map(n => n.id===noteId ? { ...n, text } : n) } : x) }));
    },

    deleteLibraryNote(kind, id, noteId) {
      const key = LIBRARY_KINDS[kind].stateKey;
      setState(prev => ({ ...prev, [key]: prev[key].map(x => x.id===id ? { ...x, notes:(x.notes||[]).filter(n => n.id!==noteId) } : x) }));
    },

    addLibraryCollection(collection) {
      const id = uid(), today = todayStr();
      setState(prev => ({ ...prev, libraryCollections: [...(prev.libraryCollections||[]), {
        id, coverEmoji: "📦", branches: [], order: (prev.libraryCollections||[]).length, createdAt: today, ...collection,
      }] }));
      pushToast("Коллекция создана", toastIcon(Layers, "text-amber-400"));
    },

    updateLibraryCollection(id, patch) {
      setState(prev => ({ ...prev, libraryCollections: (prev.libraryCollections||[]).map(c => c.id===id ? { ...c, ...patch } : c) }));
    },

    deleteLibraryCollection(id) {
      commit((prev, defer) => {
        const idx = (prev.libraryCollections||[]).findIndex(c => c.id===id);
        const removed = (prev.libraryCollections||[])[idx];
        if (!removed) return prev;
        // Записи ОТВЯЗЫВАЮТСЯ, а не удаляются: удаление книг и фильмов заодно с коллекцией было бы
        // катастрофой в один клик. Прежние привязки запоминаем целиком, чтобы откат вернул и их.
        const links = [];
        LIBRARY_KIND_ORDER.forEach(libKind => {
          const key = LIBRARY_KINDS[libKind].stateKey;
          (prev[key]||[]).forEach(item => {
            if (item.collectionId === id) links.push({ key, id: item.id, collectionId: item.collectionId, branchId: item.branchId, collectionOrder: item.collectionOrder });
          });
        });
        const next = { ...prev, libraryCollections: (prev.libraryCollections||[]).filter(c => c.id!==id) };
        LIBRARY_KIND_ORDER.forEach(libKind => {
          const key = LIBRARY_KINDS[libKind].stateKey;
          next[key] = (prev[key]||[]).map(item => item.collectionId===id ? { ...item, collectionId:null, branchId:null, collectionOrder:0 } : item);
        });
        defer(() => pushToast(
          links.length ? `Коллекция удалена, записей отвязано: ${links.length}` : "Коллекция удалена",
          toastIcon(Trash2, "text-zinc-400"),
          () => setState(p2 => {
            const back = { ...p2, libraryCollections: insertAt(p2.libraryCollections||[], idx, removed) };
            LIBRARY_KIND_ORDER.forEach(libKind => {
              const key = LIBRARY_KINDS[libKind].stateKey;
              back[key] = (p2[key]||[]).map(item => {
                const l = links.find(x => x.key===key && x.id===item.id);
                return l ? { ...item, collectionId:l.collectionId, branchId:l.branchId, collectionOrder:l.collectionOrder } : item;
              });
            });
            return back;
          })));
        return next;
      });
    },

    addCollectionBranch(collectionId, name, anchorId) {
      const id = uid();
      setState(prev => ({ ...prev, libraryCollections: (prev.libraryCollections||[]).map(c => c.id===collectionId
        ? { ...c, branches: [...(c.branches||[]), { id, name, anchorId: anchorId || null, order: (c.branches||[]).length }] }
        : c) }));
    },

    updateCollectionBranch(collectionId, branchId, patch) {
      commit((prev, defer) => {
        const coll = collectionById(prev.libraryCollections, collectionId);
        // Смена привязки — единственный способ завязать кольцо руками, поэтому проверяем ДО записи.
        if (coll && Object.prototype.hasOwnProperty.call(patch, "anchorId")
            && !canAnchorBranch(prev, coll, branchId, patch.anchorId)) {
          defer(() => pushToast("Ветку нельзя привязать к записи внутри неё самой", toastIcon(AlertCircle, "text-amber-400")));
          return prev;
        }
        return { ...prev, libraryCollections: (prev.libraryCollections||[]).map(c => c.id===collectionId
          ? { ...c, branches: (c.branches||[]).map(b => b.id===branchId ? { ...b, ...patch } : b) }
          : c) };
      });
    },

    // Перенос ветки меняет сразу две вещи: к чему она привязана и где стоит среди соседей.
    // Двумя действиями это дало бы два обновления состояния подряд и промежуточный кадр, где
    // ветка уже переехала, но ещё не встала на место.
    moveCollectionBranch(collectionId, branchId, anchorId, orderedIds) {
      commit((prev, defer) => {
        const coll = collectionById(prev.libraryCollections, collectionId);
        if (!coll) return prev;
        if (!canAnchorBranch(prev, coll, branchId, anchorId)) {
          defer(() => pushToast("Ветку нельзя вложить внутрь себя самой", toastIcon(AlertCircle, "text-amber-400")));
          return prev;
        }
        // Ветка, которой почему-то нет в присланном порядке, уезжает в конец, а не получает
        // order = -1 и не всплывает наверх мимо всех остальных.
        const ids = orderedIds || [];
        const at = (id) => { const i = ids.indexOf(id); return i < 0 ? ids.length : i; };
        return { ...prev, libraryCollections: (prev.libraryCollections||[]).map(c => c.id===collectionId
          ? { ...c, branches: (c.branches||[]).map(b => b.id===branchId
              ? { ...b, anchorId: anchorId || null, order: at(b.id) }
              : { ...b, order: at(b.id) }) }
          : c) };
      });
    },

    deleteCollectionBranch(collectionId, branchId) {
      commit((prev, defer) => {
        const coll = collectionById(prev.libraryCollections, collectionId);
        const branch = coll && (coll.branches||[]).find(b => b.id===branchId);
        if (!branch) return prev;
        const idx = (coll.branches||[]).findIndex(b => b.id===branchId);
        // Записи ветки не теряются: без ветки они читаются как основная линия (см. refBranchId),
        // поэтому чистить их поля не нужно, а откат возвращает всё одним движением.
        defer(() => pushToast(`Ветка «${branch.name}» удалена, записи ушли в основную линию`,
          toastIcon(Trash2, "text-zinc-400"),
          () => setState(p2 => ({ ...p2, libraryCollections: (p2.libraryCollections||[]).map(c => c.id===collectionId
            ? { ...c, branches: insertAt(c.branches||[], idx, branch) } : c) }))));
        return { ...prev, libraryCollections: (prev.libraryCollections||[]).map(c => c.id===collectionId
          ? { ...c, branches: (c.branches||[]).filter(b => b.id!==branchId) } : c) };
      });
    },

    // Пачкой, а не циклом по одиночному действию: иначе на каждую запись приходится своё
    // обновление состояния, список перерисовывается столько же раз, а порядок собирается из
    // нескольких независимых расчётов вместо одного.
    addItemsToCollection(collectionId, branchId, refs) {
      if (!refs || !refs.length) return;
      setState(prev => {
        const coll = collectionById(prev.libraryCollections, collectionId);
        const patches = addToBranchPatches(prev, coll, collectionId, branchId, refs);
        const next = { ...prev };
        LIBRARY_KIND_ORDER.forEach(libKind => {
          const key = LIBRARY_KINDS[libKind].stateKey;
          next[key] = (prev[key]||[]).map(it => {
            const p = patches.find(x => x.libKind===libKind && x.id===it.id);
            return p ? { ...it, collectionId, branchId: branchId || null, collectionOrder: p.collectionOrder } : it;
          });
        });
        return next;
      });
      pushToast(refs.length === 1 ? "Запись добавлена в коллекцию" : `Записей добавлено: ${refs.length}`,
        toastIcon(Layers, "text-amber-400"));
    },

    // Отдельным действием, а не setItemCollection(..., null, null): убирая запись, человек теряет
    // и ветку, и место в очереди, и вернуть их вручную уже нечем — значит нужен откат.
    removeItemFromCollection(libKind, itemId) {
      commit((prev, defer) => {
        const key = LIBRARY_KINDS[libKind].stateKey;
        const item = (prev[key]||[]).find(x => x.id===itemId);
        if (!item || !item.collectionId) return prev;
        const before = { collectionId: item.collectionId, branchId: item.branchId || null, collectionOrder: item.collectionOrder || 0 };
        defer(() => pushToast(`«${libraryDisplayTitle(item)}» убрано из коллекции`,
          toastIcon(X, "text-zinc-400"),
          () => setState(p2 => ({ ...p2, [key]: (p2[key]||[]).map(x => x.id===itemId ? { ...x, ...before } : x) }))));
        return { ...prev, [key]: (prev[key]||[]).map(x => x.id===itemId
          ? { ...x, collectionId: null, branchId: null, collectionOrder: 0 } : x) };
      });
    },

    setItemCollection(libKind, itemId, collectionId, branchId) {
      setState(prev => {
        const key = LIBRARY_KINDS[libKind].stateKey;
        const coll = collectionById(prev.libraryCollections, collectionId);
        const order = collectionId ? nextCollectionOrder(prev, collectionId, branchId, coll) : 0;
        return { ...prev, [key]: (prev[key]||[]).map(it => it.id===itemId
          ? { ...it, collectionId: collectionId || null, branchId: branchId || null, collectionOrder: order }
          : it) };
      });
    },

    // Одним действием: и перенумерация ветки, и возможный переезд записи в другую ветку. Раздельно
    // это дало бы два подряд идущих обновления состояния и мигание списка между ними.
    applyCollectionOrder(patches, moved) {
      setState(prev => {
        const next = { ...prev };
        LIBRARY_KIND_ORDER.forEach(libKind => {
          const key = LIBRARY_KINDS[libKind].stateKey;
          next[key] = (prev[key]||[]).map(it => {
            const p = patches.find(x => x.libKind===libKind && x.id===it.id);
            if (!p) return it;
            const branchPatch = moved && moved.id===it.id ? { branchId: moved.branchId } : {};
            return { ...it, collectionOrder: p.collectionOrder, ...branchPatch };
          });
        });
        return next;
      });
    },

    updateLibraryPrefs(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), library: { ...defaultLibraryPrefs(), ...(prev.uiPrefs && prev.uiPrefs.library), ...patch } } }));
    },

    // toggleLibrarySource("movie", "omdb", false) — включить/выключить конкретный источник
    // поиска обложек для конкретного вида.
    toggleLibrarySource(kind, sourceId, enabled) {
      setState(prev => {
        const cur = (prev.uiPrefs && prev.uiPrefs.librarySources) || defaultLibrarySources();
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), librarySources: { ...cur, [kind]: { ...cur[kind], [sourceId]: enabled } } } };
      });
    },
  };
}
