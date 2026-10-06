// Действия раздела «Заметки»: папки, заметки, закрепление и настройки раздела.
// Устроены как действия финансов — см. finance/actions.js.

import { todayStr, uid } from "../core/basics.js";
import { insertAt } from "../core/lists.js";
import { canMoveFolder, defaultNotesPrefs, folderBranchIds } from "./model.js";
import { AlertCircle, FolderPlus, Trash2 } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function notesActions({ setState, commit, pushToast }) {
  return {
    // id и дата всюду считаются ДО функции обновления, а не внутри: React вправе прогнать её
    // дважды, и запись получила бы два разных id (тот же принцип, что у addQuest).
    addNoteFolder(folder) {
      const id = uid(), today = todayStr();
      setState(prev => {
        const order = (prev.noteFolders||[]).filter(f => (f.parentId||null)===(folder.parentId||null)).length;
        return { ...prev, noteFolders: [...(prev.noteFolders||[]), { id, color:null, order, createdAt: today, ...folder }] };
      });
      pushToast("Папка создана", toastIcon(FolderPlus, "text-amber-400"));
    },

    updateNoteFolder(id, patch) {
      setState(prev => ({ ...prev, noteFolders: (prev.noteFolders||[]).map(f => f.id===id ? { ...f, ...patch } : f) }));
    },

    moveNoteFolder(id, parentId) {
      // Проверка ДО записи: кольцо в дереве — не косметический дефект, обход по нему не
      // завершается вовсе, и починить его через интерфейс уже нечем.
      commit((prev, defer) => {
        if (!canMoveFolder(prev.noteFolders||[], id, parentId)) {
          defer(() => pushToast("Папку нельзя вложить в саму себя", toastIcon(AlertCircle, "text-amber-400")));
          return prev;
        }
        return { ...prev, noteFolders: (prev.noteFolders||[]).map(f => f.id===id ? { ...f, parentId: parentId||null } : f) };
      });
    },

    deleteNoteFolder(id) {
      commit((prev, defer) => {
        const folders = prev.noteFolders || [];
        if (!folders.some(f => f.id===id)) return prev;
        const branch = folderBranchIds(folders, id);
        // Индексы снимаются в момент удаления — откат возвращает и папки, и заметки на прежние
        // места, а не сваливает их в начало списка (общий принцип insertAt по всему приложению).
        const removedFolders = folders.map((f,i) => ({ f, i })).filter(x => branch.includes(x.f.id));
        const removedNotes = (prev.notes||[]).map((n,i) => ({ n, i })).filter(x => branch.includes(x.n.folderId||null));
        defer(() => pushToast(
          removedNotes.length ? `Папка удалена вместе с заметками (${removedNotes.length})` : "Папка удалена",
          toastIcon(Trash2, "text-zinc-400"),
          () => setState(p2 => {
            let nf = p2.noteFolders || [];
            removedFolders.forEach(({ f, i }) => { nf = insertAt(nf, i, f); });
            let nn = p2.notes || [];
            removedNotes.forEach(({ n, i }) => { nn = insertAt(nn, i, n); });
            return { ...p2, noteFolders: nf, notes: nn };
          })));
        return {
          ...prev,
          noteFolders: folders.filter(f => !branch.includes(f.id)),
          notes: (prev.notes||[]).filter(n => !branch.includes(n.folderId||null)),
        };
      });
    },

    addNote(note) {
      const id = uid(), today = todayStr();
      setState(prev => ({ ...prev, notes: [{ id, title:"", body:"", folderId:null, pinned:false, createdAt: today, updatedAt: today, ...note }, ...(prev.notes||[])] }));
    },

    updateNote(id, patch) {
      const today = todayStr();
      setState(prev => ({ ...prev, notes: (prev.notes||[]).map(n => n.id===id ? { ...n, ...patch, updatedAt: today } : n) }));
    },

    toggleNotePinned(id) {
      setState(prev => ({ ...prev, notes: (prev.notes||[]).map(n => n.id===id ? { ...n, pinned: !n.pinned } : n) }));
    },

    deleteNote(id) {
      commit((prev, defer) => {
        const idx = (prev.notes||[]).findIndex(n => n.id===id);
        const removed = (prev.notes||[])[idx];
        if (!removed) return prev;
        defer(() => pushToast("Заметка удалена", toastIcon(Trash2, "text-zinc-400"),
          () => setState(p2 => ({ ...p2, notes: insertAt(p2.notes||[], idx, removed) }))));
        return { ...prev, notes: (prev.notes||[]).filter(n => n.id!==id) };
      });
    },

    updateNotesPrefs(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), notes: { ...defaultNotesPrefs(), ...(prev.uiPrefs && prev.uiPrefs.notes), ...patch } } }));
    },

    toggleNoteFolderExpanded(id) {
      setState(prev => {
        const cur = { ...defaultNotesPrefs(), ...(prev.uiPrefs && prev.uiPrefs.notes) };
        const expanded = (cur.expanded||[]).includes(id) ? cur.expanded.filter(x => x!==id) : [...(cur.expanded||[]), id];
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), notes: { ...cur, expanded } } };
      });
    },
  };
}
