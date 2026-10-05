// Интерфейс питания: день, продукты, блюда и инвентарь.

import { ShareButtons, ShareExportModal, ShareImportModal } from "../share/ui.jsx";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Droplet, Pencil, Plus, Trash2, Utensils,
} from "lucide-react";
import { addDaysStr, clamp, shiftDateStr, todayStr } from "../core/basics.js";
import { fmtDateWithYear } from "../core/format.js";
import {
  Button, Card, EmptyState, Modal, ProgressBar, StickyAddButton, inputCls, labelCls, SectionHeader,
} from "../ui/atoms.jsx";
import { defaultEmojiAssignments, defaultEmojiPools } from "../ui/emoji-pools.js";
import { CoverPreviewButton, EmojiPickerModal } from "../ui/pickers.jsx";
import {
  INVENTORY_SORT_OPTIONS, NUTRITION_SORT_OPTIONS, WATER_INGREDIENT, WATER_INGREDIENT_ID,
  computeDishNutrition, expiryStatus, isNutritionGoalActiveOn, mealTotals, nutritionDayTotals,
  sortDishesByNutrition, sortFoodsList, sortInventoryList,
} from "./model.js";

function FoodForm({ initial, existingFoods, emojiPools, emojiAssignments, onAddPoolEmoji, onRemovePoolEmoji, onSubmit, onCancel, onPickExisting }) {
  const [name, setName] = useState((initial && initial.name) || "");
  const [emoji, setEmoji] = useState((initial && initial.emoji) || "🍽️");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [calories, setCalories] = useState(initial ? initial.caloriesPer100 : "");
  const [protein, setProtein] = useState(initial ? initial.proteinPer100 : "");
  const [fat, setFat] = useState(initial ? initial.fatPer100 : "");
  const [carbs, setCarbs] = useState(initial ? initial.carbsPer100 : "");
  const [pieceWeight, setPieceWeight] = useState((initial && initial.pieceWeight) || "");
  const [pieceMode, setPieceMode] = useState((initial && initial.packWeight && initial.packCount) ? "pack" : "manual");
  const [packWeight, setPackWeight] = useState((initial && initial.packWeight) || "");
  const [packCount, setPackCount] = useState((initial && initial.packCount) || "");

  const pools = emojiPools || defaultEmojiPools();
  const assignments = emojiAssignments || defaultEmojiAssignments();
  const poolId = assignments.food || Object.keys(pools)[0];
  const pool = pools[poolId] || Object.values(pools)[0];

  const estimatedCalories = (Number(protein)||0)*4 + (Number(fat)||0)*9 + (Number(carbs)||0)*4;
  // Автоопределение веса "1 шт" по весу пачки и количеству штук — переключаемо с ручным вводом.
  const computedPieceWeight = (pieceMode==="pack" && Number(packWeight)>0 && Number(packCount)>0)
    ? Number(packWeight)/Number(packCount) : null;

  // Подсказка "может, уже есть?" — только при создании нового продукта, не при редактировании
  // существующего (там совпадение с самим собой было бы просто шумом).
  const duplicates = useMemo(() => {
    if (initial) return [];
    const q = name.trim().toLowerCase();
    if (q.length < 2) return [];
    return (existingFoods||[]).filter(f => f.name.toLowerCase().includes(q)).slice(0,4);
  }, [name, existingFoods, initial]);

  function submit() {
    if (!name.trim()) return;
    const pw = pieceMode==="pack" ? computedPieceWeight : (pieceWeight ? Number(pieceWeight) : null);
    onSubmit({
      name: name.trim(), emoji,
      caloriesPer100: Number(calories)||0,
      proteinPer100: Number(protein)||0,
      fatPer100: Number(fat)||0,
      carbsPer100: Number(carbs)||0,
      pieceWeight: pw,
      packWeight: pieceMode==="pack" && Number(packWeight)>0 ? Number(packWeight) : null,
      packCount: pieceMode==="pack" && Number(packCount)>0 ? Number(packCount) : null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-start">
        <div>
          <CoverPreviewButton onClick={() => setPickerOpen(true)}>{emoji}</CoverPreviewButton>
          <EmojiPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} value={emoji} onChange={setEmoji}
            poolEmojis={pool.emojis}
            onAdd={onAddPoolEmoji ? (v) => onAddPoolEmoji(poolId, v) : undefined}
            onRemove={onRemovePoolEmoji ? (v) => onRemovePoolEmoji(poolId, v) : undefined}
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className={labelCls}>Название</label>
          <input className={inputCls} value={name} onChange={e=>setName(e.target.value)} placeholder="Например: Творог 5%" autoFocus />
          {duplicates.length > 0 && (
            <div className="mt-1.5">
              <div className="text-xs text-zinc-500 mb-1">Похоже, уже есть:</div>
              <div className="flex flex-wrap gap-1.5">
                {duplicates.map(f => (
                  <button key={f.id} type="button" onClick={() => onPickExisting && onPickExisting(f)} className="px-2.5 py-1.5 rounded-lg text-xs border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition flex items-center gap-1.5">
                    <span>{f.emoji}</span>{f.name}<span className="text-zinc-500">· {f.caloriesPer100} ккал/100г</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div>
        <label className={labelCls}>Калории на 100 г</label>
        <input type="number" min="0" className={inputCls} value={calories} onChange={e=>setCalories(e.target.value)} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className={labelCls} style={{ marginBottom:0 }}>Вес "1 шт" (необязательно)</span>
          {pieceMode==="manual" ? (
            <button type="button" onClick={()=>setPieceMode("pack")} className="text-xs text-amber-400 hover:text-amber-300">Посчитать по пачке</button>
          ) : (
            <button type="button" onClick={()=>setPieceMode("manual")} className="text-xs text-zinc-500 hover:text-zinc-300">Ввести вручную</button>
          )}
        </div>
        {pieceMode==="manual" ? (
          <input type="number" min="0" className={inputCls} value={pieceWeight} onChange={e=>setPieceWeight(e.target.value)} placeholder="Например: 150" />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="0" className={inputCls} value={packWeight} onChange={e=>setPackWeight(e.target.value)} placeholder="Вес пачки, г" />
            <input type="number" min="1" className={inputCls} value={packCount} onChange={e=>setPackCount(e.target.value)} placeholder="Штук в пачке" />
          </div>
        )}
        {pieceMode==="pack" && (
          <div className="text-xs text-zinc-600 mt-1">{computedPieceWeight ? `≈ ${Math.round(computedPieceWeight*100)/100} г за 1 шт` : "Заполни оба поля, чтобы посчитать вес одной штуки"}</div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Белки, г</label>
          <input type="number" min="0" step="0.1" className={inputCls} value={protein} onChange={e=>setProtein(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Жиры, г</label>
          <input type="number" min="0" step="0.1" className={inputCls} value={fat} onChange={e=>setFat(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Углеводы, г</label>
          <input type="number" min="0" step="0.1" className={inputCls} value={carbs} onChange={e=>setCarbs(e.target.value)} />
        </div>
      </div>
      {(protein || fat || carbs) && (
        <div className="text-xs text-zinc-600">По Б/Ж/У ожидается ~{Math.round(estimatedCalories)} ккал — просто ориентир, чтобы заметить опечатку; калории всё равно берутся из поля выше, а не считаются автоматически.</div>
      )}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>{initial ? "Сохранить" : "Добавить"}</Button>
      </div>
    </div>
  );
}

export function FoodsView({ state, actions }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("alpha");
  const foods = sortFoodsList(
    state.foods.filter(f => !search.trim() || f.name.toLowerCase().includes(search.trim().toLowerCase())),
    sortKey
  );

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(f) { setEditing(f); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updateFood(editing.id, data); else actions.addFood(data);
    setModalOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <input className={inputCls} style={{ maxWidth:240 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск..." />
        <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={sortKey} onChange={e=>setSortKey(e.target.value)}>
          {NUTRITION_SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      {foods.length === 0 ? (
        <EmptyState icon={Utensils} title="Пока пусто" subtitle="Добавь первый продукт — потом из них можно будет собирать блюда." action={<Button size="sm" onClick={openCreate}>Добавить продукт</Button>} />
      ) : (
        <div className="space-y-2">
          {foods.map(f => (
            <div key={f.id} onClick={() => openEdit(f)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 transition cursor-pointer">
              <span className="text-2xl shrink-0 w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center">{f.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-100 truncate">{f.name}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500 font-data mt-0.5">
                  <span className="text-zinc-400">{f.caloriesPer100} ккал</span>
                  <span><span className="text-sky-400">Б</span> <span className="text-zinc-300">{f.proteinPer100}</span></span>
                  <span><span className="text-rose-400">Ж</span> <span className="text-zinc-300">{f.fatPer100}</span></span>
                  <span><span className="text-violet-400">У</span> <span className="text-zinc-300">{f.carbsPer100}</span></span>
                  <span className="text-zinc-600">/100г</span>
                  {f.pieceWeight ? <span className="text-zinc-600">1 шт ≈ {f.pieceWeight} г</span> : null}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); actions.deleteFood(f.id); }} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
          ))}
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Изменить продукт" : "Новый продукт"}>
        <FoodForm key={editing ? editing.id : "__new__"} initial={editing} existingFoods={state.foods} emojiPools={state.uiPrefs && state.uiPrefs.emojiPools} emojiAssignments={state.uiPrefs && state.uiPrefs.emojiAssignments} onAddPoolEmoji={actions.addPoolEmoji} onRemovePoolEmoji={actions.removePoolEmoji} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} onPickExisting={(f) => setEditing(f)} />
      </Modal>
      <StickyAddButton onClick={openCreate} label="Добавить продукт" />
    </div>
  );
}

function DishForm({ initial, dishes, foods, emojiPools, emojiAssignments, onAddPoolEmoji, onRemovePoolEmoji, onSubmit, onCancel }) {
  const [name, setName] = useState((initial && initial.name) || "");
  const [emoji, setEmoji] = useState((initial && initial.emoji) || "🍲");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ingredients, setIngredients] = useState((initial && initial.ingredients) ? initial.ingredients.map(i => ({ ...i })) : []);
  const [baseDishId, setBaseDishId] = useState("");

  const pools = emojiPools || defaultEmojiPools();
  const assignments = emojiAssignments || defaultEmojiAssignments();
  const poolId = assignments.dish || Object.keys(pools)[0];
  const pool = pools[poolId] || Object.values(pools)[0];

  function addIngredientRow() {
    if (foods.length===0) return;
    setIngredients(ings => [...ings, { foodId: foods[0].id, grams: 100 }]);
  }
  function addWaterRow() {
    setIngredients(ings => [...ings, { foodId: WATER_INGREDIENT_ID, grams: 100 }]);
  }
  function updateIngredient(idx, patch) { setIngredients(ings => ings.map((ing,i) => i===idx ? { ...ing, ...patch } : ing)); }
  function removeIngredient(idx) { setIngredients(ings => ings.filter((_,i) => i!==idx)); }
  function copyFromDish(id) {
    const src = dishes.find(d => d.id===id);
    if (src) setIngredients(src.ingredients.map(i => ({ ...i })));
    setBaseDishId("");
  }

  const totals = computeDishNutrition({ ingredients }, foods);

  function submit() {
    if (!name.trim() || ingredients.length===0) return;
    onSubmit({ name: name.trim(), emoji, ingredients });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-start">
        <div>
          <CoverPreviewButton onClick={() => setPickerOpen(true)}>{emoji}</CoverPreviewButton>
          <EmojiPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} value={emoji} onChange={setEmoji}
            poolEmojis={pool.emojis}
            onAdd={onAddPoolEmoji ? (v) => onAddPoolEmoji(poolId, v) : undefined}
            onRemove={onRemovePoolEmoji ? (v) => onRemovePoolEmoji(poolId, v) : undefined}
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className={labelCls}>Название</label>
          <input className={inputCls} value={name} onChange={e=>setName(e.target.value)} placeholder="Например: Курица с рисом" autoFocus />
        </div>
      </div>

      {!initial && dishes.length > 0 && (
        <div>
          <label className={labelCls}>Или на основе существующего блюда</label>
          <select className={inputCls} value={baseDishId} onChange={e => e.target.value && copyFromDish(e.target.value)}>
            <option value="">Начать с нуля</option>
            {dishes.map(d => <option key={d.id} value={d.id}>{d.emoji} {d.name}</option>)}
          </select>
          <div className="text-xs text-zinc-600 mt-1">Скопирует состав — останется только дополнить недостающее, само блюдо не изменится.</div>
        </div>
      )}

      <div className="space-y-2">
        <label className={labelCls}>Состав</label>
        {ingredients.length === 0 ? (
          <div className="text-sm text-zinc-500">Пока нет ингредиентов.</div>
        ) : ingredients.map((ing, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <select className={inputCls} value={ing.foodId} onChange={e=>updateIngredient(idx, { foodId:e.target.value })}>
              {foods.map(f => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
              <option value={WATER_INGREDIENT_ID}>{WATER_INGREDIENT.emoji} {WATER_INGREDIENT.name}</option>
            </select>
            <input type="number" min="0" className={inputCls} style={{ width:90 }} value={ing.grams} onChange={e=>updateIngredient(idx, { grams:Number(e.target.value)||0 })} />
            <span className="text-xs text-zinc-500 shrink-0">г</span>
            <button onClick={() => removeIngredient(idx)} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={addIngredientRow} disabled={foods.length===0}><Plus className="w-3.5 h-3.5"/>Добавить ингредиент</Button>
          <Button variant="secondary" size="sm" onClick={addWaterRow}>{WATER_INGREDIENT.emoji} Добавить воду</Button>
        </div>
        {foods.length===0 && <div className="text-xs text-zinc-600">Сначала добавь хотя бы один продукт во вкладке «Продукты».</div>}
      </div>

      {ingredients.length > 0 && (
        <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm">
          <div className="text-zinc-400 mb-1">Итого на {Math.round(totals.weight)} г:</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-data text-xs text-zinc-300">
            <span>{Math.round(totals.calories)} ккал</span>
            <span><span className="text-sky-400">Б</span>: {totals.protein.toFixed(1)} г</span>
            <span><span className="text-rose-400">Ж</span>: {totals.fat.toFixed(1)} г</span>
            <span><span className="text-violet-400">У</span>: {totals.carbs.toFixed(1)} г</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>{initial ? "Сохранить" : "Добавить"}</Button>
      </div>
    </div>
  );
}

export function DishesView({ state, actions }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sortKey, setSortKey] = useState("alpha");
  const dishesWithNutrition = useMemo(
    () => state.dishes.map(d => ({ dish:d, n:computeDishNutrition(d, state.foods) })),
    [state.dishes, state.foods]
  );
  const dishes = sortDishesByNutrition(dishesWithNutrition, sortKey);

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(d) { setEditing(d); setModalOpen(true); }
  function handleSubmit(data) {
    if (editing) actions.updateDish(editing.id, data); else actions.addDish(data);
    setModalOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={sortKey} onChange={e=>setSortKey(e.target.value)}>
          {NUTRITION_SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      {dishes.length === 0 ? (
        <EmptyState icon={Utensils} title="Пока пусто" subtitle="Собери первое блюдо из продуктов — БЖУ посчитается само." action={<Button size="sm" onClick={openCreate}>Добавить блюдо</Button>} />
      ) : (
        <div className="space-y-2">
          {dishes.map(({ dish:d, n }) => (
            <div key={d.id} onClick={() => openEdit(d)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 transition cursor-pointer">
              <span className="text-2xl shrink-0 w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center">{d.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-100 truncate">{d.name}</div>
                <div className="text-xs text-zinc-500 font-data">{Math.round(n.weight)} г всего · {Math.round(n.calories)} ккал</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); actions.deleteDish(d.id); }} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
          ))}
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Изменить блюдо" : "Новое блюдо"}>
        <DishForm initial={editing} dishes={state.dishes} foods={state.foods} emojiPools={state.uiPrefs && state.uiPrefs.emojiPools} emojiAssignments={state.uiPrefs && state.uiPrefs.emojiAssignments} onAddPoolEmoji={actions.addPoolEmoji} onRemovePoolEmoji={actions.removePoolEmoji} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
      <StickyAddButton onClick={openCreate} label="Добавить блюдо" />
    </div>
  );
}

function InventoryAddModal({ open, onClose, foods, dishes, onAdd }) {
  const [sourceType, setSourceType] = useState("dish");
  const [sourceId, setSourceId] = useState("");
  const [grams, setGrams] = useState("");
  const [name, setName] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const list = sourceType==="dish" ? dishes : foods;

  useEffect(() => { if (open) { setSourceType("dish"); setSourceId(""); setGrams(""); setName(""); setExpiryDate(""); } }, [open]);

  function submit() {
    if (!sourceId || !grams) return;
    onAdd(sourceType, sourceId, Number(grams), name.trim() || null, null, expiryDate || null);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Добавить в инвентарь">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { setSourceType("dish"); setSourceId(""); }} className={`py-2 rounded-xl text-sm font-medium border transition ${sourceType==="dish" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>Блюдо</button>
          <button onClick={() => { setSourceType("food"); setSourceId(""); }} className={`py-2 rounded-xl text-sm font-medium border transition ${sourceType==="food" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>Продукт</button>
        </div>
        <div>
          <label className={labelCls}>{sourceType==="dish" ? "Какое блюдо приготовили" : "Какой продукт"}</label>
          <select className={inputCls} value={sourceId} onChange={e=>setSourceId(e.target.value)}>
            <option value="">Выбери...</option>
            {list.map(x => <option key={x.id} value={x.id}>{x.emoji} {x.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Сколько всего, г</label>
          <input type="number" min="0" className={inputCls} value={grams} onChange={e=>setGrams(e.target.value)} placeholder="Например: 800" />
        </div>
        <div>
          <label className={labelCls}>Название записи (необязательно)</label>
          <input className={inputCls} value={name} onChange={e=>setName(e.target.value)} placeholder="По умолчанию — название блюда/продукта" />
        </div>
        <div>
          <label className={labelCls}>Срок годности (необязательно)</label>
          <input type="date" className={inputCls} value={expiryDate} onChange={e=>setExpiryDate(e.target.value)} />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={!sourceId || !grams}>Добавить</Button>
        </div>
      </div>
    </Modal>
  );
}

// Показывает статус срока годности цветом (годен/скоро истекает/просрочен), либо ничего, если
// срок не указан (не отслеживается).
function ExpiryBadge({ expiryDate }) {
  const status = expiryStatus(expiryDate);
  if (!status) return null;
  const map = {
    valid:   { label: `До ${fmtDateWithYear(expiryDate)}`, cls: "text-emerald-400" },
    soon:    { label: `Истекает ${fmtDateWithYear(expiryDate)}`, cls: "text-amber-400" },
    expired: { label: `Просрочено ${fmtDateWithYear(expiryDate)}`, cls: "text-red-400" },
  };
  const s = map[status];
  return <span className={`text-xs font-data ${s.cls}`}>{s.label}</span>;
}

function InventoryExpiryModal({ open, onClose, item, onSave }) {
  const [expiryDate, setExpiryDate] = useState("");
  useEffect(() => { if (open) setExpiryDate((item && item.expiryDate) || ""); }, [open, item]);
  if (!item) return null;
  function submit() { onSave(expiryDate || null); onClose(); }
  return (
    <Modal open={open} onClose={onClose} title={`Срок годности: ${item.name}`}>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Срок годности (пусто — не отслеживать)</label>
          <input type="date" className={inputCls} value={expiryDate} onChange={e=>setExpiryDate(e.target.value)} autoFocus />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={submit}>Сохранить</Button>
        </div>
      </div>
    </Modal>
  );
}

function InventoryConsumeModal({ open, onClose, item, onConfirm }) {
  const [grams, setGrams] = useState("");
  useEffect(() => { if (open) setGrams(""); }, [open]);
  if (!item) return null;
  function submit() {
    const g = Number(grams);
    if (!g || g<=0) return;
    onConfirm(Math.min(g, item.gramsLeft));
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title={`Съесть: ${item.name}`}>
      <div className="space-y-4">
        <div className="text-sm text-zinc-400">Осталось {item.gramsLeft} г из {item.gramsTotal} г.</div>
        <div>
          <label className={labelCls}>Сколько сейчас, г</label>
          <input type="number" min="0" max={item.gramsLeft} className={inputCls} value={grams} onChange={e=>setGrams(e.target.value)} autoFocus />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={submit}>Записать</Button>
        </div>
      </div>
    </Modal>
  );
}

export function InventoryView({ state, actions }) {
  const [addOpen, setAddOpen] = useState(false);
  const [consuming, setConsuming] = useState(null);
  const [editingExpiry, setEditingExpiry] = useState(null);
  const [sortKey, setSortKey] = useState("alpha");
  const items = sortInventoryList(state.inventory.filter(x => x.gramsLeft > 0), sortKey);
  const finished = state.inventory.filter(x => x.gramsLeft <= 0);
  const nextMeal = Math.max(1, ...state.nutritionLog.filter(e => e.date===todayStr() && e.kind==="food").map(e => e.meal||1), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300" value={sortKey} onChange={e=>setSortKey(e.target.value)}>
          {INVENTORY_SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Utensils} title="Инвентарь пуст" subtitle="Приготовили что-то или купили запас продукта — заведите здесь, чтобы удобно списывать по мере использования." action={<Button size="sm" onClick={() => setAddOpen(true)}>Добавить</Button>} />
      ) : (
        <div className="space-y-2">
          {items.map(x => (
            <div key={x.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950/40">
              <span className="text-2xl shrink-0 w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center">{x.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-100 truncate">{x.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 font-data mb-1">
                  <span>Осталось {x.gramsLeft} из {x.gramsTotal} г</span>
                  <button onClick={() => setEditingExpiry(x)} className="flex items-center gap-1 hover:text-zinc-300">
                    {x.expiryDate ? <ExpiryBadge expiryDate={x.expiryDate}/> : <span className="text-zinc-600">Срок не указан</span>}
                    <Pencil className="w-2.5 h-2.5 text-zinc-600"/>
                  </button>
                </div>
                <ProgressBar value={clamp(x.gramsLeft/(x.gramsTotal||1), 0, 1)} colorClass="bg-emerald-500" heightClass="h-1.5" />
              </div>
              <Button size="sm" onClick={() => setConsuming(x)}>Съесть</Button>
              <button onClick={() => actions.discardInventoryItem(x.id)} className="text-xs text-zinc-500 hover:text-orange-400 shrink-0 whitespace-nowrap">Выбросить</button>
              <button onClick={() => actions.deleteInventoryItem(x.id)} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
          ))}
        </div>
      )}
      {finished.length > 0 && <div className="text-xs text-zinc-600 pt-1">Закончилось: {finished.map(x=>x.name).join(", ")}</div>}
      <InventoryAddModal open={addOpen} onClose={() => setAddOpen(false)} foods={state.foods} dishes={state.dishes} onAdd={actions.addInventoryItem} />
      <InventoryConsumeModal open={!!consuming} onClose={() => setConsuming(null)} item={consuming} onConfirm={(grams) => actions.consumeInventory(consuming.id, grams, nextMeal, todayStr())} />
      <InventoryExpiryModal open={!!editingExpiry} onClose={() => setEditingExpiry(null)} item={editingExpiry} onSave={(expiryDate) => editingExpiry && actions.updateInventoryItem(editingExpiry.id, { expiryDate })} />
      <StickyAddButton onClick={() => setAddOpen(true)} label="Добавить в инвентарь" />
    </div>
  );
}

function NutrientBar({ label, value, goal, unit, colorClass, compact }) {
  return (
    <div>
      <div className={`flex items-center justify-between ${compact ? "text-[11px]" : "text-xs"} text-zinc-500 mb-1`}>
        <span>{label}</span>
        <span className="font-data">{Math.round(value*10)/10}{goal ? ` / ${goal}` : ""} {unit}</span>
      </div>
      {goal ? <ProgressBar value={clamp(value/goal, 0, 1)} colorClass={colorClass} heightClass={compact ? "h-1" : undefined} /> : null}
    </div>
  );
}

// Модалка добавления/редактирования одной строки приёма пищи — открывается кнопкой "Добавить"
// под конкретным приёмом (или карандашом на уже существующей строке). Один и тот же UI на оба
// случая: при editing!=null форма предзаполняется данными строки и меняет источник/граммовку на
// месте, не создавая новую запись.
function MealEntryModal({ open, onClose, state, meal, editing, onSubmit }) {
  const [sourceType, setSourceType] = useState("food");
  const [sourceId, setSourceId] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("g");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSourceType(editing.sourceType);
      setSourceId(editing.sourceId);
      setAmount(String(editing.grams));
      setUnit("g");
    } else {
      setSourceType("food"); setSourceId(""); setAmount(""); setUnit("g");
    }
  }, [open, editing]);

  // Если редактируем запись, уже списанную с инвентарного предмета, он должен остаться в списке
  // выбора, даже если сейчас у него osталось 0 г (иначе не с чем сравнить/сохранить как есть).
  const list = sourceType==="food" ? state.foods
    : sourceType==="dish" ? state.dishes
    : state.inventory.filter(x => x.gramsLeft>0 || (editing && editing.sourceType==="inventory" && editing.sourceId===x.id));
  const selectedFood = sourceType==="food" ? state.foods.find(f=>f.id===sourceId) : null;

  const recent = useMemo(() => {
    if (editing) return [];
    const seen = new Set();
    const items = [];
    for (const e of state.nutritionLog) {
      if (e.kind!=="food" || e.sourceType==="inventory") continue;
      const key = `${e.sourceType}-${e.sourceId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const src = e.sourceType==="food" ? state.foods.find(f=>f.id===e.sourceId) : state.dishes.find(d=>d.id===e.sourceId);
      if (src) items.push({ sourceType:e.sourceType, sourceId:e.sourceId, name:src.name, emoji:src.emoji });
      if (items.length>=6) break;
    }
    return items;
  }, [state.nutritionLog, state.foods, state.dishes, editing]);

  function submit() {
    if (!sourceId || !amount) return;
    let grams = Number(amount);
    if (unit==="piece" && selectedFood && selectedFood.pieceWeight) grams = Number(amount) * selectedFood.pieceWeight;
    onSubmit({ sourceType, sourceId, grams });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Изменить запись · ${meal}-й приём` : `Добавить в ${meal}-й приём`}>
      <div className="space-y-3">
        {recent.length > 0 && (
          <div>
            <div className={labelCls}>Недавнее</div>
            <div className="flex flex-wrap gap-1.5">
              {recent.map(r => (
                <button key={`${r.sourceType}-${r.sourceId}`} onClick={() => { setSourceType(r.sourceType); setSourceId(r.sourceId); }} className={`px-2.5 py-1.5 rounded-lg text-xs border transition flex items-center gap-1.5 ${sourceType===r.sourceType && sourceId===r.sourceId ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-400 hover:border-zinc-700"}`}>
                  <span>{r.emoji}</span>{r.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className={labelCls}>Откуда</div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={()=>{setSourceType("food"); setSourceId("");}} className={`py-2 rounded-xl text-xs font-medium border transition ${sourceType==="food" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>Продукт</button>
            <button onClick={()=>{setSourceType("dish"); setSourceId("");}} className={`py-2 rounded-xl text-xs font-medium border transition ${sourceType==="dish" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>Блюдо</button>
            <button onClick={()=>{setSourceType("inventory"); setSourceId("");}} className={`py-2 rounded-xl text-xs font-medium border transition ${sourceType==="inventory" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>Инвентарь</button>
          </div>
        </div>
        <div>
          <div className={labelCls}>Что именно</div>
          <select className={inputCls} value={sourceId} onChange={e=>{ setSourceId(e.target.value); setUnit("g"); }}>
            <option value="">Выбери...</option>
            {list.map(x => <option key={x.id} value={x.id}>{x.emoji} {x.name}{sourceType==="inventory" ? ` (осталось ${x.gramsLeft} г)` : ""}</option>)}
          </select>
        </div>
        <div>
          <div className={labelCls}>Сколько</div>
          <div className="flex items-center gap-2">
            <input type="number" min="0" className={inputCls} value={amount} onChange={e=>setAmount(e.target.value)} placeholder={unit==="piece" ? "Штук" : "Грамм"} autoFocus />
            {selectedFood && selectedFood.pieceWeight ? (
              <div className="flex items-center rounded-lg border border-zinc-800 overflow-hidden shrink-0">
                <button type="button" onClick={()=>setUnit("g")} className={`px-2.5 py-2 text-xs ${unit==="g" ? "bg-amber-500/15 text-amber-300" : "text-zinc-500"}`}>г</button>
                <button type="button" onClick={()=>setUnit("piece")} className={`px-2.5 py-2 text-xs ${unit==="piece" ? "bg-amber-500/15 text-amber-300" : "text-zinc-500"}`}>шт</button>
              </div>
            ) : <span className="text-xs text-zinc-500 shrink-0">г</span>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={submit} disabled={!sourceId || !amount}>{editing ? "Сохранить" : "Добавить"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function NutritionGoalForm({ goal, onSave, onClear, onClose }) {
  const [startDate, setStartDate] = useState(goal.startDate || todayStr());
  const [endDate, setEndDate] = useState(goal.endDate || addDaysStr(7));
  const [calories, setCalories] = useState(goal.calories ?? "");
  const [protein, setProtein] = useState(goal.protein ?? "");
  const [fat, setFat] = useState(goal.fat ?? "");
  const [carbs, setCarbs] = useState(goal.carbs ?? "");
  const [water, setWater] = useState(goal.water ?? "");

  function submit() {
    onSave({
      startDate, endDate,
      calories: calories!=="" ? Number(calories) : null,
      protein: protein!=="" ? Number(protein) : null,
      fat: fat!=="" ? Number(fat) : null,
      carbs: carbs!=="" ? Number(carbs) : null,
      water: water!=="" ? Number(water) : null,
    });
    onClose();
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-zinc-600">Цель действует только в указанный период — например, на время диеты. Без цели показываются просто сырые числа за день. Любое поле цели можно оставить пустым.</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>С</label>
          <input type="date" className={inputCls} value={startDate} onChange={e=>setStartDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>По</label>
          <input type="date" className={inputCls} value={endDate} onChange={e=>setEndDate(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Калории</label>
          <input type="number" min="0" className={inputCls} value={calories} onChange={e=>setCalories(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Вода, мл</label>
          <input type="number" min="0" className={inputCls} value={water} onChange={e=>setWater(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={labelCls}>Белки</label><input type="number" min="0" className={inputCls} value={protein} onChange={e=>setProtein(e.target.value)} /></div>
        <div><label className={labelCls}>Жиры</label><input type="number" min="0" className={inputCls} value={fat} onChange={e=>setFat(e.target.value)} /></div>
        <div><label className={labelCls}>Углеводы</label><input type="number" min="0" className={inputCls} value={carbs} onChange={e=>setCarbs(e.target.value)} /></div>
      </div>
      <div className="flex items-center justify-between pt-2">
        {goal.startDate ? <Button variant="ghost" onClick={() => { onClear(); onClose(); }}>Убрать цель</Button> : <span/>}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={submit}>Сохранить</Button>
        </div>
      </div>
    </div>
  );
}

export function TodayView({ state, actions }) {
  const [date, setDate] = useState(todayStr());
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  // Приёмы, созданные кнопкой "Новый приём", но ещё без единой записи — существуют только в этом
  // рендере вида (пустой приём без записей не несёт смысла как сохранённые данные), сбрасываются
  // при смене даты.
  const [extraMeals, setExtraMeals] = useState([]);
  // { meal, editing } при открытой модалке добавления/редактирования строки, иначе null.
  const [entryModal, setEntryModal] = useState(null);

  useEffect(() => { setExtraMeals([]); }, [date]);

  const totals = nutritionDayTotals(state.nutritionLog, date);
  const goal = state.nutritionGoal;
  const goalActive = isNutritionGoalActiveOn(goal, date);

  const mealGroups = useMemo(() => {
    const map = {};
    totals.entries.filter(e => e.kind==="food").forEach(e => {
      const m = e.meal||1;
      if (!map[m]) map[m] = [];
      map[m].push(e);
    });
    const nums = new Set([...Object.keys(map).map(Number), ...extraMeals]);
    if (nums.size===0) nums.add(1); // первый приём всегда виден и готов к заполнению
    return Array.from(nums).sort((a,b)=>a-b).map(m => ({ meal:m, entries: map[m]||[] }));
  }, [totals.entries, extraMeals]);

  function addMeal() {
    const maxMeal = mealGroups.length ? Math.max(...mealGroups.map(g=>g.meal)) : 0;
    setExtraMeals(prev => [...prev, maxMeal+1]);
  }

  // Удалить пустой приём и закрыть образовавшуюся дыру в нумерации — всё, что шло после, сдвигается
  // на 1 (и в самих записях дневника, и в локально созданных, ещё пустых extraMeals).
  function removeEmptyMeal(mealNumber) {
    const group = mealGroups.find(g => g.meal===mealNumber);
    if (!group || group.entries.length>0) return;
    actions.renumberMealsAfterEmptyRemoved(date, mealNumber);
    setExtraMeals(prev => prev.filter(m => m!==mealNumber).map(m => m>mealNumber ? m-1 : m));
  }

  function submitEntry({ sourceType, sourceId, grams }) {
    if (!entryModal) return;
    if (entryModal.editing) {
      actions.updateNutritionLogEntry(entryModal.editing.id, { sourceType, sourceId, grams });
    } else if (sourceType==="inventory") {
      actions.consumeInventory(sourceId, grams, entryModal.meal, date);
    } else {
      actions.logFood(sourceType, sourceId, grams, entryModal.meal, date);
    }
  }

  function sourceLabel(entry) {
    let src = null;
    if (entry.sourceType==="food") src = state.foods.find(f=>f.id===entry.sourceId);
    else if (entry.sourceType==="dish") src = state.dishes.find(d=>d.id===entry.sourceId);
    else if (entry.sourceType==="inventory") src = state.inventory.find(x=>x.id===entry.sourceId);
    return src ? `${src.emoji} ${src.name}` : "Удалено из базы";
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setDate(shiftDateStr(date,-1))} className="p-2 text-zinc-500 hover:text-zinc-200"><ChevronLeft className="w-4 h-4"/></button>
        <div className="text-sm font-medium text-zinc-200 font-data">{date===todayStr() ? "Сегодня" : fmtDateWithYear(date)}</div>
        <button onClick={() => setDate(shiftDateStr(date,1))} disabled={date>=todayStr()} className="p-2 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4"/></button>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-zinc-200">Итоги дня</div>
          <button onClick={() => setGoalModalOpen(true)} className="text-xs text-amber-400 hover:text-amber-300">{goal.startDate ? "Изменить цель" : "Задать цель"}</button>
        </div>
        <div className="space-y-3">
          <NutrientBar label="Калории" value={totals.calories} goal={goalActive ? goal.calories : null} unit="ккал" colorClass="bg-amber-500" />
          <div className="grid grid-cols-3 gap-3">
            <NutrientBar label="Белки" value={totals.protein} goal={goalActive ? goal.protein : null} unit="г" colorClass="bg-sky-500" compact />
            <NutrientBar label="Жиры" value={totals.fat} goal={goalActive ? goal.fat : null} unit="г" colorClass="bg-rose-500" compact />
            <NutrientBar label="Углеводы" value={totals.carbs} goal={goalActive ? goal.carbs : null} unit="г" colorClass="bg-violet-500" compact />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-zinc-200 flex items-center gap-2"><Droplet className="w-4 h-4 text-sky-400"/>Вода</div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-data">
            <input type="number" min="0" value={totals.water} onChange={e => actions.setWaterForDay(date, e.target.value)} className="w-20 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-200 text-right" />
            <span>мл{goalActive && goal.water ? ` / ${goal.water} мл` : ""}</span>
          </div>
        </div>
        {goalActive && goal.water ? <ProgressBar value={clamp(totals.water/goal.water,0,1)} colorClass="bg-sky-500" /> : null}
        <div className="flex gap-2 mt-3">
          {[200,300,500].map(ml => (
            <Button key={ml} variant="secondary" size="sm" onClick={() => actions.logWater(ml, date)}>+{ml} мл</Button>
          ))}
        </div>
      </Card>


      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-zinc-200">Приёмы пищи</div>
          <Button variant="secondary" size="sm" onClick={addMeal}><Plus className="w-3.5 h-3.5"/>Новый приём</Button>
        </div>
        <div className="space-y-3">
          {mealGroups.map(g => {
            const mt = mealTotals(g.entries);
            return (
              <div key={g.meal} className="border border-zinc-800 bg-zinc-950/40 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="text-xs text-zinc-500 uppercase tracking-wide font-data">{g.meal}-й приём</div>
                  {g.entries.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-zinc-500 font-data">
                      <span className="text-zinc-400">{Math.round(mt.calories)} ккал</span>
                      <span><span className="text-sky-400">Б</span> <span className="text-zinc-300">{Math.round(mt.protein*10)/10}</span></span>
                      <span><span className="text-rose-400">Ж</span> <span className="text-zinc-300">{Math.round(mt.fat*10)/10}</span></span>
                      <span><span className="text-violet-400">У</span> <span className="text-zinc-300">{Math.round(mt.carbs*10)/10}</span></span>
                    </div>
                  ) : mealGroups.length > 1 ? (
                    <button onClick={() => removeEmptyMeal(g.meal)} className="text-zinc-600 hover:text-red-400" title="Убрать пустой приём"><Trash2 className="w-3.5 h-3.5"/></button>
                  ) : null}
                </div>
                {g.entries.length === 0 ? (
                  <div className="text-xs text-zinc-600 mb-2">Пока пусто.</div>
                ) : (
                  <div className="space-y-1 mb-2">
                    {g.entries.map((e, idx) => (
                      <div key={e.id} className="flex items-center justify-between text-sm border-b border-zinc-800/60 py-1.5 last:border-0 gap-2">
                        <span className="flex items-center gap-1 min-w-0 flex-1">
                          <span className="flex items-center shrink-0 -ml-1">
                            <button onClick={() => actions.moveNutritionLogEntry(e.id,-1)} disabled={idx===0} className="p-0.5 text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed"><ChevronUp className="w-3.5 h-3.5"/></button>
                            <button onClick={() => actions.moveNutritionLogEntry(e.id,1)} disabled={idx===g.entries.length-1} className="p-0.5 text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed"><ChevronDown className="w-3.5 h-3.5"/></button>
                          </span>
                          <span className="text-zinc-300 truncate">{sourceLabel(e)} · {e.grams} г</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-zinc-500 font-data">{Math.round(e.calories)} ккал</span>
                          <button onClick={() => setEntryModal({ meal:g.meal, editing:e })} className="text-zinc-600 hover:text-amber-400"><Pencil className="w-3.5 h-3.5"/></button>
                          <button onClick={() => actions.deleteNutritionLogEntry(e.id)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5"/></button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="ghost" size="sm" onClick={() => setEntryModal({ meal:g.meal, editing:null })}><Plus className="w-3.5 h-3.5"/>Добавить</Button>
              </div>
            );
          })}
        </div>
      </Card>

      <MealEntryModal open={!!entryModal} onClose={() => setEntryModal(null)} state={state} meal={entryModal ? entryModal.meal : 1} editing={entryModal ? entryModal.editing : null} onSubmit={submitEntry} />

      <Modal open={goalModalOpen} onClose={() => setGoalModalOpen(false)} title="Цель по питанию">
        <NutritionGoalForm goal={goal} onSave={actions.updateNutritionGoal} onClear={actions.clearNutritionGoal} onClose={() => setGoalModalOpen(false)} />
      </Modal>
    </div>
  );
}

export const NUTRITION_TABS = [
  { id:"today",     label:"Сегодня" },
  { id:"foods",     label:"Продукты" },
  { id:"dishes",    label:"Блюда" },
  { id:"inventory", label:"Инвентарь" },
];

export function NutritionView({ state, actions }) {
  const [activeTab, setActiveTab] = useState("today");
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Обмен относится к справочникам (продукты и блюда), а не к дневнику за день и не к остаткам
  // инвентаря — поэтому кнопки показываются только на этих двух вкладках, а sectionId берётся
  // прямо из активной вкладки: одна пара кнопок обслуживает оба справочника.
  const shareSection = (activeTab==="foods" || activeTab==="dishes") ? activeTab : null;
  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Дневник" title="Питание" action={shareSection && (
        <div className="flex items-center gap-2 flex-wrap">
          <ShareButtons onShare={() => setShareOpen(true)} onImport={() => setImportOpen(true)} />
        </div>
      )} />
      <div className="grid grid-cols-4 gap-2">
        {NUTRITION_TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`py-2.5 rounded-xl text-xs font-medium border transition ${activeTab===t.id ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>{t.label}</button>
        ))}
      </div>
      {activeTab==="today" && <TodayView state={state} actions={actions} />}
      {activeTab==="foods" && <FoodsView state={state} actions={actions} />}
      {activeTab==="dishes" && <DishesView state={state} actions={actions} />}
      {activeTab==="inventory" && <InventoryView state={state} actions={actions} />}
      {shareSection && (
        <>
          <ShareExportModal open={shareOpen} onClose={() => setShareOpen(false)} sectionId={shareSection} state={state} />
          <ShareImportModal open={importOpen} onClose={() => setImportOpen(false)} sectionId={shareSection} state={state} onImport={(parsed, reuse) => actions.importShared(shareSection, parsed, reuse)} />
        </>
      )}
    </div>
  );
}
