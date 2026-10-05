// Профиль персонажа: карточка героя, сферы, достижения, настройки и магазин наград.

import { achievementProgress } from "./achievements.js";
import { useEffect, useMemo, useState } from "react";
import {
  Award, Cake, ChevronDown, Coins, Dumbbell, Flag, Flame, Pencil, Smile, Star, TrendingUp, Trophy,
} from "lucide-react";
import { fmtDateShort } from "../core/format.js";
import { imagePosStyle } from "../core/images.js";
import { levelFromXp, overallOf } from "../core/xp.js";
import { computeStreak, isLogHabit } from "../habits/model.js";
import {
  BODY_LEVELS, BODY_SEX, ageFromBirthDate, bmiOf, bodyWeightOf, defaultBody,
} from "../sport/model.js";
import {
  Button, Card, Modal, ProgressBar, SectionHeader, StickyAddButton, inputCls, labelCls,
} from "../ui/atoms.jsx";
import { IconFor, PEOPLE_ICONS } from "../ui/icons.js";
import { CoverPickerModal } from "../ui/pickers.jsx";
import { pal } from "../ui/theme.js";

/* ======================= ПРОФИЛЬ ПЕРСОНАЖА ======================= */
// Отдельный раздел, а не строчка в настройках: это карточка персонажа — то, ради чего вся
// система с уровнями и сферами и затевалась. Здесь же живут постоянные данные о человеке (пол,
// дата рождения, рост), потому что они описывают именно его, а не тренировочный процесс:
// изменчивые параметры (вес, инвентарь, ограничения) остаются в разделе «Спорт».

function ProfileStat({ icon:Icon, label, value, color="zinc" }) {
  const c = pal(color);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${c.text}`}/>
        <span className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</span>
      </div>
      <div className="font-data text-lg text-zinc-100">{value}</div>
    </div>
  );
}

export function ProfileView({ state, actions, navigate }) {
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const statsCollapsed = !!(state.uiPrefs && state.uiPrefs.profile && state.uiPrefs.profile.statsCollapsed);
  const body = state.profile.body || defaultBody();
  const overall = overallOf(state);
  const AvatarIcon = PEOPLE_ICONS[state.profile.avatarIcon] || Star;

  const weight = bodyWeightOf(state);
  const age = ageFromBirthDate(body.birthDate);
  const bmi = bmiOf(body.height, weight);

  const stats = useMemo(() => {
    const done = state.quests.filter(q => q.status==="done").length;
    const achievements = (state.achievements||[]).filter(a => achievementProgress(a, state).unlocked).length;
    const campaigns = (state.campaigns||[]).filter(c => c.status==="done").length;
    // Привычки за ведение в «лучшую серию» не входят: у них серии нет по замыслу, и они бы
    // молча раздували показатель, который человек считает своим достижением.
    const bestStreak = (state.habits||[]).filter(h => !isLogHabit(h)).reduce((m,h) => Math.max(m, computeStreak(h.logs||[])), 0);
    const workouts = (state.workoutLog||[]).filter(w => w.status==="done").length;
    return { done, achievements, campaigns, bestStreak, workouts };
  }, [state]);

  // Сферы как характеристики персонажа: у каждой свой уровень и полоса до следующего.
  const spheres = useMemo(() => state.spheres.map(sp => ({ ...sp, ...levelFromXp(sp.xp) })), [state.spheres]);
  const topSphere = spheres.slice().sort((a,b) => b.xp - a.xp)[0];

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Карточка персонажа" title="Профиль" />

      {/* Герой-блок: аватар, имя, уровень и полоса опыта. Верх намеренно «парадный» — это
          единственное место в приложении, где допустим декоративный градиент. */}
      <Card className="p-0 overflow-hidden">
        <div className="relative px-5 pt-6 pb-5"
          style={{ background:"radial-gradient(120% 140% at 50% -20%, rgba(245,158,11,0.18) 0%, rgba(9,9,11,0) 60%)" }}>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button onClick={() => setAvatarPickerOpen(true)} title="Сменить аватар"
              className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-amber-500/40 bg-zinc-900 flex items-center justify-center shrink-0 hover:border-amber-500/70 transition">
              {state.profile.avatarImage
                ? <img src={state.profile.avatarImage} className="w-full h-full object-cover" style={imagePosStyle(state.profile.avatarPos)} alt="" />
                : <AvatarIcon className="w-10 h-10 text-amber-400/80" />}
            </button>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="font-display text-2xl text-zinc-100 tracking-wide break-words">{state.profile.name}</span>
                <button onClick={() => setEditOpen(true)} className="text-zinc-600 hover:text-zinc-300 shrink-0"><Pencil className="w-3.5 h-3.5"/></button>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {[BODY_LEVELS[body.level], topSphere ? `сильнейшая сфера — ${topSphere.name}` : null].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5 text-amber-300 font-data">
                    <span className="w-6 h-6 rounded-lg bg-amber-500 text-zinc-950 flex items-center justify-center font-display text-xs">{overall.level}</span>
                    уровень
                  </span>
                  <span className="font-data text-zinc-500">{overall.xpIntoLevel}/{overall.xpForNext} XP</span>
                </div>
                <ProgressBar value={overall.ratio} colorClass="bg-amber-500" />
              </div>
            </div>
            <div className="flex sm:flex-col items-center gap-3 shrink-0">
              <span className="flex items-center gap-1.5 text-amber-300 font-data text-lg"><Coins className="w-5 h-5"/>{state.profile.currency}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Характеристики. Свернуть их полезно, когда сфер много: тогда досье и путь не уезжают
          на два экрана вниз. Состояние живёт в uiPrefs, как остальные свёрнутые секции. */}
      <div>
        <button onClick={() => actions.updateProfilePrefs({ statsCollapsed: !statsCollapsed })}
          className="w-full flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-zinc-200">Характеристики</span>
          <span className="text-xs font-data text-zinc-600">{spheres.length}</span>
          <ChevronDown className="w-4 h-4 text-zinc-600 transition-transform ml-auto" style={{ transform: statsCollapsed ? "rotate(-90deg)" : "none" }}/>
        </button>
        {!statsCollapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {spheres.map(sp => {
            const Icon = IconFor(sp.icon);
            const c = pal(sp.color);
            return (
              <button key={sp.id} onClick={() => navigate("spheres", sp.id)} className="text-left">
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${c.bgSoft} ${c.text} flex items-center justify-center shrink-0`}><Icon className="w-5 h-5"/></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-zinc-100 truncate">{sp.name}</span>
                        <span className={`font-data text-xs ${c.text}`}>ур. {sp.level}</span>
                      </div>
                      <div className="mt-1.5"><ProgressBar value={sp.ratio} colorClass={c.bgSolid} heightClass="h-1.5" /></div>
                      <div className="text-[10px] font-data text-zinc-600 mt-1">{sp.xpIntoLevel}/{sp.xpForNext} XP · всего {sp.xp}</div>
                    </div>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* Досье: постоянные данные о человеке. Вес показан справочно — меняется он в «Спорте»,
          где для этого есть журнал замеров и график. */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-zinc-200">Досье</div>
          <button onClick={() => setEditOpen(true)} className="text-xs text-amber-400 hover:text-amber-300 font-medium">Изменить</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <ProfileStat icon={Smile} label="Пол" value={BODY_SEX[body.sex] || "—"} />
          <ProfileStat icon={Cake} label="Возраст" value={age!=null ? `${age}` : "—"} />
          <ProfileStat icon={TrendingUp} label="Рост, см" value={body.height || "—"} />
          <ProfileStat icon={Dumbbell} label="Вес, кг" value={weight!=null ? weight : "—"} color="emerald" />
        </div>
        {bmi!=null && <div className="text-xs text-zinc-600 mt-2 font-data">ИМТ {bmi} — справочно, по росту и последнему замеру.</div>}
        {body.birthDate && <div className="text-xs text-zinc-600 mt-1 font-data">День рождения: {fmtDateShort(body.birthDate)}</div>}
      </Card>

      {/* Достижения пути */}
      <Card className="p-5">
        <div className="text-sm font-semibold text-zinc-200 mb-3">Путь</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <ProfileStat icon={Trophy} label="Квестов" value={stats.done} color="amber" />
          <ProfileStat icon={Flag} label="Кампаний" value={stats.campaigns} color="violet" />
          <ProfileStat icon={Flame} label="Лучшая серия" value={stats.bestStreak} color="orange" />
          <ProfileStat icon={Dumbbell} label="Тренировок" value={stats.workouts} color="emerald" />
          <ProfileStat icon={Award} label="Достижений" value={stats.achievements} color="sky" />
        </div>
      </Card>

      <CoverPickerModal open={avatarPickerOpen} onClose={() => setAvatarPickerOpen(false)} kind="person"
        iconValue={state.profile.avatarIcon} onPickIcon={(v) => actions.updateProfile({ avatarIcon:v, avatarImage:null })}
        imageUrl={state.profile.avatarImage} onPickImage={(v) => actions.updateProfile({ avatarImage:v, avatarPos:null })}
        imagePos={state.profile.avatarPos} onPickPos={(v) => actions.updateProfile({ avatarPos:v })}
      />
      <ProfileEditModal open={editOpen} onClose={() => setEditOpen(false)} state={state} actions={actions} />
      <StickyAddButton onClick={() => setEditOpen(true)} label="Редактировать" icon={Pencil} />
    </div>
  );
}

function ProfileEditModal({ open, onClose, state, actions }) {
  const body = state.profile.body || defaultBody();
  const [name, setName] = useState(state.profile.name);
  const [sex, setSex] = useState(body.sex || "");
  const [birthDate, setBirthDate] = useState(body.birthDate || "");
  const [height, setHeight] = useState(body.height ?? "");
  useEffect(() => {
    if (!open) return;
    setName(state.profile.name); setSex(body.sex || ""); setBirthDate(body.birthDate || ""); setHeight(body.height ?? "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function save() {
    actions.updateProfile({ name: name.trim() || "Путник" });
    actions.updateBody({ sex: sex || null, birthDate: birthDate || null, height: height==="" ? null : Number(height) });
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title="Персонаж">
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Имя персонажа</label>
          <input className={inputCls} value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Пол</label>
            <select className={inputCls} value={sex} onChange={e=>setSex(e.target.value)}>
              <option value="">Не указан</option>
              {Object.entries(BODY_SEX).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Дата рождения</label>
            <input type="date" className={inputCls} value={birthDate} onChange={e=>setBirthDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Рост, см</label>
          <input type="number" min="0" className={inputCls} value={height} onChange={e=>setHeight(e.target.value)} />
        </div>
        <div className="text-xs text-zinc-600">
          Вес и замеры записываются в разделе «Спорт» — там для них есть журнал и график.
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button onClick={save}>Сохранить</Button>
        </div>
      </div>
    </Modal>
  );
}
