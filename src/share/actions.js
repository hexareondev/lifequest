// Импорт части чужого сохранения (обмен разделами: люди, библиотека, продукты, блюда).
// Устроен как действия финансов — см. finance/actions.js.

import { replayIds, todayStr } from "../core/basics.js";
import { buildImportedLibraryItem } from "../library/collections.js";
import { LIBRARY_KINDS, LIBRARY_KIND_ORDER } from "../library/constants.js";
import { WATER_INGREDIENT_ID } from "../nutrition/model.js";
import { Upload } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function shareActions({ setState, commit, pushToast }) {
  return {
    // Импорт части чужого сохранения (формат файла — share/model.js). Записи всегда
    // ДОБАВЛЯЮТСЯ: ничего существующего не перезаписывается и не удаляется. Каждой записи выдаётся
    // свой новый id — чужие id не должны сталкиваться с локальными. Прогресс и связи не
    // импортируются: они не попадают в файл, а недостающие поля добираются дефолтами раздела.
    importShared(sectionId, parsed, reuse) {
      // Сколько id понадобится, зависит от файла и от того, что уже есть (продукты сопоставляются
      // по названию), — поэтому генератор, а не uid() заранее (см. replayIds).
      const ids = replayIds(), today = todayStr();
      commit((prev, defer) => {
        const newId = ids();
        const items = parsed.items || [];
        let next = { ...prev };

        if (sectionId === "people") {
          let order = (prev.people||[]).filter(p=>!p.archived).length;
          const added = items.map(it => ({
            id:newId(), name:it.name || "Без имени", relation:it.relation || null,
            icon:it.icon || null, color:it.color || "amber", avatarEmoji:it.avatarEmoji || null, avatarImage:it.avatarImage || null,
            notes: typeof it.notes==="string" ? it.notes : "", birthday:it.birthday || null,
            // Прогресс и автоматика всегда с нуля — чужой XP и чужие отметки не переносятся.
            xp:0, archived:false, archivedAt:null, order:order++, createdAt:today,
            trackBirthday: it.trackBirthday === true, birthdayQuestYears:[],
          }));
          next.people = [...(prev.people||[]), ...added];
        } else if (sectionId === "library") {
          const byKind = {};
          // Записи в порядке файла: по этому порядку восстанавливаются ссылки коллекций.
          const created = [];
          items.forEach((it, i) => {
            const k = LIBRARY_KINDS[it.libKind] ? it.libKind : "book";
            // Сфера у получателя может не существовать — тогда просто не привязываем, вместо
            // ссылки в никуда.
            const sphereOk = it.sphereId && (prev.spheres||[]).some(s => s.id===it.sphereId);
            // Отмеченное как «использовать имеющуюся» не создаёт новую запись: в структуру
            // коллекции подставляется та, что уже есть.
            const reuseId = reuse && reuse[i];
            if (reuseId) { created.push({ id: reuseId }); return; }
            const rec = buildImportedLibraryItem(it, k, today, sphereOk ? it.sphereId : null, newId());
            created.push(rec);
            (byKind[k] = byKind[k] || []).push(rec);
          });
          Object.keys(byKind).forEach(k => {
            const key = LIBRARY_KINDS[k].stateKey;
            next[key] = [...(prev[key]||[]), ...byKind[k]];
          });

          // Коллекции из файла: сами записи уже созданы выше, здесь остаётся восстановить
          // структуру. Индексы из пакета переводятся в новые id — чужие id у нас не значат ничего.
          const packs = parsed.collections || [];
          if (packs.length) {
            const collIds = packs.map(() => newId());
            const branchIds = packs.map(p => (p.branches || []).map(() => newId()));
            // Новые записи ещё не в состоянии, а переиспользованные уже лежат в своих списках,
            // поэтому принадлежность собираем отдельной таблицей и применяем ко всем разом.
            const assign = new Map();
            items.forEach((it, i) => {
              const rec = created[i];
              if (!rec || typeof it.collection !== "number") return;
              const ci = it.collection;
              if (!collIds[ci]) return;
              assign.set(rec.id, {
                collectionId: collIds[ci],
                branchId: typeof it.branch === "number" ? (branchIds[ci][it.branch] || null) : null,
                collectionOrder: i,
              });
            });
            LIBRARY_KIND_ORDER.forEach(k => {
              const key = LIBRARY_KINDS[k].stateKey;
              next[key] = (next[key] || []).map(x => {
                const a = assign.get(x.id);
                return a ? { ...x, ...a } : x;
              });
            });
            next.libraryCollections = [...(prev.libraryCollections||[]), ...packs.map((p, ci) => ({
              id: collIds[ci],
              name: String((p && p.name) || "Коллекция"),
              coverEmoji: (p && p.coverEmoji) || "📦",
              mainBranchName: (p && p.mainBranchName) || null,
              showProgress: !p || p.showProgress !== false,
              order: (prev.libraryCollections||[]).length + ci,
              createdAt: today,
              branches: ((p && p.branches) || []).map((b, j) => ({
                id: branchIds[ci][j], name: String((b && b.name) || "Ветка"), order: j,
                // Индекс за пределами списка — битый файл: ветка просто становится
                // параллельной, а не ссылается в никуда.
                anchorId: b && typeof b.anchor === "number" && created[b.anchor] ? created[b.anchor].id : null,
              })),
            }))];
          }
        } else if (sectionId === "foods") {
          next.foods = [...(prev.foods||[]), ...items.map(it => ({
            id:newId(), name:it.name || "Без названия", emoji:it.emoji || "🍽️",
            caloriesPer100:Number(it.caloriesPer100)||0, proteinPer100:Number(it.proteinPer100)||0,
            fatPer100:Number(it.fatPer100)||0, carbsPer100:Number(it.carbsPer100)||0,
            pieceWeight: it.pieceWeight || null, createdAt:today,
          }))];
        } else if (sectionId === "dishes") {
          // Продукты из файла сопоставляем по названию: уже существующий переиспользуем (иначе
          // импорт нескольких подборок расплодил бы дубли одного и того же продукта), недостающий
          // создаём. idMap переводит чужие foodId в локальные.
          const foods = [...(prev.foods||[])];
          const idMap = {};
          (parsed.foods||[]).forEach(f => {
            const existing = foods.find(x => (x.name||"").trim().toLowerCase() === (f.name||"").trim().toLowerCase());
            if (existing) { idMap[f.id] = existing.id; return; }
            const created = {
              id:newId(), name:f.name || "Без названия", emoji:f.emoji || "🍽️",
              caloriesPer100:Number(f.caloriesPer100)||0, proteinPer100:Number(f.proteinPer100)||0,
              fatPer100:Number(f.fatPer100)||0, carbsPer100:Number(f.carbsPer100)||0,
              pieceWeight: f.pieceWeight || null, createdAt:today,
            };
            foods.push(created);
            idMap[f.id] = created.id;
          });
          const added = items.map(it => ({
            id:newId(), name:it.name || "Без названия", emoji:it.emoji || "🍲",
            // Ингредиенты без известного продукта отбрасываем — лучше блюдо с неполным составом,
            // чем ссылка на несуществующий продукт, из-за которой расчёт КБЖУ поедет.
            ingredients: (Array.isArray(it.ingredients) ? it.ingredients : [])
              .map(ing => (ing.foodId===WATER_INGREDIENT_ID
                ? { foodId:WATER_INGREDIENT_ID, grams:Number(ing.grams)||0 }
                : (idMap[ing.foodId] ? { foodId:idMap[ing.foodId], grams:Number(ing.grams)||0 } : null)))
              .filter(Boolean),
            createdAt:today,
          }));
          next.foods = foods;
          next.dishes = [...(prev.dishes||[]), ...added];
        }

        defer(() => pushToast(`Добавлено записей: ${items.length}`, toastIcon(Upload, "text-amber-400")));
        return next;
      });
    },
  };
}
