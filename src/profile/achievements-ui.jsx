// Интерфейс достижений: карточка, форма своего достижения и раздел целиком.

import { useState } from "react";
import { clamp } from "../core/basics.js";
import { fmtDateShort } from "../core/format.js";
import {
  Button, EmptyState, Modal, ProgressBar, SectionHeader, StickyAddButton, inputCls, labelCls,
} from "../ui/atoms.jsx";
import { ACHIEVEMENT_ICONS, ACHIEVEMENT_ICON_KEYS, IconFor } from "../ui/icons.js";
import { IconPicker } from "../ui/pickers.jsx";
import { ACH_KINDS, achievementProgress } from "./achievements.js";
import { Award, Lock, X } from "lucide-react";

export function AchievementCard({ achievement, state, onDelete, compact }) {
  const prog = achievementProgress(achievement, state);
  const ratio = clamp(prog.target ? prog.current/prog.target : 0, 0, 1);
  const Icon = IconFor(achievement.icon);
  const unlocked = !!achievement.unlockedAt;
  return (
    <div className={`relative rounded-xl border p-3 flex flex-col shrink-0 ${unlocked ? "border-amber-500/30 bg-amber-500/10" : "border-zinc-800 bg-zinc-950/40"}`} style={compact ? { width:132 } : {}}>
      {onDelete && <button onClick={onDelete} className="absolute top-1.5 right-1.5 text-zinc-600 hover:text-red-400 p-1"><X className="w-3 h-3"/></button>}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${unlocked ? "bg-amber-500/20" : "bg-zinc-800"}`}>
        {unlocked ? <Icon className="w-5 h-5 text-amber-400"/> : <Lock className="w-4 h-4 text-zinc-600"/>}
      </div>
      <div className={`text-xs font-medium leading-tight ${unlocked ? "text-zinc-200" : "text-zinc-400"}`}>{achievement.title}</div>
      {achievement.desc && <div className="text-xs text-zinc-600 leading-tight mt-0.5">{achievement.desc}</div>}
      {!unlocked ? (
        <div className="mt-2">
          <ProgressBar value={ratio} heightClass="h-1" colorClass="bg-amber-500" />
          <div className="text-xs text-zinc-600 font-data mt-1">{Math.min(prog.current, prog.target)}/{prog.target}</div>
        </div>
      ) : (
        <div className="text-xs text-amber-500/70 font-data mt-2">Получено {fmtDateShort(achievement.unlockedAt)}</div>
      )}
    </div>
  );
}

function AchievementForm({ spheres, onSubmit, onCancel }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [icon, setIcon] = useState("Award");
  const [kind, setKind] = useState("level");
  const [target, setTarget] = useState(5);
  const [sphereId, setSphereId] = useState((spheres[0] && spheres[0].id) || "");

  function submit() {
    if (!title.trim() || !target) return;
    onSubmit({ title: title.trim(), desc: desc.trim(), icon, kind, target: Number(target)||1, sphereId: kind==="sphereLevel" ? sphereId : null });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Название</label>
        <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: Марафонец" autoFocus />
      </div>
      <div>
        <label className={labelCls}>Описание (необязательно)</label>
        <input className={inputCls} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Что нужно сделать" />
      </div>
      <div>
        <label className={labelCls}>Иконка</label>
        <IconPicker value={icon} onChange={setIcon} keys={ACHIEVEMENT_ICON_KEYS} icons={ACHIEVEMENT_ICONS} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Тип условия</label>
          <select className={inputCls} value={kind} onChange={e=>setKind(e.target.value)}>
            {Object.entries(ACH_KINDS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Цель ({ACH_KINDS[kind].unit})</label>
          <input type="number" min="1" className={inputCls} value={target} onChange={e=>setTarget(e.target.value)} />
        </div>
      </div>
      {kind==="sphereLevel" && (
        <div>
          <label className={labelCls}>Сфера</label>
          <select className={inputCls} value={sphereId} onChange={e=>setSphereId(e.target.value)}>
            {spheres.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit}>Создать</Button>
      </div>
    </div>
  );
}

export function AchievementsView({ state, actions }) {
  const [modalOpen, setModalOpen] = useState(false);
  const unlockedCount = (state.achievements||[]).filter(a => a.unlockedAt).length;
  return (
    <div className="space-y-5">
      <SectionHeader eyebrow={`${unlockedCount}/${(state.achievements||[]).length} получено`} title="Достижения" />
      {(!state.achievements || state.achievements.length===0) ? (
        <EmptyState icon={Award} title="Пока нет достижений" subtitle="Добавь своё условие — уровень, серия дней, накопления и другое." action={<Button size="sm" onClick={() => setModalOpen(true)}>Добавить</Button>} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {state.achievements.map(a => <AchievementCard key={a.id} achievement={a} state={state} onDelete={() => actions.deleteAchievement(a.id)} />)}
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Новое достижение">
        <AchievementForm spheres={state.spheres} onSubmit={(a) => { actions.addAchievement(a); setModalOpen(false); }} onCancel={() => setModalOpen(false)} />
      </Modal>
      <StickyAddButton onClick={() => setModalOpen(true)} label="Своё достижение" />
    </div>
  );
}
