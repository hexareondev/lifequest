// Строка редактируемого списка: категории финансов, типы отношений. Лежит отдельно от атомов,
// потому что пользуется пикером цвета — а пикеры сами построены на атомах, и класть её к ним
// значило бы замкнуть импорты в кольцо.

import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import { ColorPicker } from "./pickers.jsx";
import { pal } from "./theme.js";

// Строка редактируемого списка (категории финансов / типы отношений людей) — общий паттерн:
// цвет, переименование через ColorPicker, удаление, порядок через drag-and-drop и дублирующие
// стрелки вверх/вниз (один и тот же onMove на оба способа). "Другое" всегда физически последняя
// и не участвует ни в перестановке, ни в удалении — она не draggable и без стрелок/корзины.
export function EditableListRow({ item, idx, movableCount, isPinned, isProtected, isRecoloring, onToggleRecolor, onRecolor, onDelete, onMove, isDragging, onDragStart, onDragOver, onDrop, onDragEnd }) {
  return (
    <div
      draggable={!isPinned}
      onDragStart={() => onDragStart(idx)}
      onDragOver={(e) => { if (!isPinned) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); if (!isPinned) onDrop(idx); }}
      onDragEnd={onDragEnd}
      className={`transition ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2 bg-zinc-950/50 border border-zinc-800 rounded-lg px-3 py-2">
        {!isPinned ? (
          <span className="text-zinc-700 shrink-0" style={{ cursor:"grab" }} title="Перетащить"><GripVertical className="w-3.5 h-3.5"/></span>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        <button onClick={onToggleRecolor} className="rounded-full shrink-0" style={{ width:16, height:16, backgroundColor: pal(item.color).hex }} title="Изменить цвет" />
        <span className="text-sm text-zinc-200 flex-1 truncate">{item.name}</span>
        {!isPinned && (
          <span className="flex items-center shrink-0">
            <button onClick={() => onMove(idx, idx-1)} disabled={idx<=0} className="p-1 text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed"><ChevronUp className="w-3.5 h-3.5"/></button>
            <button onClick={() => onMove(idx, idx+1)} disabled={idx>=movableCount-1} className="p-1 text-zinc-600 hover:text-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed"><ChevronDown className="w-3.5 h-3.5"/></button>
          </span>
        )}
        {!isProtected && <button onClick={onDelete} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>}
      </div>
      {isRecoloring && (
        <div className="mt-2 mb-1 px-1"><ColorPicker value={item.color} onChange={onRecolor} /></div>
      )}
    </div>
  );
}
