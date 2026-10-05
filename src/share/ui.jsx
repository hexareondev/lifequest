// Интерфейс обмена: модалки выгрузки и загрузки файла плюс пара кнопок для шапок разделов.

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Share2, Upload } from "lucide-react";
import { todayStr } from "../core/basics.js";
import { collectionById } from "../library/collections.js";
import { LIBRARY_KINDS, libraryDisplayTitle } from "../library/constants.js";
import {
  SHARE_SCHEMAS, buildSharePayload, parseSharePayload, shareDefaultFieldIds, shareDuplicateMatches,
  shareGroupsOf, shareSectionItems,
} from "./model.js";
import { Button, Modal } from "../ui/atoms.jsx";

// Модалка "Поделиться": выбор записей + выбор полей + сборка файла. Списки записей и полей —
// обычные чекбоксы; обязательные поля показаны отмеченными и заблокированными, чтобы было видно,
// что они попадут в файл, но выключить их нельзя.
//
// initialSelectedIds — контекстный автовыбор от вызывающего раздела: открыта карточка — только
// она, открыта категория — её записи. Ничего не выбирать "на всякий случай" нельзя: выгрузить
// случайно всю библиотеку — куда неприятнее, чем нажать «Выбрать все».
// singleItemId — режим «поделиться именно этой карточкой»: список выбора записей не показывается
// вовсе (выбирать не из чего), остаётся только набор полей. Так кнопка из кебаба карточки ведёт
// сразу к делу и не предлагает случайно выгрузить заодно весь раздел.
export function ShareExportModal({ open, onClose, sectionId, state, onNotify, initialSelectedIds, singleItemId }) {
  const schema = SHARE_SCHEMAS[sectionId];
  const allItems = useMemo(() => (open ? shareSectionItems(sectionId, state) : []), [open, sectionId, state]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [fieldIds, setFieldIds] = useState(() => shareDefaultFieldIds(sectionId));
  const [grouped, setGrouped] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState([]);
  const [preview, setPreview] = useState("");

  // Каждое открытие — чистый лист: поля по умолчанию, выбор из контекста, без следов прошлого раза.
  useEffect(() => {
    if (!open) return;
    const available = shareSectionItems(sectionId, state).map(x => x.id);
    const wanted = singleItemId ? [singleItemId] : (initialSelectedIds || []);
    setSelectedIds(wanted.filter(id => available.includes(id)));
    setFieldIds(shareDefaultFieldIds(sectionId));
    setCollapsedGroups([]);
    setPreview("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sectionId]);

  const groups = grouped ? shareGroupsOf(sectionId, allItems) : null;
  const selectedItems = allItems.filter(x => selectedIds.includes(x.id));
  // «Выбрать все» работает только по видимым (развёрнутым) группам: свернув категорию, человек
  // явно убрал её из поля зрения, и молча выгружать её содержимое было бы неожиданно.
  const selectableItems = groups
    ? groups.filter(g => !collapsedGroups.includes(g.id)).flatMap(g => g.items)
    : allItems;
  const allSelected = selectableItems.length > 0 && selectableItems.every(x => selectedIds.includes(x.id));

  function toggleItem(id) {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(x=>x!==id) : [...ids, id]);
  }
  function toggleGroup(group) {
    const ids = group.items.map(x => x.id);
    const allIn = ids.every(id => selectedIds.includes(id));
    setSelectedIds(cur => allIn ? cur.filter(id => !ids.includes(id)) : Array.from(new Set([...cur, ...ids])));
  }
  function toggleField(f) {
    if (f.required) return;
    setFieldIds(ids => ids.includes(f.id) ? ids.filter(x=>x!==f.id) : [...ids, f.id]);
  }
  function handleBuild() {
    const payload = buildSharePayload(sectionId, selectedItems, fieldIds, state);
    const text = JSON.stringify(payload, null, 2);
    try {
      const blob = new Blob([text], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `questlife-${sectionId}-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onNotify && onNotify(`Файл собран: ${selectedItems.length} шт.`);
    } catch (e) {
      // Программное скачивание может быть заблокировано песочницей — тогда остаётся текстовое
      // поле ниже: выделить и скопировать вручную. Тот же запасной путь, что у полной выгрузки.
    }
    setPreview(text);
  }

  function renderRow(item) {
    const on = selectedIds.includes(item.id);
    return (
      <button key={item.id} onClick={() => toggleItem(item.id)}
        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${on ? "border-zinc-700 bg-zinc-800/60 text-zinc-200" : "border-zinc-800 text-zinc-500 hover:border-zinc-700"}`}>
        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-amber-500 border-transparent" : "border-zinc-600"}`}>
          {on && <Check className="w-3 h-3 text-zinc-950"/>}
        </span>
        <span className="truncate flex-1">{schema.itemLabel(item)}</span>
        {sectionId==="library" && !grouped && <span className="text-xs text-zinc-600 shrink-0">{LIBRARY_KINDS[item.libKind].singular}</span>}
      </button>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Поделиться: ${schema.label}`} maxWidth="max-w-xl">
      <div className="space-y-5">
        {singleItemId ? (
          <div className="text-sm text-zinc-300 px-3 py-2 rounded-lg border border-zinc-800">
            {(() => { const it = allItems.find(x => x.id===singleItemId); return it ? schema.itemLabel(it) : "Запись не найдена"; })()}
          </div>
        ) : (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="text-xs text-zinc-500 uppercase tracking-wide">Что выгрузить ({selectedIds.length}/{allItems.length})</div>
            <div className="flex items-center gap-2">
              {sectionId==="library" && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setGrouped(true)} className={`px-2 py-1 rounded-lg text-xs border transition ${grouped ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "border-zinc-800 text-zinc-600"}`}>Категориями</button>
                  <button onClick={() => setGrouped(false)} className={`px-2 py-1 rounded-lg text-xs border transition ${!grouped ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "border-zinc-800 text-zinc-600"}`}>Общим списком</button>
                </div>
              )}
              <button
                onClick={() => {
                  const ids = selectableItems.map(x=>x.id);
                  setSelectedIds(cur => allSelected ? cur.filter(id => !ids.includes(id)) : Array.from(new Set([...cur, ...ids])));
                }}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                {allSelected ? "Снять все" : "Выбрать все"}
              </button>
            </div>
          </div>
          {allItems.length === 0 ? (
            <div className="text-sm text-zinc-500">В этом разделе пока нечем делиться.</div>
          ) : groups ? (
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {groups.map(g => {
                const ids = g.items.map(x=>x.id);
                const inGroup = ids.filter(id => selectedIds.includes(id)).length;
                const isCollapsed = collapsedGroups.includes(g.id);
                return (
                  <div key={g.id}>
                    <div className="flex items-center justify-between mb-1">
                      <button
                        onClick={() => setCollapsedGroups(cur => cur.includes(g.id) ? cur.filter(x=>x!==g.id) : [...cur, g.id])}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition"
                      >
                        <ChevronDown className="w-3 h-3 shrink-0 transition-transform" style={{ transform: isCollapsed ? "rotate(-90deg)" : "none" }} />
                        {g.label} ({inGroup}/{g.items.length})
                      </button>
                      {!isCollapsed && (
                        <button onClick={() => toggleGroup(g)} className="text-xs text-zinc-600 hover:text-zinc-300">
                          {inGroup===g.items.length ? "Снять" : "Выбрать все"}
                        </button>
                      )}
                    </div>
                    {!isCollapsed && <div className="space-y-1">{g.items.map(renderRow)}</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto pr-1">{allItems.map(renderRow)}</div>
          )}
        </div>
        )}

        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Какие поля включить</div>
          <div className="flex flex-wrap gap-1.5">
            {schema.fields.map(f => {
              const on = f.required || fieldIds.includes(f.id);
              return (
                <button key={f.id} onClick={() => toggleField(f)} disabled={f.required}
                  title={f.required ? "Обязательное поле" : undefined}
                  className={`px-2.5 py-1 rounded-full text-xs border transition ${on ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-600 hover:text-zinc-300"} ${f.required ? "opacity-70 cursor-default" : ""}`}>
                  {f.label}{f.required ? " ·" : ""}
                </button>
              );
            })}
          </div>
          <div className="text-xs text-zinc-600 mt-2">{schema.excludedNote}</div>
        </div>

        {preview && (
          <div>
            <div className="text-xs text-zinc-500 mb-1">Если скачивание не сработало — скопируй текст вручную:</div>
            <textarea readOnly value={preview} onFocus={e=>e.target.select()}
              className="w-full h-28 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-[11px] font-data text-zinc-400" />
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Закрыть</Button>
          <Button onClick={handleBuild} disabled={selectedItems.length===0}>Собрать файл ({selectedItems.length})</Button>
        </div>
      </div>
    </Modal>
  );
}

// Модалка "Загрузить": файл или вставленный текст -> проверка на соответствие разделу ->
// предпросмотр списка -> добавление. Записи всегда ДОБАВЛЯЮТСЯ к текущим, ничего не перезаписывая:
// импорт чужой подборки не должен молча затирать своё.
export function ShareImportModal({ open, onClose, sectionId, state, onImport }) {
  const schema = SHARE_SCHEMAS[sectionId];
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  // Индексы записей, для которых человек выбрал «создать новую» вопреки найденному совпадению.
  // Хранится именно исключение, а не решение по каждой: по умолчанию дубликат не плодится, и
  // список пустой — то есть безопасное поведение не требует ни одного клика.
  const [forceNew, setForceNew] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setText(""); setParsed(null); setError(""); setForceNew([]);
  }, [open]);

  const duplicates = parsed && state ? shareDuplicateMatches(sectionId, parsed.items, state) : [];
  const reuse = {};
  duplicates.forEach(d => { if (!forceNew.includes(d.index)) reuse[d.index] = d.existing.id; });
  const reuseCount = Object.keys(reuse).length;

  function handleText(value) {
    setText(value);
    if (!value.trim()) { setParsed(null); setError(""); return; }
    const res = parseSharePayload(value, sectionId);
    if (res.ok) { setParsed(res); setError(""); setForceNew([]); }
    else { setParsed(null); setError(res.error); }
  }
  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleText(String(reader.result || ""));
    reader.onerror = () => setError("Не удалось прочитать файл.");
    reader.readAsText(file);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Загрузить: ${schema.label}`} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />
          <Button variant="secondary" onClick={() => fileRef.current && fileRef.current.click()}>Выбрать файл…</Button>
          <span className="text-xs text-zinc-600">или вставь содержимое ниже</span>
        </div>

        <textarea value={text} onChange={e=>handleText(e.target.value)} placeholder="Вставь содержимое файла…"
          className="w-full h-28 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-[11px] font-data text-zinc-300" />

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/><span>{error}</span>
          </div>
        )}

        {duplicates.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <div className="text-sm text-amber-200">
              Уже есть в библиотеке: {duplicates.length}. По умолчанию используются имеющиеся записи — копии не создаются.
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {duplicates.map(d => {
                const isNew = forceNew.includes(d.index);
                const inOther = d.existing.collectionId
                  ? collectionById(state.libraryCollections, d.existing.collectionId) : null;
                return (
                  <div key={d.index} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-zinc-800">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-200 truncate">{libraryDisplayTitle(d.existing)}</div>
                      {!isNew && inOther && (
                        <div className="text-[10px] text-amber-500/80 truncate">
                          сейчас в коллекции «{inOther.name}» — переедет в загружаемую
                        </div>
                      )}
                    </div>
                    <button onClick={() => setForceNew(l => isNew ? l.filter(x => x !== d.index) : [...l, d.index])}
                      className={`text-[11px] px-2 py-1 rounded-lg border shrink-0 transition ${isNew ? "border-amber-500/40 text-amber-300" : "border-zinc-800 text-zinc-500 hover:text-zinc-300"}`}>
                      {isNew ? "Создать новую" : "Использовать имеющуюся"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {parsed && (
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
              Будет добавлено ({parsed.items.length - reuseCount}{reuseCount ? ` из ${parsed.items.length}` : ""})
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
              {parsed.items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-800 text-sm text-zinc-300">
                  <span className="truncate flex-1">{schema.itemLabel(item)}</span>
                  {sectionId==="library" && item.libKind && LIBRARY_KINDS[item.libKind] && (
                    <span className="text-xs text-zinc-600 shrink-0">{LIBRARY_KINDS[item.libKind].singular}</span>
                  )}
                </div>
              ))}
            </div>
            {parsed.foods.length > 0 && (
              <div className="text-xs text-zinc-600 mt-2">
                Вместе с блюдами приедут продукты ({parsed.foods.length} шт.) — совпадающие по названию будут переиспользованы, а не продублированы.
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button disabled={!parsed} onClick={() => { onImport(parsed, reuse); onClose(); }}>
            Добавить{parsed ? ` (${parsed.items.length})` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Пара кнопок в шапке раздела. Вынесена отдельно, чтобы во всех четырёх местах подключения были
// одинаковые кнопки и одинаковое поведение, а не четыре похожие копии.
export function ShareButtons({ onShare, onImport }) {
  return (
    <>
      <Button variant="secondary" size="sm" onClick={onShare} title="Поделиться"><Share2 className="w-3.5 h-3.5"/>Поделиться</Button>
      <Button variant="secondary" size="sm" onClick={onImport} title="Загрузить файл"><Upload className="w-3.5 h-3.5"/>Загрузить</Button>
    </>
  );
}
