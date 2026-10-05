import React, { Suspense, lazy, useState, useEffect, useRef } from "react";
import { defaultFinanceTableFields } from "./finance/model.js";
import {
  ScrollText, CheckSquare, Wallet, Gem, X, Trash2, Pencil, Flame, Trophy, Coins, Sparkles, Shield,
  Users, BookOpen, TrendingUp, Check, Target, AlertCircle, Award, ListPlus, Archive, Dumbbell,
  EyeOff, Upload, Flag, Rocket, FolderPlus, Layers,
} from "lucide-react";
import { todayStr, uid } from "./core/basics.js";
import { questSphereIds, questPersonIds, questTouchesSphere, normalizeQuestLinks } from "./quests/links.js";
import { pluralRu } from "./core/format.js";
import { levelFromXp, overallOf } from "./core/xp.js";
import { fullTabOrder, visibleTabsOf } from "./core/tabs.js";
import {
  STORAGE_KEY, LEGACY_STORAGE_KEY, NOTES_STORAGE_KEY, normalizeState, defaultState, cleanState,
} from "./state/model.js";
import { HubView } from "./hub/ui.jsx";
import { achievementProgress } from "./profile/achievements.js";
import { AchievementsView } from "./profile/achievements-ui.jsx";
import { Sidebar, TopBar, LevelUpModal } from "./shell/ui.jsx";
import { CampaignDoneModal } from "./quests/campaign-done.jsx";
import { SettingsModal } from "./settings/ui.jsx";
import {
  computeLogRewardSettlement, computeSyncedBirthdayQuests, computeSyncedHabits, defaultLogRewards,
  extractActiveBirthdayQuest, isReadingGoalActiveOn,
} from "./habits/model.js";
import {
  HOLIDAYS, SUBTASK_PERSON_XP, computeSyncedHolidayQuests, extractActiveHolidayQuest,
} from "./quests/holidays.js";
import {
  applyCampaignSettlement, campaignStats, defaultCampaignReward, revertCampaignSettlement,
  settleCampaigns,
} from "./quests/campaigns.js";
import { insertAt, insertBeforeOther, moveInEditableList } from "./core/lists.js";
import {
  applyPlanSettlement, defaultBody, defaultSet, defaultSportGoal, latestBodyMeasure,
  revertPlanSettlement, workoutSetStats,
} from "./sport/model.js";
import { backupReminderState } from "./core/backup.js";
import {
  defaultApiKeys, defaultCalendarPrefs, defaultLibraryPrefs, defaultLibrarySources,
  defaultPeopleDetailPrefs, defaultQuestsPrefs,
} from "./core/prefs.js";
import {
  WATER_INGREDIENT_ID, defaultNutritionGoal, nutritionFromGrams, per100Of,
} from "./nutrition/model.js";
import { defaultEmojiPools, defaultEmojiAssignments } from "./ui/emoji-pools.js";
import { defaultPeopleCardFields } from "./people/model.js";
import {
  LIBRARY_KINDS, LIBRARY_KIND_ORDER, libraryStatusLabel, libraryDisplayTitle, clampLibraryProgress,
} from "./library/constants.js";
import {
  collectionById, canAnchorBranch, buildImportedLibraryItem, nextCollectionOrder,
  addToBranchPatches,
} from "./library/collections.js";
import { defaultMiscPrefs } from "./misc/model.js";
import { defaultNotesPrefs, folderBranchIds, canMoveFolder } from "./notes/model.js";
import { GlobalStyles, ToastStack } from "./ui/atoms.jsx";

// Комментарии внутри самого списка импорта недопустимы — их не переваривает загрузчик
// артефактов, который разбирает блок импорта построчно.

// Разделы грузятся лениво: при старте приезжают только оболочка, Хаб и настройки, а код раздела
// подтягивается при первом заходе на его вкладку. Из ленивого модуля нельзя ничего импортировать
// статически — одно такое имя, и весь раздел снова уезжает в стартовый файл.
const lazyView = (load, name) => lazy(() => load().then(m => ({ default: m[name] })));
const CalendarView = lazyView(() => import("./calendar/ui.jsx"), "CalendarView");
const QuestsView = lazyView(() => import("./quests/ui.jsx"), "QuestsView");
const HabitsView = lazyView(() => import("./quests/ui.jsx"), "HabitsView");
const SpheresView = lazyView(() => import("./quests/ui.jsx"), "SpheresView");
const PeopleView = lazyView(() => import("./people/ui.jsx"), "PeopleView");
const LibraryView = lazyView(() => import("./library/ui.jsx"), "LibraryView");
const NotesView = lazyView(() => import("./notes/ui.jsx"), "NotesView");
const MiscView = lazyView(() => import("./misc/ui.jsx"), "MiscView");
const NutritionView = lazyView(() => import("./nutrition/ui.jsx"), "NutritionView");
const SportView = lazyView(() => import("./sport/ui.jsx"), "SportView");
const ProfileView = lazyView(() => import("./profile/ui.jsx"), "ProfileView");
const FinanceView = lazyView(() => import("./finance/ui.jsx"), "FinanceView");
const RewardsView = lazyView(() => import("./rewards/ui.jsx"), "RewardsView");

/* =================================== APP =================================== */

export default function App() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("hub");
  const [sphereFocus, setSphereFocus] = useState(null);
  const [peopleFocus, setPeopleFocus] = useState(null);
  const [libraryFocus, setLibraryFocus] = useState(null);
  const [notesFocus, setNotesFocus] = useState(null);
  const [toasts, setToasts] = useState([]);
  // Страховка от задвоения тостов (см. pushToast ниже) — если что-то попытается показать
  // абсолютно тот же тост дважды подряд (типичная причина: React в StrictMode при разработке
  // намеренно вызывает функцию-обновление setState дважды, чтобы проверить её чистоту — если
  // внутри такой функции случайно оказался побочный эффект вроде pushToast, он сработает столько
  // же раз), вторую попытку молча игнорируем.
  const [levelUp, setLevelUp] = useState(null);
  // Празднование завершённой кампании: подведение итогов + анимированное начисление XP и уровня.
  const [campaignDone, setCampaignDone] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const backupReminder = backupReminderState(state && state.lastBackupAt, todayStr());

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      // Заметки лежат своим ключом. Если его нет — они могут прийти из основного сохранения
      // (так выглядит только что импортированный полный бэкап, где всё было в одном файле).
      const rawNotes = localStorage.getItem(NOTES_STORAGE_KEY);
      const notesPart = rawNotes ? JSON.parse(rawNotes) : null;
      if (!cancelled && raw) {
        const parsed = JSON.parse(raw);
        if (notesPart) { parsed.notes = notesPart.notes; parsed.noteFolders = notesPart.noteFolders; }
        setState(normalizeState(parsed));
      }
      // Демо-данные первого запуска тоже прогоняем через normalizeState: иначе новые поля
      // (например, accountId у операций) пришлось бы дублировать вручную в каждой демо-строке и
      // легко забыть при следующем расширении модели.
      else if (!cancelled) setState(normalizeState(defaultState()));
    } catch (e) {
      if (!cancelled) setState(normalizeState(defaultState()));
    } finally {
      if (!cancelled) setLoaded(true);
    }
    return () => { cancelled = true; };
  }, []);

  // Переполнение хранилища раньше проглатывалось молча: запись переставала проходить, интерфейс
  // продолжал выглядеть рабочим, и всё сделанное после этого терялось при перезагрузке вкладки.
  // Предупреждаем один раз за сессию — повторять на каждой правке бессмысленно и назойливо.
  const storageWarnedRef = useRef(false);
  function warnStorageFull() {
    if (storageWarnedRef.current) return;
    storageWarnedRef.current = true;
    pushToast("Хранилище браузера переполнено — изменения не сохраняются. Выгрузи бэкап в Настройки → Данные.",
      <AlertCircle className="w-4 h-4 text-red-400"/>);
  }

  // Основное сохранение — БЕЗ заметок: иначе каждая буква в редакторе заметки перегоняла бы в
  // строку финансы, спорт и календарь целиком.
  useEffect(() => {
    if (!loaded || !state) return;
    const t = setTimeout(() => {
      try {
        const { notes, noteFolders, ...rest } = state;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
      } catch (e) { warnStorageFull(); }
    }, 350);
    return () => clearTimeout(t);
  }, [state, loaded]);

  // Заметки — своим ключом и своим таймером: отметка подхода в тренировке не переписывает текст,
  // а текст не переписывает всё остальное. Пауза чуть длиннее — набор идёт очередями.
  useEffect(() => {
    if (!loaded || !state) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ notes: state.notes || [], noteFolders: state.noteFolders || [] }));
      } catch (e) { warnStorageFull(); }
    }, 600);
    return () => clearTimeout(t);
  }, [state && state.notes, state && state.noteFolders, loaded]);

  // Если текущая вкладка спрятана настройками меню (или это было сделано в другой сессии,
  // подхваченной импортом/синком) — не оставлять пользователя на невидимой вкладке.
  // Профиль — исключение: его прячут из СПИСКА, но вход в него остаётся через плашку персонажа
  // внизу меню. Без этой оговорки клик по плашке отбрасывал обратно на Хаб.
  useEffect(() => {
    if (!state) return;
    if (tab === "profile") return;
    if (!visibleTabsOf(state).some(t => t.id===tab)) setTab("hub");
  }, [state && state.uiPrefs, tab]);

  // Держим отметку "получено" на достижениях в актуальном состоянии: как только условие
  // выполнено впервые — фиксируем дату. unlockedAt никогда не сбрасывается сам по себе.
  useEffect(() => {
    if (!loaded || !state) return;
    setState(prev => {
      let changed = false;
      const achievements = (prev.achievements||[]).map(a => {
        if (a.unlockedAt) return a;
        if (achievementProgress(a, prev).unlocked) { changed = true; return { ...a, unlockedAt: todayStr() }; }
        return a;
      });
      return changed ? { ...prev, achievements } : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, state && state.spheres, state && state.quests, state && state.habits, state && state.profile && state.profile.currency, state && state.transactions]);

  // Синхронизация авто-привычек (БЖУ/калории, вода, чтение) с активными целями + доначисление
  // награды за неурегулированные дни. Зависимости — только то, что НЕ пишет сам этот эффект
  // (nutritionLog/nutritionGoal/books/readingLog), иначе будет бесконечный цикл; habits/spheres/
  // profile.currency он трогает сам, поэтому их в списке зависимостей нет — тот же приём, что и в
  // эффекте достижений выше.
  useEffect(() => {
    if (!loaded || !state) return;
    const prevLevel = overallOf(state).level;
    commit((prev, defer) => {
      const res = computeSyncedHabits(prev, todayStr());
      // Поощрения за ведение считаются здесь же: та же идемпотентность, тот же commit, но своё
      // хранилище отметок (logRewards.claimed) — привычки для этого больше не используются.
      const bonus = computeLogRewardSettlement(res.changed ? { ...prev, habits:res.habits } : prev, todayStr());
      if (!res.changed && !bonus.changed) return prev;
      let spheres = res.changed ? res.spheres : prev.spheres;
      let currency = res.changed ? res.currency : prev.profile.currency;
      let logRewards = prev.logRewards;
      let bonusXp = 0;
      if (bonus.changed) {
        Object.entries(bonus.xpBySphere).forEach(([sphereId, xp]) => {
          spheres = spheres.map(sp => sp.id===sphereId ? { ...sp, xp: sp.xp + xp } : sp);
          bonusXp += xp;
        });
        currency += bonus.currency;
        logRewards = { ...(prev.logRewards||defaultLogRewards()), claimed: bonus.claimed };
      }
      const newState = { ...prev, habits: res.changed ? res.habits : prev.habits, spheres, logRewards, profile: { ...prev.profile, currency } };
      if (bonusXp > 0) {
        defer(() => pushToast(`Поощрение за ведение: +${bonusXp} XP за ${bonus.days} ${pluralRu(bonus.days,"день","дня","дней")}`,
          <Sparkles className="w-4 h-4 text-amber-400"/>));
      }
      if (res.changed && res.totalXpDelta > 0) {
        defer(() => {
          pushToast(`Автоцели засчитаны: +${res.totalXpDelta} XP`, <Flame className="w-4 h-4 text-orange-400"/>);
          const newLevel = levelFromXp(spheres.reduce((a,s)=>a+s.xp,0)).level;
          if (newLevel > prevLevel) setLevelUp(newLevel);
        });
      }
      return newState;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, state && state.nutritionLog, state && state.nutritionGoal, state && state.books, state && state.readingLog]);

  // Синхронизация авто-квестов "Поздравить с ДР" (ТЗ «Календарь», раздел 2.1). Зависимость —
  // только state.people (+ раз в сутки естественно перезапустится вместе с остальным при новом
  // todayStr()), НЕ state.quests — иначе цикл, тот же приём, что и в эффекте привычек выше.
  useEffect(() => {
    if (!loaded || !state) return;
    setState(prev => {
      const res = computeSyncedBirthdayQuests(prev.quests, prev.people, todayStr());
      if (!res.changed) return prev;
      return { ...prev, quests:res.quests, people:res.people };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, state && state.people]);

  // Синхронизация авто-квестов на праздники — тот же приём, что и у ДР выше: зависимость только на
  // state.people (составы привязанных людей меняются вместе с людьми) и state.holidaySubscriptions
  // (собственно подписки), НЕ state.quests — иначе цикл.
  useEffect(() => {
    if (!loaded || !state) return;
    setState(prev => {
      const res = computeSyncedHolidayQuests(prev.quests, prev.holidaySubscriptions, prev.people, todayStr());
      if (!res.changed) return prev;
      return { ...prev, quests:res.quests, holidaySubscriptions:res.holidaySubscriptions };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, state && state.people, state && state.holidaySubscriptions]);

  // Единственная точка, через которую действия меняют состояние ВМЕСТЕ с побочным эффектом
  // (тост, модалка левелапа и т.п.).
  //
  // Зачем вообще: React не гарантирует, что updater-функция, переданная в setState, будет вызвана
  // ровно один раз — StrictMode в разработке вызывает её дважды намеренно (проверка на чистоту), а
  // конкурентный рендер может переиграть обновление. Поэтому updater обязан быть ЧИСТЫМ: только
  // посчитать и вернуть новое состояние. Побочный эффект, выполненный внутри него (в том числе
  // отложенный через setTimeout), сработает столько же раз, сколько вызван updater — это давало
  // два тоста с "Отменить" на одно выполнение и позволяло откатить награду дважды.
  //
  // Почему именно так, а не "запомнить эффект в локальную переменную и вызвать сразу после
  // setState": React вызывает updater синхронно только КАК ОПТИМИЗАЦИЮ и только когда очередь
  // обновлений этого состояния пуста. Стоит появиться незавершённым обновлениям (а после
  // нескольких быстрых действий подряд это обычное дело) — и updater откладывается до фазы
  // рендера. Локальная переменная к этому моменту уже прочитана, эффект теряется: действие
  // выполняется, а тост с возможностью отката не появляется вовсе.
  //
  // Надёжный вариант: эффект регистрируется не в локальной переменной, а в ref под уникальным
  // токеном вызова. Сколько бы раз React ни прогнал updater — запись одна (перезаписывается по
  // тому же ключу). Флашим в двух местах, что бы ни случилось раньше: в микрозадаче (покрывает
  // синхронное вычисление, в том числе случай, когда состояние не изменилось и React вообще не
  // перерисовывает — тогда эффекта после рендера не дождаться) и в useEffect после рендера
  // (покрывает отложенное вычисление). Флаш очищает очередь, поэтому второй вызов — пустой no-op.
  const pendingEffectsRef = useRef(new Map());
  const effectTokenRef = useRef(0);

  function flushPendingEffects() {
    const map = pendingEffectsRef.current;
    if (!map.size) return;
    const fns = Array.from(map.values());
    map.clear();
    fns.forEach(fn => fn());
  }

  useEffect(() => { flushPendingEffects(); });

  function commit(updater) {
    const token = ++effectTokenRef.current;
    setState(prev => updater(prev, (fn) => { pendingEffectsRef.current.set(token, fn); }));
    queueMicrotask(flushPendingEffects);
  }

  function pushToast(text, icon, undo) {
    const id = uid();
    setToasts(ts => [...ts, { id, text, icon, undo }]);
    setTimeout(() => setToasts(ts => ts.filter(t=>t.id!==id)), undo ? 6000 : 3200);
  }

  function handleUndo(id) {
    setToasts(ts => {
      const t = ts.find(x => x.id===id);
      if (t && t.undo) t.undo();
      return ts.filter(x => x.id!==id);
    });
  }

  function navigate(nextTab, focus) {
    setTab(nextTab);
    if (focus) {
      if (nextTab === "spheres") setSphereFocus(focus);
      else if (nextTab === "people") setPeopleFocus(focus);
      else if (nextTab === "library") setLibraryFocus(focus);
      else if (nextTab === "notes") setNotesFocus(focus);
    }
    setNavOpen(false);
  }

  const actions = {
    // Простое уведомление без отката — для мест, где действие происходит вне состояния
    // (скачивание файла, копирование в буфер), но человеку нужно подтверждение, что оно прошло.
    notify(text) { pushToast(text, <Check className="w-4 h-4 text-emerald-400"/>); },
    addQuest(q) {
      // Новый квест в уже завершённой кампании возвращает её в активные — появился незакрытый
      // хвост. Повторной награды при следующем закрытии не будет: claimedFinal остался стоять
      // (сбросить его можно вручную, пункт «Разрешить награду снова» в кебабе кампании).
      // id генерируется ДО updater-а: React может прогнать его несколько раз, и внутри значение
      // получалось бы разным на каждом прогоне — updater обязан быть детерминированным.
      const quest = normalizeQuestLinks({ id:uid(), status:"active", subtasks:[], createdAt:todayStr(), ...q });
      commit((prev, defer) => {
        const quests = [quest, ...prev.quests];
        const { campaigns } = settleCampaigns(prev.campaigns, quests);
        defer(() => pushToast("Квест создан", <ScrollText className="w-4 h-4 text-amber-400"/>));
        return { ...prev, quests, campaigns };
      });
    },
    // Правка квеста может переставить его в другую кампанию (или вынуть из неё) — обе кампании
    // нужно пересчитать. Награду это выдать может: если квест-провал перенесли из кампании, где
    // всё остальное выполнено, она честно закрывается.
    updateQuest(id, patch) {
      commit((prev, defer) => {
        const quests = prev.quests.map(q => q.id===id ? { ...q, ...patch } : q);
        const { state: next, rewards } = applyCampaignSettlement(prev, quests);
        if (rewards.length) defer(() => rewards.forEach(r => pushToast(`Кампания завершена: ${r.title}`, <Flag className="w-4 h-4 text-amber-400"/>)));
        return next;
      });
    },
    deleteQuest(id) {
      commit((prev, defer) => {
        const removedIdx = prev.quests.findIndex(q => q.id===id);
        const removed = prev.quests[removedIdx];
        if (!removed) return prev;
        const quests = prev.quests.filter(q => q.id!==id);
        // Удаление проваленного квеста может ЗАКРЫТЬ кампанию (провал завершение блокирует) —
        // поэтому пересчёт обязателен и здесь, а undo обязан отобрать ровно то, что выдано.
        const { state: next, rewards } = applyCampaignSettlement(prev, quests);
        defer(() => {
          pushToast("Квест удалён", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
            setState(p2 => {
              const reverted = revertCampaignSettlement(p2, rewards);
              return { ...reverted, quests: insertAt(reverted.quests, removedIdx, removed) };
            });
          });
          rewards.forEach(r => pushToast(`Кампания завершена: ${r.title} · +${r.xp} XP, +${r.gold} золота`, <Flag className="w-4 h-4 text-amber-400"/>));
        });
        return next;
      });
    },
    // Подзадачи с personId (только у мульти-праздничных квестов, см. computeSyncedHolidayQuests) —
    // отметка/снятие сразу начисляет/списывает этому человеку небольшую награду, симметрично и
    // идемпотентно (тот же принцип, что completeQuest/reopenQuest: сам toggle done — единственный
    // источник истины, отдельного "claimed"-множества не нужно). У обычных подзадач personId нет —
    // для них ветка ниже просто не срабатывает, поведение не меняется.
    toggleSubtask(questId, subId) {
      setState(prev => {
        const quest = prev.quests.find(q => q.id===questId);
        if (!quest) return prev;
        const sub = (quest.subtasks||[]).find(s => s.id===subId);
        if (!sub) return prev;
        const newDone = !sub.done;
        const quests = prev.quests.map(q => q.id!==questId ? q : { ...q, subtasks: q.subtasks.map(s => s.id!==subId ? s : { ...s, done:newDone }) });
        let people = prev.people;
        if (sub.personId) {
          const delta = newDone ? SUBTASK_PERSON_XP : -SUBTASK_PERSON_XP;
          people = (prev.people||[]).map(p => p.id===sub.personId ? { ...p, xp: Math.max(0, p.xp + delta) } : p);
        }
        return { ...prev, quests, people };
      });
    },
    completeQuest(id) {
      // Побочные эффекты — только через defer (см. commit выше): updater обязан оставаться чистым,
      // иначе повторный вызов React-ом продублирует тост, а вместе с ним и возможность отката —
      // по каждому дубликату можно было бы вернуть полную награду, суммарно больше выданной.
      commit((prev, defer) => {
        const quest = prev.quests.find(q => q.id===id);
        if (!quest || quest.status!=="active") return prev;
        const prevLevel = overallOf(prev).level;
        const prevTotalXp = prev.spheres.reduce((a,s)=>a+s.xp,0);
        const sphereIds = questSphereIds(quest), personIds = questPersonIds(quest);
        const rewardXp = quest.rewardXp||0, rewardGold = quest.rewardGold||0;
        const quests = prev.quests.map(q => q.id===id ? { ...q, status:"done", completedAt:todayStr() } : q);
        // Каждой связанной сфере — полная награда, а не доля: делёж превратил бы честное
        // указание всех затронутых сфер в наказание, и указывать их перестали бы.
        const spheres = prev.spheres.map(s => sphereIds.includes(s.id) ? { ...s, xp: s.xp + rewardXp } : s);
        const people = personIds.length ? (prev.people||[]).map(p => personIds.includes(p.id) ? { ...p, xp: p.xp + rewardXp } : p) : prev.people;
        const afterQuest = { ...prev, quests, spheres, people, profile: { ...prev.profile, currency: prev.profile.currency + rewardGold } };
        // Кампания могла закрыться именно этим квестом — считаем в том же чистом updater-е, а не
        // отдельным эффектом: эффект не умеет откатываться вместе с undo-тостом, а здесь это
        // обязательное требование.
        const { state: next, rewards } = applyCampaignSettlement(afterQuest, quests);
        const newTotalXp = next.spheres.reduce((a,s)=>a+s.xp,0);
        const newLevel = levelFromXp(newTotalXp).level;
        defer(() => {
          pushToast(`Квест выполнен: +${rewardXp} XP, +${rewardGold} золота`, <Trophy className="w-4 h-4 text-amber-400"/>, () => {
            setState(p2 => {
              const reverted = revertCampaignSettlement(p2, rewards);
              return {
                ...reverted,
                quests: reverted.quests.map(q => q.id===id ? { ...q, status:"active", completedAt:null } : q),
                spheres: reverted.spheres.map(s => sphereIds.includes(s.id) ? { ...s, xp: Math.max(0, s.xp-rewardXp) } : s),
                people: personIds.length ? (reverted.people||[]).map(p => personIds.includes(p.id) ? { ...p, xp: Math.max(0, p.xp-rewardXp) } : p) : reverted.people,
                profile: { ...reverted.profile, currency: Math.max(0, reverted.profile.currency-rewardGold) },
              };
            });
          });
          // Празднование кампании перекрывает обычный левелап: уровень показывается внутри него,
          // иначе на одно действие вылезали бы две модалки подряд.
          if (rewards.length) {
            const r = rewards[0];
            const st = campaignStats(quests, { id: r.campaignId });
            setCampaignDone({ ...r, prevLevel, newLevel, prevTotalXp, newTotalXp, questCount: st.total, days: st.days });
          } else if (newLevel > prevLevel) setLevelUp(newLevel);
        });
        return next;
      });
    },
    // Провал завершение кампании блокирует (см. campaignIsComplete) — поэтому провалить квест
    // кампанию не закрывает, а вот УЖЕ закрытую может открыть обратно; пересчёт нужен и здесь.
    failQuest(id) {
      commit((prev) => {
        const quests = prev.quests.map(q => q.id===id ? { ...q, status:"failed" } : q);
        const { campaigns } = settleCampaigns(prev.campaigns, quests);
        return { ...prev, quests, campaigns };
      });
    },
    // «Вернуть в работу» — не откат, а новое решение: награда за квест и финальная награда
    // кампании НЕ отбираются (принцип «без клавбэка»), кампания просто снова становится активной.
    reopenQuest(id) {
      commit((prev) => {
        const quests = prev.quests.map(q => q.id===id ? { ...q, status:"active" } : q);
        const { campaigns } = settleCampaigns(prev.campaigns, quests);
        return { ...prev, quests, campaigns };
      });
    },

    /* -------------------------------- Спорт -------------------------------- */

    updateBody(patch) {
      setState(prev => ({ ...prev, profile: { ...prev.profile, body: { ...defaultBody(), ...(prev.profile.body||{}), ...patch } } }));
    },
    // Замер веса и обхватов. profile.body.weight — производное от журнала: обновляем его только
    // если добавленный замер оказался САМЫМ СВЕЖИМ, иначе запись задним числом перетирала бы
    // текущий вес более старым значением.
    addBodyMeasure(data) {
      const measure = { id: uid(), waist:null, chest:null, hips:null, bodyFat:null, notes:"", ...data };
      commit((prev, defer) => {
        const bodyLog = [...prev.bodyLog, measure].sort((a,b) => a.date.localeCompare(b.date));
        const latest = latestBodyMeasure(bodyLog);
        defer(() => pushToast("Замер записан", <TrendingUp className="w-4 h-4 text-emerald-400"/>, () => {
          setState(p2 => {
            const rest = p2.bodyLog.filter(m => m.id!==measure.id);
            const back = latestBodyMeasure(rest);
            return { ...p2, bodyLog: rest, profile: { ...p2.profile, body: { ...p2.profile.body, weight: back ? Number(back.weight) : null } } };
          });
        }));
        return { ...prev, bodyLog, profile: { ...prev.profile, body: { ...prev.profile.body, weight: latest ? Number(latest.weight) : null } } };
      });
    },
    deleteBodyMeasure(id) {
      commit((prev, defer) => {
        const idx = prev.bodyLog.findIndex(m => m.id===id);
        const removed = prev.bodyLog[idx];
        if (!removed) return prev;
        const bodyLog = prev.bodyLog.filter(m => m.id!==id);
        const latest = latestBodyMeasure(bodyLog);
        defer(() => pushToast("Замер удалён", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => {
            const back = insertAt(p2.bodyLog, idx, removed);
            const l = latestBodyMeasure(back);
            return { ...p2, bodyLog: back, profile: { ...p2.profile, body: { ...p2.profile.body, weight: l ? Number(l.weight) : null } } };
          });
        }));
        return { ...prev, bodyLog, profile: { ...prev.profile, body: { ...prev.profile.body, weight: latest ? Number(latest.weight) : null } } };
      });
    },

    setSportGoal(patch) {
      commit((prev, defer) => {
        const sportGoal = { ...defaultSportGoal(), ...prev.sportGoal, ...patch };
        defer(() => pushToast("Цель обновлена", <Target className="w-4 h-4 text-emerald-400"/>));
        return { ...prev, sportGoal };
      });
    },
    // План создаётся вместе со своими сессиями одной операцией — и одной же откатывается.
    addTrainingPlan(data, sessionsBuilder) {
      const plan = {
        id: uid(), title: data.title, description: data.description || "",
        status: "active", startDate: data.startDate, weeks: data.weeks,
        claimedFinal: false, completedAt: null, reward: { grantedXp:null, grantedGold:null },
        source: "manual", importedAt: null, createdAt: todayStr(),
      };
      commit((prev, defer) => {
        const sessions = sessionsBuilder(plan, prev);
        defer(() => pushToast(
          `План создан: ${sessions.length} ${pluralRu(sessions.length,"тренировка","тренировки","тренировок")}`,
          <Rocket className="w-4 h-4 text-emerald-400"/>,
          () => setState(p2 => ({
            ...p2,
            trainingPlans: p2.trainingPlans.filter(x => x.id!==plan.id),
            workoutLog: p2.workoutLog.filter(w => w.planId!==plan.id),
          }))
        ));
        return { ...prev, trainingPlans: [plan, ...prev.trainingPlans], workoutLog: [...sessions, ...prev.workoutLog] };
      });
      return plan.id;
    },
    // Импорт плана: план, его тренировки и недостающие упражнения появляются одной операцией — и
    // одной же откатываются. Undo обязателен: разгребать руками восемнадцать ошибочно
    // загруженных тренировок — худший сценарий этой функции.
    importTrainingPlan(plan, sessions, newExercises) {
      commit((prev, defer) => {
        const newIds = new Set((newExercises||[]).map(e => e.id));
        defer(() => pushToast(
          `План загружен: ${sessions.length} ${pluralRu(sessions.length,"тренировка","тренировки","тренировок")}` +
          ((newExercises||[]).length ? `, новых упражнений ${newExercises.length}` : ""),
          <Rocket className="w-4 h-4 text-emerald-400"/>,
          () => setState(p2 => ({
            ...p2,
            trainingPlans: p2.trainingPlans.filter(x => x.id!==plan.id),
            workoutLog: p2.workoutLog.filter(w => w.planId!==plan.id),
            exercises: p2.exercises.filter(e => !newIds.has(e.id)),
          }))
        ));
        return {
          ...prev,
          trainingPlans: [plan, ...prev.trainingPlans],
          workoutLog: [...sessions, ...prev.workoutLog],
          exercises: [...(newExercises||[]), ...prev.exercises],
        };
      });
    },
    updateTrainingPlan(id, patch) {
      setState(prev => ({ ...prev, trainingPlans: prev.trainingPlans.map(pl => pl.id===id ? { ...pl, ...patch } : pl) }));
    },
    archiveTrainingPlan(id, archived) {
      commit((prev, defer) => {
        const plans = prev.trainingPlans.map(pl => pl.id===id ? { ...pl, status: archived ? "archived" : "active" } : pl);
        const { state: next, rewards } = applyPlanSettlement({ ...prev, trainingPlans: plans }, prev.workoutLog);
        defer(() => {
          pushToast(archived ? "План в архиве" : "План возвращён из архива", <Archive className="w-4 h-4 text-zinc-400"/>);
          rewards.forEach(r => pushToast(`План пройден: ${r.title} · +${r.xp} XP`, <Rocket className="w-4 h-4 text-emerald-400"/>));
        });
        return next;
      });
    },
    // Два удаления, как у кампаний: только план (сессии остаются в журнале как свободные) либо
    // вместе с сессиями. Пункт кебаба прямо называет последствие, вместо модального вопроса.
    deleteTrainingPlan(id, withSessions) {
      commit((prev, defer) => {
        const idx = prev.trainingPlans.findIndex(pl => pl.id===id);
        const removed = prev.trainingPlans[idx];
        if (!removed) return prev;
        const affected = prev.workoutLog.map((w,i) => ({ w, i })).filter(x => x.w.planId===id);
        const workoutLog = withSessions
          ? prev.workoutLog.filter(w => w.planId!==id)
          : prev.workoutLog.map(w => w.planId===id ? { ...w, planId:null, sessionId:null } : w);
        const n = affected.length;
        defer(() => pushToast(
          withSessions ? `План и ${n} ${pluralRu(n,"тренировка","тренировки","тренировок")} удалены` : "План удалён, тренировки остались",
          <Trash2 className="w-4 h-4 text-zinc-400"/>,
          () => setState(p2 => {
            let log = p2.workoutLog;
            if (withSessions) affected.forEach(x => { log = insertAt(log, x.i, x.w); });
            else log = log.map(w => {
              const src = affected.find(x => x.w.id===w.id);
              return src ? { ...w, planId:id, sessionId: src.w.sessionId } : w;
            });
            return { ...p2, trainingPlans: insertAt(p2.trainingPlans, idx, removed), workoutLog: log };
          })
        ));
        return { ...prev, trainingPlans: prev.trainingPlans.filter(pl => pl.id!==id), workoutLog };
      });
    },
    addExercise(data) {
      const ex = { id: uid(), kind:"strength", muscles:[], defaultLoad:{ sets:3, reps:10 }, notes:"", archived:false, createdAt: todayStr(), ...data };
      commit((prev, defer) => {
        defer(() => pushToast("Упражнение добавлено", <Dumbbell className="w-4 h-4 text-emerald-400"/>));
        return { ...prev, exercises: [ex, ...prev.exercises] };
      });
      return ex.id;
    },
    updateExercise(id, patch) {
      setState(prev => ({ ...prev, exercises: prev.exercises.map(e => e.id===id ? { ...e, ...patch } : e) }));
    },
    // Упражнение удаляется только из справочника: записи журнала хранят снимок названия и состава,
    // поэтому прошлые тренировки после удаления читаются как раньше.
    deleteExercise(id) {
      commit((prev, defer) => {
        const idx = prev.exercises.findIndex(e => e.id===id);
        const removed = prev.exercises[idx];
        if (!removed) return prev;
        defer(() => pushToast("Упражнение удалено", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, exercises: insertAt(p2.exercises, idx, removed) }));
        }));
        return { ...prev, exercises: prev.exercises.filter(e => e.id!==id) };
      });
    },

    addWorkout(data) {
      const w = { id: uid(), description:"", items:[], archived:false, createdAt: todayStr(), ...data };
      commit((prev, defer) => {
        defer(() => pushToast("Тренировка сохранена", <ListPlus className="w-4 h-4 text-emerald-400"/>));
        return { ...prev, workouts: [w, ...prev.workouts] };
      });
      return w.id;
    },
    updateWorkout(id, patch) {
      setState(prev => ({ ...prev, workouts: prev.workouts.map(w => w.id===id ? { ...w, ...patch } : w) }));
    },
    deleteWorkout(id) {
      commit((prev, defer) => {
        const idx = prev.workouts.findIndex(w => w.id===id);
        const removed = prev.workouts[idx];
        if (!removed) return prev;
        defer(() => pushToast("Тренировка удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, workouts: insertAt(p2.workouts, idx, removed) }));
        }));
        return { ...prev, workouts: prev.workouts.filter(w => w.id!==id) };
      });
    },

    // Запись в журнал: либо по шаблону, либо свободная. Состав копируется СНИМКОМ, дальше живёт
    // сам — правка шаблона задним числом прошлые тренировки не меняет.
    addWorkoutSession({ date, workoutId, title }) {
      let session = null;
      commit((prev, defer) => {
        const template = workoutId ? prev.workouts.find(w => w.id===workoutId) : null;
        const entries = template ? (template.items||[]).map(it => {
          const ex = prev.exercises.find(e => e.id===it.exerciseId);
          const kind = ex ? ex.kind : "strength";
          return {
            id: uid(), exerciseId: it.exerciseId, name: ex ? ex.name : "Упражнение",
            sets: Array.from({ length: Math.max(1, Number(it.sets)||1) }, () => ({
              ...defaultSet(kind),
              reps: it.reps != null ? it.reps : defaultSet(kind).reps,
              weight: it.weight != null ? it.weight : null,
              minutes: it.minutes != null ? it.minutes : (kind==="strength" ? null : defaultSet(kind).minutes),
              km: it.km != null ? it.km : null,
            })),
          };
        }) : [];
        session = {
          id: uid(), date, workoutId: workoutId || null, planId:null, sessionId:null,
          title: title || (template ? template.title : "Свободная тренировка"),
          status: "planned", minutes: null, rpe: null, notes: "", entries,
        };
        defer(() => pushToast("Тренировка добавлена в журнал", <Dumbbell className="w-4 h-4 text-emerald-400"/>, () => {
          setState(p2 => ({ ...p2, workoutLog: p2.workoutLog.filter(w => w.id!==session.id) }));
        }));
        return { ...prev, workoutLog: [session, ...prev.workoutLog] };
      });
      return session && session.id;
    },
    // Смена статуса сессии может закрыть план — пересчитываем в том же commit, а не эффектом.
    updateWorkoutSession(id, patch) {
      commit((prev, defer) => {
        const workoutLog = prev.workoutLog.map(w => w.id===id ? { ...w, ...patch } : w);
        const { state: next, rewards } = applyPlanSettlement(prev, workoutLog);
        if (rewards.length) defer(() => rewards.forEach(r => pushToast(
          `План пройден: ${r.title} · серия ${r.streak}${r.perfect ? " без пропусков" : ""} · +${r.xp} XP, +${r.gold} золота`,
          <Rocket className="w-4 h-4 text-emerald-400"/>)));
        return next;
      });
    },
    deleteWorkoutSession(id) {
      commit((prev, defer) => {
        const idx = prev.workoutLog.findIndex(w => w.id===id);
        const removed = prev.workoutLog[idx];
        if (!removed) return prev;
        // Удаление последней невыполненной сессии закрывает план — значит undo обязан уметь
        // отобрать выданную за него награду, ровно как у кампаний.
        const { state: next, rewards } = applyPlanSettlement(prev, prev.workoutLog.filter(w => w.id!==id));
        defer(() => {
          pushToast("Запись удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
            setState(p2 => {
              const reverted = revertPlanSettlement(p2, rewards);
              return { ...reverted, workoutLog: insertAt(reverted.workoutLog, idx, removed) };
            });
          });
          rewards.forEach(r => pushToast(`План пройден: ${r.title} · +${r.xp} XP`, <Rocket className="w-4 h-4 text-emerald-400"/>));
        });
        return next;
      });
    },
    // Отметка подхода. Когда отмечен последний — сессия сама переходит в "done": просить человека
    // дополнительно нажать «завершить» после последнего подхода незачем.
    toggleWorkoutSet(sessionId, entryId, setId) {
      commit((prev, defer) => {
        const workoutLog = prev.workoutLog.map(w => {
          if (w.id !== sessionId) return w;
          const entries = w.entries.map(e => e.id!==entryId ? e : {
            ...e, sets: e.sets.map(st => st.id===setId ? { ...st, done: !st.done } : st),
          });
          const stats = workoutSetStats({ entries });
          const status = stats.total && stats.done===stats.total ? "done" : (w.status==="skipped" ? "skipped" : (stats.done ? "planned" : w.status));
          return { ...w, entries, status };
        });
        // Последний отмеченный подход может закрыть и сессию, и весь план. Отката здесь нет
        // сознательно: снять галочку — это не отмена действия, а новое решение, и награда за
        // пройденный план не отбирается (принцип «без клавбэка», как у claimedTiers).
        const { state: next, rewards } = applyPlanSettlement(prev, workoutLog);
        if (rewards.length) defer(() => rewards.forEach(r => pushToast(
          `План пройден: ${r.title} · серия ${r.streak}${r.perfect ? " без пропусков" : ""} · +${r.xp} XP, +${r.gold} золота`,
          <Rocket className="w-4 h-4 text-emerald-400"/>)));
        return next;
      });
    },
    updateWorkoutSet(sessionId, entryId, setId, patch) {
      setState(prev => ({
        ...prev,
        workoutLog: prev.workoutLog.map(w => w.id!==sessionId ? w : {
          ...w, entries: w.entries.map(e => e.id!==entryId ? e : {
            ...e, sets: e.sets.map(st => st.id===setId ? { ...st, ...patch } : st),
          }),
        }),
      }));
    },
    addWorkoutSet(sessionId, entryId) {
      setState(prev => ({
        ...prev,
        workoutLog: prev.workoutLog.map(w => w.id!==sessionId ? w : {
          ...w, entries: w.entries.map(e => {
            if (e.id!==entryId) return e;
            const ex = prev.exercises.find(x => x.id===e.exerciseId);
            const last = e.sets[e.sets.length-1];
            return { ...e, sets: [...e.sets, { ...defaultSet(ex ? ex.kind : "strength"), ...(last ? { reps:last.reps, weight:last.weight, minutes:last.minutes, km:last.km } : {}), id: uid(), done:false }] };
          }),
        }),
      }));
    },
    removeWorkoutSet(sessionId, entryId, setId) {
      setState(prev => ({
        ...prev,
        workoutLog: prev.workoutLog.map(w => w.id!==sessionId ? w : {
          ...w, entries: w.entries.map(e => e.id!==entryId ? e : { ...e, sets: e.sets.filter(st => st.id!==setId) }),
        }),
      }));
    },
    addWorkoutEntry(sessionId, exerciseId) {
      setState(prev => {
        const ex = prev.exercises.find(e => e.id===exerciseId);
        if (!ex) return prev;
        const load = ex.defaultLoad || {};
        const entry = {
          id: uid(), exerciseId, name: ex.name,
          sets: Array.from({ length: Math.max(1, Number(load.sets)||1) }, () => ({
            ...defaultSet(ex.kind),
            reps: load.reps != null ? load.reps : defaultSet(ex.kind).reps,
            weight: load.weight != null ? load.weight : null,
            minutes: load.minutes != null ? load.minutes : (ex.kind==="strength" ? null : defaultSet(ex.kind).minutes),
            km: load.km != null ? load.km : null,
          })),
        };
        return { ...prev, workoutLog: prev.workoutLog.map(w => w.id!==sessionId ? w : { ...w, entries: [...w.entries, entry] }) };
      });
    },
    removeWorkoutEntry(sessionId, entryId) {
      setState(prev => ({ ...prev, workoutLog: prev.workoutLog.map(w => w.id!==sessionId ? w : { ...w, entries: w.entries.filter(e => e.id!==entryId) }) }));
    },

    /* ------------------------------ Кампании ------------------------------ */

    addCampaign(data) {
      const campaign = {
        id: uid(), status:"active", claimedFinal:false, completedAt:null, createdAt: todayStr(),
        source:"manual", importedAt:null, description:"", color:null, personId:null, personName:null,
        stages: [], reward: defaultCampaignReward(), ...data,
      };
      commit((prev, defer) => {
        defer(() => pushToast("Кампания создана", <Flag className="w-4 h-4 text-amber-400"/>));
        return { ...prev, campaigns: [campaign, ...prev.campaigns] };
      });
      return campaign.id;
    },
    updateCampaign(id, patch) {
      setState(prev => ({ ...prev, campaigns: prev.campaigns.map(c => c.id===id ? { ...c, ...patch } : c) }));
    },
    // Два разных удаления вместо модального вопроса «а квесты тоже?»: пункт в кебабе прямо
    // называет последствие. Undo восстанавливает и кампанию на прежнюю позицию, и квесты — либо
    // целиком (каскад), либо только их привязку к кампании.
    deleteCampaign(id, withQuests) {
      commit((prev, defer) => {
        const idx = prev.campaigns.findIndex(c => c.id===id);
        const removed = prev.campaigns[idx];
        if (!removed) return prev;
        const affected = prev.quests.map((q,i) => ({ q, i })).filter(x => x.q.campaignId===id);
        const quests = withQuests
          ? prev.quests.filter(q => q.campaignId!==id)
          : prev.quests.map(q => q.campaignId===id ? { ...q, campaignId:null, stageId:null } : q);
        const n = affected.length;
        defer(() => pushToast(
          withQuests ? `Кампания и ${n} ${pluralRu(n,"квест","квеста","квестов")} удалены` : "Кампания удалена, квесты остались",
          <Trash2 className="w-4 h-4 text-zinc-400"/>,
          () => setState(p2 => {
            let qs = p2.quests;
            if (withQuests) affected.forEach(x => { qs = insertAt(qs, x.i, x.q); });
            else qs = qs.map(q => {
              const src = affected.find(x => x.q.id===q.id);
              return src ? { ...q, campaignId:id, stageId: src.q.stageId || null } : q;
            });
            return { ...p2, campaigns: insertAt(p2.campaigns, idx, removed), quests: qs };
          })
        ));
        return { ...prev, campaigns: prev.campaigns.filter(c => c.id!==id), quests };
      });
    },
    archiveCampaign(id, archived) {
      commit((prev, defer) => {
        const campaigns = prev.campaigns.map(c => c.id===id ? { ...c, status: archived ? "archived" : "active" } : c);
        // Возврат из архива может тут же закрыть кампанию (пока лежала в архиве, её квесты
        // доделали) — пересчитываем, иначе она висела бы активной с полным прогрессом.
        const { state: next, rewards } = applyCampaignSettlement({ ...prev, campaigns }, prev.quests);
        defer(() => {
          pushToast(archived ? "Кампания в архиве" : "Кампания возвращена из архива", <Archive className="w-4 h-4 text-zinc-400"/>);
          rewards.forEach(r => pushToast(`Кампания завершена: ${r.title} · +${r.xp} XP, +${r.gold} золота`, <Flag className="w-4 h-4 text-amber-400"/>));
        });
        return next;
      });
    },
    // «Разрешить награду снова» — для случая, когда в уже завершённую кампанию дописали новые
    // квесты: она вернулась в активные, но claimedFinal остался стоять и повторного начисления
    // не будет. Редкий, но честный выход, чтобы механика не выглядела сломанной.
    resetCampaignClaim(id) {
      commit((prev, defer) => {
        defer(() => pushToast("Награда за завершение разрешена снова", <Sparkles className="w-4 h-4 text-amber-400"/>));
        return { ...prev, campaigns: prev.campaigns.map(c => c.id===id ? { ...c, claimedFinal:false, reward:{ ...c.reward, grantedXp:null, grantedGold:null } } : c) };
      });
    },
    // Импорт плана: кампания и все её квесты появляются одной операцией — и одной же операцией
    // откатываются. Undo здесь обязателен: разгребать руками ошибочно импортированные сорок
    // квестов — худший сценарий этой функции.
    importCampaign(campaign, quests) {
      commit((prev, defer) => {
        defer(() => pushToast(
          `Кампания добавлена: ${quests.length} ${pluralRu(quests.length,"квест","квеста","квестов")}`,
          <Flag className="w-4 h-4 text-amber-400"/>,
          () => setState(p2 => ({
            ...p2,
            campaigns: p2.campaigns.filter(c => c.id!==campaign.id),
            quests: p2.quests.filter(q => q.campaignId!==campaign.id),
          }))
        ));
        return { ...prev, campaigns: [campaign, ...prev.campaigns], quests: [...quests, ...prev.quests] };
      });
    },

    addHabit(h) {
      setState(prev => ({ ...prev, habits: [{ id:uid(), logs:[], claimedDates:[], ...h }, ...prev.habits] }));
      pushToast("Привычка добавлена", <CheckSquare className="w-4 h-4 text-amber-400"/>);
    },
    deleteHabit(id) {
      commit((prev, defer) => {
        const removedIdx = prev.habits.findIndex(h => h.id===id);
        const removed = prev.habits[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Привычка удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, habits: insertAt(p2.habits, removedIdx, removed) }));
        }));
        return { ...prev, habits: prev.habits.filter(h => h.id!==id) };
      });
    },
    updateHabit(id, patch) { setState(prev => ({ ...prev, habits: prev.habits.map(h => h.id===id ? { ...h, ...patch } : h) })); },
    toggleHabitToday(id) {
      // Наградa начисляется не более одного раза в день на привычку, даже если чекбокс
      // кликнули туда-обратно несколько раз — статус "выполнено" при этом переключается свободно.
      // Полный откат (с очисткой claimedDates) доступен только через "Отменить" в тосте сразу после отметки.
      commit((prev, defer) => {
        // Привязанные привычки (питание/вода/чтение) урегулируются автоматически синком, а не
        // ручным чекбоксом — если сюда всё же прилетел клик по такой (UI не должен такое допускать),
        // просто игнорируем, чтобы не спутать claimedTiers с логикой claimedDates.
        const target = prev.habits.find(h => h.id===id);
        if (target && target.linkedKind) return prev;
        const t = todayStr();
        const prevLevel = overallOf(prev).level;
        let grantedNow = false;
        const habits = prev.habits.map(h => {
          if (h.id!==id) return h;
          const logs = h.logs || [];
          const claimed = h.claimedDates || [];
          const isDone = logs.includes(t);
          if (isDone) return { ...h, logs: logs.filter(d => d!==t) };
          const alreadyClaimed = claimed.includes(t);
          grantedNow = !alreadyClaimed;
          return { ...h, logs: [...logs, t], claimedDates: alreadyClaimed ? claimed : [...claimed, t] };
        });
        const habit = habits.find(h => h.id===id);
        let spheres = prev.spheres;
        let people = prev.people;
        let currency = prev.profile.currency;
        if (habit && grantedNow) {
          spheres = prev.spheres.map(s => s.id===habit.sphereId ? { ...s, xp: s.xp + 8 } : s);
          people = habit.personId ? (prev.people||[]).map(p => p.id===habit.personId ? { ...p, xp: p.xp + 8 } : p) : prev.people;
          currency = currency + 3;
        }
        const newLevel = levelFromXp(spheres.reduce((a,s)=>a+s.xp,0)).level;
        if (grantedNow) {
          const sphereId = habit.sphereId, personId = habit.personId;
          defer(() => {
            pushToast("Привычка отмечена: +8 XP", <Flame className="w-4 h-4 text-orange-400"/>, () => {
              setState(p2 => ({
                ...p2,
                habits: p2.habits.map(h => h.id===id ? { ...h, logs:(h.logs||[]).filter(d=>d!==t), claimedDates:(h.claimedDates||[]).filter(d=>d!==t) } : h),
                spheres: p2.spheres.map(s => s.id===sphereId ? { ...s, xp: Math.max(0, s.xp-8) } : s),
                people: personId ? (p2.people||[]).map(p => p.id===personId ? { ...p, xp: Math.max(0, p.xp-8) } : p) : p2.people,
                profile: { ...p2.profile, currency: Math.max(0, p2.profile.currency-3) },
              }));
            });
            if (newLevel > prevLevel) setLevelUp(newLevel);
          });
        }
        return { ...prev, habits, spheres, people, profile: { ...prev.profile, currency } };
      });
    },

    addSphere(s) { setState(prev => ({ ...prev, spheres: [...prev.spheres, { id:uid(), xp:0, ...s }] })); },
    updateSphere(id, patch) { setState(prev => ({ ...prev, spheres: prev.spheres.map(s => s.id===id ? { ...s, ...patch } : s) })); },
    deleteSphere(id) {
      commit((prev, defer) => {
        const inUse = prev.quests.some(q=>questTouchesSphere(q, id)) || prev.habits.some(h=>h.sphereId===id);
        if (inUse) { defer(() => pushToast("Нельзя удалить: есть связанные квесты или привычки", <Shield className="w-4 h-4 text-red-400"/>)); return prev; }
        const removedIdx = prev.spheres.findIndex(s => s.id===id);
        const removed = prev.spheres[removedIdx];
        defer(() => pushToast("Сфера удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, spheres: insertAt(p2.spheres, removedIdx, removed) }));
        }));
        return { ...prev, spheres: prev.spheres.filter(s => s.id!==id) };
      });
    },

    addPerson(p) {
      setState(prev => {
        const activeCount = (prev.people||[]).filter(x=>!x.archived).length;
        return { ...prev, people: [{ id:uid(), xp:0, archived:false, archivedAt:null, order:activeCount, createdAt:todayStr(), trackBirthday:false, birthdayQuestYears:[], ...p }, ...(prev.people||[])] };
      });
      pushToast("Карточка человека создана", <Users className="w-4 h-4 text-amber-400"/>);
    },
    updatePerson(id, patch) { setState(prev => ({ ...prev, people: (prev.people||[]).map(p => p.id===id ? { ...p, ...patch } : p) })); },
    // Единый экшен на перетаскивание и на стрелки вверх/вниз в списке активных людей — тот же
    // паттерн, что у категорий/типов отношений. Архив сортируется отдельно, по дате переноса,
    // и этим экшеном не пользуется.
    reorderPerson(fromId, toId) {
      setState(prev => {
        const active = (prev.people||[]).filter(p=>!p.archived).sort((a,b)=>(a.order??0)-(b.order??0));
        const fromIdx = active.findIndex(p=>p.id===fromId);
        const toIdx = active.findIndex(p=>p.id===toId);
        if (fromIdx<0 || toIdx<0 || fromIdx===toIdx) return prev;
        const reordered = active.slice();
        const [item] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, item);
        const orderOf = {};
        reordered.forEach((p,i) => { orderOf[p.id] = i; });
        return { ...prev, people: (prev.people||[]).map(p => orderOf[p.id]!==undefined ? { ...p, order: orderOf[p.id] } : p) };
      });
    },
    // В архив — если у человека было включено отслеживание ДР, автоматически снимаем его (архив =
    // связь приостановлена, тянуть за собой активную автоматику незачем) — а выключение
    // отслеживания, в свою очередь, само снимает ещё невыполненный квест-поздравление и
    // освобождает его год из birthdayQuestYears (см. комментарий у togglePersonBirthdayTracking
    // ниже — иначе повторное включение отслеживания после разархивации не пересоздаёт квест).
    // Всё восстанавливается одним "Отменить" в тосте — архивный статус, trackBirthday, снятый
    // квест и год разом.
    archivePerson(id) {
      commit((prev, defer) => {
        const target = (prev.people||[]).find(p => p.id===id);
        if (!target) return prev;
        const wasTracked = target.trackBirthday === true;
        const { quests: questsAfter, removed: removedQuest } = wasTracked
          ? extractActiveBirthdayQuest(prev.quests, id)
          : { quests: prev.quests, removed: null };
        const removedYear = removedQuest ? Number(removedQuest.deadline.slice(0,4)) : null;
        defer(() => pushToast("Человек перемещён в архив", <Archive className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({
            ...p2,
            people: (p2.people||[]).map(p => p.id===id ? {
              ...p, archived:false, archivedAt:null,
              trackBirthday: wasTracked ? true : p.trackBirthday,
              birthdayQuestYears: removedYear!=null ? [...(p.birthdayQuestYears||[]), removedYear] : p.birthdayQuestYears,
            } : p),
            quests: removedQuest ? [removedQuest, ...p2.quests] : p2.quests,
          }));
        }));
        return {
          ...prev,
          people: prev.people.map(p => p.id===id ? {
            ...p, archived:true, archivedAt: todayStr(),
            trackBirthday: wasTracked ? false : p.trackBirthday,
            birthdayQuestYears: removedYear!=null ? (p.birthdayQuestYears||[]).filter(y => y!==removedYear) : p.birthdayQuestYears,
          } : p),
          quests: questsAfter,
        };
      });
    },
    // Ручной возврат из архива (кнопка на карточке) ставит человека в конец активного списка —
    // в отличие от отмены через тост выше, которая восстанавливает точную прежнюю позицию.
    // Отслеживание ДР при этом НЕ включается автоматически (см. "включать отслеживание
    // автоматически не нужно") — если archivePerson его сняла, ручной возврат оставляет как есть,
    // человек сам решит через глазик/кебаб-меню.
    unarchivePerson(id) {
      setState(prev => {
        const activeCount = (prev.people||[]).filter(p=>!p.archived).length;
        return { ...prev, people: (prev.people||[]).map(p => p.id===id ? { ...p, archived:false, archivedAt:null, order:activeCount } : p) };
      });
    },
    // Мягкое удаление: карточка пропадает из активного пула и из выбора в формах, но personId,
    // уже проставленный на квестах/привычках (+ снэпшот personName) и на долгах (+ текстовое
    // поле person), не переписывается — история и подписи остаются рабочими и после удаления.
    // Исключение — авто-квест "Поздравить с ДР": если он ещё не выполнен, его поздравлять уже
    // некого, поэтому он удаляется ВМЕСТЕ с человеком (одним undo-действием — "Отменить" в тосте
    // восстанавливает и человека, и квест разом, а не по отдельности). Уже выполненный квест
    // поздравления не трогаем — он остаётся историей, как и любой другой завершённый квест
    // человека (ТЗ «Календарь», раздел 2.1).
    deletePerson(id) {
      commit((prev, defer) => {
        const removed = (prev.people||[]).find(p => p.id===id);
        if (!removed) return prev;
        const { quests: questsAfter, removed: removedQuest } = extractActiveBirthdayQuest(prev.quests, id);
        defer(() => pushToast("Карточка человека удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({
            ...p2,
            // Позиция в массиве здесь роли не играет (в отличие от сфер/привычек/типов отношений,
            // где откат восстанавливает индекс): список людей рендерится отсортированным по полю
            // order, которое у removed сохранилось нетронутым — человек вернётся на своё место.
            people: [removed, ...(p2.people||[])],
            quests: removedQuest ? [removedQuest, ...p2.quests] : p2.quests,
          }));
        }));
        return { ...prev, people: prev.people.filter(p => p.id!==id), quests: questsAfter };
      });
    },
    // Включение — просто флаг (личные данные — birthdayQuestYears — сохраняются как были).
    // Выключение — вместе с флагом убирает ещё невыполненный квест-поздравление, если он есть, и
    // освобождает его год из birthdayQuestYears — раньше год оставался помеченным навсегда, и
    // повторное включение отслеживания в течение того же окна (например, сразу после случайного
    // выключения) больше НИКОГДА не пересоздавало квест: он просто тихо не появлялся, при этом
    // человек ожидал рабочего квеста и не понимал, куда он делся.
    togglePersonBirthdayTracking(id) {
      commit((prev, defer) => {
        const person = prev.people.find(p => p.id===id);
        if (!person) return prev;
        if (person.trackBirthday !== true) {
          return { ...prev, people: prev.people.map(p => p.id===id ? { ...p, trackBirthday:true } : p) };
        }
        const { quests: questsAfter, removed: removedQuest } = extractActiveBirthdayQuest(prev.quests, id);
        const removedYear = removedQuest ? Number(removedQuest.deadline.slice(0,4)) : null;
        if (removedQuest) {
          defer(() => pushToast("Отслеживание ДР выключено, квест-поздравление снят", <EyeOff className="w-4 h-4 text-zinc-400"/>, () => {
            setState(p2 => ({
              ...p2,
              people: p2.people.map(p => p.id===id ? {
                ...p, trackBirthday:true,
                birthdayQuestYears: removedYear!=null ? [...(p.birthdayQuestYears||[]), removedYear] : p.birthdayQuestYears,
              } : p),
              quests: [removedQuest, ...p2.quests],
            }));
          }));
        }
        return {
          ...prev,
          people: prev.people.map(p => p.id===id ? {
            ...p, trackBirthday:false,
            birthdayQuestYears: removedYear!=null ? (p.birthdayQuestYears||[]).filter(y => y!==removedYear) : p.birthdayQuestYears,
          } : p),
          quests: questsAfter,
        };
      });
    },
    // Тот же принцип, что у togglePersonBirthdayTracking ниже: подписка — просто флаг (личные
    // данные — personIds/questYears — сохраняются как были, если уже отписывались раньше), отписка
    // — вместе с флагом убирает ещё невыполненный квест-поздравление этого праздника (если есть) и
    // освобождает его год из questYears — иначе повторная подписка в течение того же окна ничего
    // не давала бы: идемпотентность блокировала бы пересоздание, хотя человек явно попросил заново.
    toggleHolidaySubscription(holidayId) {
      commit((prev, defer) => {
        const subs = prev.holidaySubscriptions || {};
        const sub = subs[holidayId];
        if (!sub || !sub.subscribed) {
          // ВАЖНО: ...sub — первым, subscribed:true — последним. Раньше было наоборот, и если у
          // подписки уже была история (sub существует, но subscribed:false после отписки), спред
          // ...sub, идущий последним, тут же затирал subscribed обратно на false — повторно
          // подписаться было невозможно никаким кликом.
          return { ...prev, holidaySubscriptions: { ...subs, [holidayId]: { personIds:[], questYears:[], ...sub, subscribed:true } } };
        }
        const { quests: questsAfter, removed: removedQuest } = extractActiveHolidayQuest(prev.quests, holidayId);
        const removedYear = removedQuest ? Number(removedQuest.deadline.slice(0,4)) : null;
        const questYearsAfter = removedYear!=null ? (sub.questYears||[]).filter(y => y!==removedYear) : sub.questYears;
        if (removedQuest) {
          const holiday = HOLIDAYS.find(h => h.id===holidayId);
          defer(() => pushToast(`Отписка от «${holiday ? holiday.name : "праздника"}», квест-поздравление снят`, <EyeOff className="w-4 h-4 text-zinc-400"/>, () => {
            setState(p2 => {
              const curSub = (p2.holidaySubscriptions && p2.holidaySubscriptions[holidayId]) || sub;
              return {
                ...p2,
                holidaySubscriptions: { ...(p2.holidaySubscriptions||{}), [holidayId]: { ...curSub, subscribed:true, questYears: sub.questYears } },
                quests: [removedQuest, ...p2.quests],
              };
            });
          }));
        }
        return { ...prev, holidaySubscriptions: { ...subs, [holidayId]: { ...sub, subscribed:false, questYears:questYearsAfter } }, quests: questsAfter };
      });
    },
    // Полностью заменяет список привязанных к празднику людей (чипы в Настройках сами решают,
    // добавить или убрать — сюда прилетает уже готовый новый массив). Уже созданный квест этим не
    // трогается — изменение состава влияет только на будущую генерацию (см. computeSyncedHolidayQuests).
    setHolidayPeople(holidayId, personIds) {
      setState(prev => {
        const subs = prev.holidaySubscriptions || {};
        const sub = subs[holidayId] || { subscribed:true, personIds:[], questYears:[] };
        return { ...prev, holidaySubscriptions: { ...subs, [holidayId]: { ...sub, personIds } } };
      });
    },
    // Импорт части чужого сохранения (см. блок «ОБМЕН ЧАСТЯМИ СОХРАНЕНИЯ»). Записи всегда
    // ДОБАВЛЯЮТСЯ: ничего существующего не перезаписывается и не удаляется. Каждой записи выдаётся
    // свой новый id — чужие id не должны сталкиваться с локальными. Прогресс и связи не
    // импортируются: они не попадают в файл, а недостающие поля добираются дефолтами раздела.
    importShared(sectionId, parsed, reuse) {
      commit((prev, defer) => {
        const today = todayStr();
        const items = parsed.items || [];
        let next = { ...prev };

        if (sectionId === "people") {
          let order = (prev.people||[]).filter(p=>!p.archived).length;
          const added = items.map(it => ({
            id:uid(), name:it.name || "Без имени", relation:it.relation || null,
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
            const rec = buildImportedLibraryItem(it, k, today, sphereOk ? it.sphereId : null);
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
            const collIds = packs.map(() => uid());
            const branchIds = packs.map(p => (p.branches || []).map(() => uid()));
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
            id:uid(), name:it.name || "Без названия", emoji:it.emoji || "🍽️",
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
              id:uid(), name:f.name || "Без названия", emoji:f.emoji || "🍽️",
              caloriesPer100:Number(f.caloriesPer100)||0, proteinPer100:Number(f.proteinPer100)||0,
              fatPer100:Number(f.fatPer100)||0, carbsPer100:Number(f.carbsPer100)||0,
              pieceWeight: f.pieceWeight || null, createdAt:today,
            };
            foods.push(created);
            idMap[f.id] = created.id;
          });
          const added = items.map(it => ({
            id:uid(), name:it.name || "Без названия", emoji:it.emoji || "🍲",
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

        defer(() => pushToast(`Добавлено записей: ${items.length}`, <Upload className="w-4 h-4 text-amber-400"/>));
        return next;
      });
    },
    updateFinanceTableFields(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), financeTableFields: { ...defaultFinanceTableFields(), ...(prev.uiPrefs && prev.uiPrefs.financeTableFields), ...patch } } }));
    },
    updatePeopleCardFields(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), peopleCardFields: { ...defaultPeopleCardFields(), ...(prev.uiPrefs && prev.uiPrefs.peopleCardFields), ...patch } } }));
    },
    setCalendarView(view) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), calendar: { ...defaultCalendarPrefs(), ...(prev.uiPrefs && prev.uiPrefs.calendar), view } } }));
    },
    setCalendarWeekLayout(weekLayout) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), calendar: { ...defaultCalendarPrefs(), ...(prev.uiPrefs && prev.uiPrefs.calendar), weekLayout } } }));
    },
    setCalendarFilters(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), calendar: { ...defaultCalendarPrefs(), ...(prev.uiPrefs && prev.uiPrefs.calendar), filters: { ...defaultCalendarPrefs().filters, ...(prev.uiPrefs && prev.uiPrefs.calendar && prev.uiPrefs.calendar.filters), ...patch } } } }));
    },
    toggleKanbanColumn(colId) {
      setState(prev => {
        const cur = (prev.uiPrefs && prev.uiPrefs.calendar && prev.uiPrefs.calendar.kanbanCollapsed) || [];
        const next = cur.includes(colId) ? cur.filter(x=>x!==colId) : [...cur, colId];
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), calendar: { ...defaultCalendarPrefs(), ...(prev.uiPrefs && prev.uiPrefs.calendar), kanbanCollapsed: next } } };
      });
    },
    // patch — { enabled?, width? }. Ширина сохраняется по окончании перетаскивания разделителя
    // (не на каждый пиксель, см. CalendarView), enabled — по клику на глазик у панели.
    setCalendarMonthPanel(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), calendar: { ...defaultCalendarPrefs(), ...(prev.uiPrefs && prev.uiPrefs.calendar), monthPanel: { ...defaultCalendarPrefs().monthPanel, ...(prev.uiPrefs && prev.uiPrefs.calendar && prev.uiPrefs.calendar.monthPanel), ...patch } } } }));
    },

    /* -------------------------------- LIBRARY -------------------------------- */
    // Один набор экшенов на все три вида (kind: "book"|"game"|"movie"), stateKey берётся из
    // LIBRARY_KINDS — не дублировать по три копии каждого действия.
    addLibraryItem(kind, data) {
      const key = LIBRARY_KINDS[kind].stateKey;
      setState(prev => ({ ...prev, [key]: [{ id:uid(), rating:0, notes:[], sphereId:null, rewardXp:0, status:"want", tracked:false, createdAt:todayStr(), ...data }, ...prev[key]] }));
      pushToast("Добавлено в библиотеку", <BookOpen className="w-4 h-4 text-amber-400"/>);
    },
    updateLibraryItem(kind, id, patch) {
      const key = LIBRARY_KINDS[kind].stateKey;
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
        if (kind==="book" && item && Object.prototype.hasOwnProperty.call(finalPatch2, "pagesRead") && isReadingGoalActiveOn(item.readingGoal, todayStr())) {
          const delta = (Number(finalPatch2.pagesRead)||0) - (item.pagesRead||0);
          if (delta !== 0) {
            const d = todayStr();
            const existing = (readingLog||[]).find(e => e.bookId===id && e.date===d);
            readingLog = existing
              ? (readingLog||[]).map(e => e.id===existing.id ? { ...e, pages: Math.max(0, (e.pages||0)+delta) } : e)
              : [{ id:uid(), bookId:id, date:d, pages: Math.max(0, delta) }, ...(readingLog||[])];
          }
        }
        return { ...prev, [key]: prev[key].map(x => x.id===id ? { ...x, ...finalPatch2 } : x), readingLog };
      });
    },
    // Цель по чтению книги: дочитать к endDate по pagesPerDay страниц/день. startDate всегда
    // "сегодня" (форма спрашивает только дату дедлайна и норму — так же просто, как задумано).
    setBookReadingGoal(bookId, { endDate, pagesPerDay }) {
      setState(prev => ({ ...prev, books: (prev.books||[]).map(b => b.id===bookId ? { ...b, readingGoal: { startDate: todayStr(), endDate, pagesPerDay: Number(pagesPerDay)||0 } } : b) }));
      pushToast("Цель по чтению задана", <Target className="w-4 h-4 text-amber-400"/>);
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
        defer(() => pushToast("Запись удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
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
          pushToast(rewardXp ? `Отмечено как завершённое: +${rewardXp} XP` : "Отмечено как завершённое", <Trophy className="w-4 h-4 text-amber-400"/>, () => {
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
      const key = LIBRARY_KINDS[kind].stateKey;
      setState(prev => ({ ...prev, [key]: prev[key].map(x => x.id===id ? { ...x, notes:[...(x.notes||[]), { id:uid(), text, date:todayStr() }] } : x) }));
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
    // Разворот кампании считается от ПРЕДЫДУЩЕГО состояния, а не от прочитанного при рендере:
    // иначе два переключения подряд в одном тике потеряли бы первое.
    toggleExpandedCampaign(id, expanded) {
      setState(prev => {
        const cur = (prev.uiPrefs && prev.uiPrefs.quests && prev.uiPrefs.quests.expandedCampaigns) || [];
        const want = expanded == null ? !cur.includes(id) : !!expanded;
        const next = want ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter(x => x!==id);
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), quests: { ...defaultQuestsPrefs(), ...(prev.uiPrefs && prev.uiPrefs.quests), expandedCampaigns: next } } };
      });
    },
    // Включение фиксирует дату: награда идёт с этого дня, а не задним числом за всю историю.
    // Выключение дату не стирает и уже начисленное не отбирает — принцип «без клавбэка».
    /* --- Коллекции библиотеки --- */
    addLibraryCollection(collection) {
      setState(prev => ({ ...prev, libraryCollections: [...(prev.libraryCollections||[]), {
        id: uid(), coverEmoji: "📦", branches: [], order: (prev.libraryCollections||[]).length, createdAt: todayStr(), ...collection,
      }] }));
      pushToast("Коллекция создана", <Layers className="w-4 h-4 text-amber-400"/>);
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
          <Trash2 className="w-4 h-4 text-zinc-400"/>,
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
      setState(prev => ({ ...prev, libraryCollections: (prev.libraryCollections||[]).map(c => c.id===collectionId
        ? { ...c, branches: [...(c.branches||[]), { id: uid(), name, anchorId: anchorId || null, order: (c.branches||[]).length }] }
        : c) }));
    },
    updateCollectionBranch(collectionId, branchId, patch) {
      commit((prev, defer) => {
        const coll = collectionById(prev.libraryCollections, collectionId);
        // Смена привязки — единственный способ завязать кольцо руками, поэтому проверяем ДО записи.
        if (coll && Object.prototype.hasOwnProperty.call(patch, "anchorId")
            && !canAnchorBranch(prev, coll, branchId, patch.anchorId)) {
          defer(() => pushToast("Ветку нельзя привязать к записи внутри неё самой", <AlertCircle className="w-4 h-4 text-amber-400"/>));
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
          defer(() => pushToast("Ветку нельзя вложить внутрь себя самой", <AlertCircle className="w-4 h-4 text-amber-400"/>));
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
          <Trash2 className="w-4 h-4 text-zinc-400"/>,
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
        <Layers className="w-4 h-4 text-amber-400"/>);
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
          <X className="w-4 h-4 text-zinc-400"/>,
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

    /* --- Заметки --- */
    addNoteFolder(folder) {
      setState(prev => {
        const order = (prev.noteFolders||[]).filter(f => (f.parentId||null)===(folder.parentId||null)).length;
        return { ...prev, noteFolders: [...(prev.noteFolders||[]), { id: uid(), color:null, order, createdAt: todayStr(), ...folder }] };
      });
      pushToast("Папка создана", <FolderPlus className="w-4 h-4 text-amber-400"/>);
    },
    updateNoteFolder(id, patch) {
      setState(prev => ({ ...prev, noteFolders: (prev.noteFolders||[]).map(f => f.id===id ? { ...f, ...patch } : f) }));
    },
    moveNoteFolder(id, parentId) {
      // Проверка ДО записи: кольцо в дереве — не косметический дефект, обход по нему не
      // завершается вовсе, и починить его через интерфейс уже нечем.
      commit((prev, defer) => {
        if (!canMoveFolder(prev.noteFolders||[], id, parentId)) {
          defer(() => pushToast("Папку нельзя вложить в саму себя", <AlertCircle className="w-4 h-4 text-amber-400"/>));
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
          <Trash2 className="w-4 h-4 text-zinc-400"/>,
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
      setState(prev => ({ ...prev, notes: [{ id: uid(), title:"", body:"", folderId:null, pinned:false, createdAt: todayStr(), updatedAt: todayStr(), ...note }, ...(prev.notes||[])] }));
    },
    updateNote(id, patch) {
      setState(prev => ({ ...prev, notes: (prev.notes||[]).map(n => n.id===id ? { ...n, ...patch, updatedAt: todayStr() } : n) }));
    },
    toggleNotePinned(id) {
      setState(prev => ({ ...prev, notes: (prev.notes||[]).map(n => n.id===id ? { ...n, pinned: !n.pinned } : n) }));
    },
    deleteNote(id) {
      commit((prev, defer) => {
        const idx = (prev.notes||[]).findIndex(n => n.id===id);
        const removed = (prev.notes||[])[idx];
        if (!removed) return prev;
        defer(() => pushToast("Заметка удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>,
          () => setState(p2 => ({ ...p2, notes: insertAt(p2.notes||[], idx, removed) }))));
        return { ...prev, notes: (prev.notes||[]).filter(n => n.id!==id) };
      });
    },
    markBackupDone() {
      setState(prev => ({ ...prev, lastBackupAt: todayStr() }));
    },
    updateMiscPrefs(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), misc: { ...defaultMiscPrefs(), ...(prev.uiPrefs && prev.uiPrefs.misc), ...patch } } }));
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
    setLogRewards(enabled) {
      commit((prev, defer) => {
        const cur = { ...defaultLogRewards(), ...(prev.logRewards||{}) };
        defer(() => pushToast(enabled ? "Поощрения за ведение включены" : "Поощрения за ведение выключены",
          <Sparkles className="w-4 h-4 text-amber-400"/>));
        return { ...prev, logRewards: { ...cur, enabled, enabledAt: enabled ? todayStr() : cur.enabledAt } };
      });
    },
    updateProfilePrefs(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), profile: { statsCollapsed:false, ...(prev.uiPrefs && prev.uiPrefs.profile), ...patch } } }));
    },
    updateSportPrefs(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), sport: { view:"journal", paramsCollapsed:false, ...(prev.uiPrefs && prev.uiPrefs.sport), ...patch } } }));
    },
    updateQuestsPrefs(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), quests: { ...defaultQuestsPrefs(), ...(prev.uiPrefs && prev.uiPrefs.quests), ...patch } } }));
    },
    updateLibraryPrefs(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), library: { ...defaultLibraryPrefs(), ...(prev.uiPrefs && prev.uiPrefs.library), ...patch } } }));
    },
    // Свернуть/развернуть секцию карточки человека (Квесты/Привычки/Долги/Переводы) — общая
    // настройка вида, запоминается между сессиями (не привязана к конкретному человеку).
    toggleCollapsedSection(key) {
      setState(prev => {
        const cur = (prev.uiPrefs && prev.uiPrefs.peopleDetail && prev.uiPrefs.peopleDetail.collapsedSections) || [];
        const next = cur.includes(key) ? cur.filter(k => k!==key) : [...cur, key];
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), peopleDetail: { ...defaultPeopleDetailPrefs(), ...(prev.uiPrefs && prev.uiPrefs.peopleDetail), collapsedSections: next } } };
      });
    },
    updateApiKeys(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), apiKeys: { ...defaultApiKeys(), ...(prev.uiPrefs && prev.uiPrefs.apiKeys), ...patch } } }));
    },
    // Добавление уже дедуплицировано на уровне компонента (EmojiPicker сам решает "выбрать, а
    // не дублировать"), но проверяем ещё раз и тут — на случай прямого вызова экшена.
    addPoolEmoji(poolId, emoji) {
      setState(prev => {
        const pools = (prev.uiPrefs && prev.uiPrefs.emojiPools) || defaultEmojiPools();
        const pool = pools[poolId];
        if (!pool || pool.emojis.includes(emoji)) return prev;
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiPools: { ...pools, [poolId]: { ...pool, emojis:[...pool.emojis, emoji] } } } };
      });
    },
    removePoolEmoji(poolId, emoji) {
      setState(prev => {
        const pools = (prev.uiPrefs && prev.uiPrefs.emojiPools) || defaultEmojiPools();
        const pool = pools[poolId];
        if (!pool) return prev;
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiPools: { ...pools, [poolId]: { ...pool, emojis: pool.emojis.filter(e => e!==emoji) } } } };
      });
    },
    createEmojiPool(name) {
      setState(prev => {
        const pools = (prev.uiPrefs && prev.uiPrefs.emojiPools) || defaultEmojiPools();
        const id = `pool_${uid()}`;
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiPools: { ...pools, [id]: { name: name.trim() || "Новый пул", emojis:[] } } } };
      });
    },
    renameEmojiPool(poolId, name) {
      setState(prev => {
        const pools = (prev.uiPrefs && prev.uiPrefs.emojiPools) || defaultEmojiPools();
        if (!pools[poolId] || !name.trim()) return prev;
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiPools: { ...pools, [poolId]: { ...pools[poolId], name:name.trim() } } } };
      });
    },
    // Нельзя удалить пул, пока хоть одна категория на него ссылается — сначала нужно
    // переназначить категорию на другой пул (та же логика, что блокирует удаление сферы,
    // если на неё ссылаются квесты/привычки).
    deleteEmojiPool(poolId) {
      commit((prev, defer) => {
        const pools = (prev.uiPrefs && prev.uiPrefs.emojiPools) || defaultEmojiPools();
        const assignments = (prev.uiPrefs && prev.uiPrefs.emojiAssignments) || defaultEmojiAssignments();
        const inUse = Object.values(assignments).includes(poolId);
        if (inUse || Object.keys(pools).length<=1) {
          defer(() => pushToast("Нельзя удалить: пул используется — сначала переназначь категории на другой пул", <Shield className="w-4 h-4 text-red-400"/>));
          return prev;
        }
        const rest = { ...pools };
        delete rest[poolId];
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiPools: rest } };
      });
    },
    setEmojiAssignment(category, poolId) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), emojiAssignments: { ...((prev.uiPrefs && prev.uiPrefs.emojiAssignments) || defaultEmojiAssignments()), [category]: poolId } } }));
    },

    /* -------------------------------- NUTRITION -------------------------------- */
    addFood(data) {
      setState(prev => ({ ...prev, foods: [{ id:uid(), createdAt:todayStr(), ...data }, ...prev.foods] }));
      pushToast("Продукт добавлен", <Sparkles className="w-4 h-4 text-amber-400"/>);
    },
    updateFood(id, patch) {
      setState(prev => ({ ...prev, foods: prev.foods.map(f => f.id===id ? { ...f, ...patch } : f) }));
    },
    deleteFood(id) {
      commit((prev, defer) => {
        const removedIdx = prev.foods.findIndex(f => f.id===id);
        const removed = prev.foods[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Продукт удалён", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, foods: insertAt(p2.foods, removedIdx, removed) }));
        }));
        return { ...prev, foods: prev.foods.filter(f => f.id!==id) };
      });
    },
    addDish(data) {
      setState(prev => ({ ...prev, dishes: [{ id:uid(), createdAt:todayStr(), ...data }, ...prev.dishes] }));
      pushToast("Блюдо добавлено", <Sparkles className="w-4 h-4 text-amber-400"/>);
    },
    updateDish(id, patch) {
      setState(prev => ({ ...prev, dishes: prev.dishes.map(d => d.id===id ? { ...d, ...patch } : d) }));
    },
    deleteDish(id) {
      commit((prev, defer) => {
        const removedIdx = prev.dishes.findIndex(d => d.id===id);
        const removed = prev.dishes[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Блюдо удалено", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, dishes: insertAt(p2.dishes, removedIdx, removed) }));
        }));
        return { ...prev, dishes: prev.dishes.filter(d => d.id!==id) };
      });
    },
    // Заводит инвентарь (приготовленное блюдо или запас продукта) от источника — БЖУ/100г
    // считается на лету от sourceId, не копируется. expiryDate — необязательный срок годности.
    addInventoryItem(sourceType, sourceId, gramsTotal, nameOverride, emojiOverride, expiryDate) {
      setState(prev => {
        const per100 = per100Of(sourceType, sourceId, prev.foods, prev.dishes);
        if (!per100) return prev;
        const item = { id:uid(), name: nameOverride || per100.name, emoji: emojiOverride || per100.emoji || "🍽️", sourceType, sourceId, gramsTotal:Number(gramsTotal)||0, gramsLeft:Number(gramsTotal)||0, expiryDate: expiryDate||null, createdAt:todayStr() };
        return { ...prev, inventory: [item, ...prev.inventory] };
      });
      pushToast("Добавлено в инвентарь", <Sparkles className="w-4 h-4 text-amber-400"/>);
    },
    // Точечное редактирование записи инвентаря (сейчас нужно в первую очередь для правки срока
    // годности после создания — тот же паттерн, что updateFood/updateDish).
    updateInventoryItem(id, patch) {
      setState(prev => ({ ...prev, inventory: prev.inventory.map(x => x.id===id ? { ...x, ...patch } : x) }));
    },
    deleteInventoryItem(id) {
      commit((prev, defer) => {
        const removedIdx = prev.inventory.findIndex(x => x.id===id);
        const removed = prev.inventory[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Запись инвентаря удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, inventory: insertAt(p2.inventory, removedIdx, removed) }));
        }));
        return { ...prev, inventory: prev.inventory.filter(x => x.id!==id) };
      });
    },
    // Выбросить остаток — обнуляет gramsLeft в обход дневника питания (никакой записи о приёме
    // пищи не создаётся). Мягко: как удаление, отменяемо тостом (не путать с deleteInventoryItem,
    // который убирает саму запись инвентаря целиком).
    discardInventoryItem(id) {
      commit((prev, defer) => {
        const item = prev.inventory.find(x => x.id===id);
        if (!item || item.gramsLeft<=0) return prev;
        const prevGramsLeft = item.gramsLeft;
        defer(() => pushToast("Остаток выброшен", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, inventory: p2.inventory.map(x => x.id===id ? { ...x, gramsLeft: prevGramsLeft } : x) }));
        }));
        return { ...prev, inventory: prev.inventory.map(x => x.id===id ? { ...x, gramsLeft: 0 } : x) };
      });
    },
    // Съесть/использовать из инвентаря — списывает остаток И логирует в дневник одним действием
    // (то самое "удобно вычитать" из ТЗ). Если в этом же приёме уже есть строка с тем же
    // источником — не плодим вторую, суммируем граммовку в существующую (Яйцо + Яйцо = 2 яйца).
    consumeInventory(id, grams, meal, date) {
      setState(prev => {
        const item = prev.inventory.find(x => x.id===id);
        if (!item) return prev;
        const per100 = per100Of(item.sourceType, item.sourceId, prev.foods, prev.dishes);
        const d = date||todayStr(), m = meal||1;
        const inventory = prev.inventory.map(x => x.id===id ? { ...x, gramsLeft: Math.max(0, x.gramsLeft-(Number(grams)||0)) } : x);
        const dup = prev.nutritionLog.find(e => e.kind==="food" && e.date===d && (e.meal||1)===m && e.sourceType==="inventory" && e.sourceId===id);
        if (dup) {
          const combinedGrams = (dup.grams||0)+(Number(grams)||0);
          const n = per100 ? nutritionFromGrams(per100, combinedGrams) : { calories:0, protein:0, fat:0, carbs:0 };
          return { ...prev, inventory, nutritionLog: prev.nutritionLog.map(e => e.id===dup.id ? { ...dup, grams:combinedGrams, ...n } : e) };
        }
        const n = per100 ? nutritionFromGrams(per100, grams) : { calories:0, protein:0, fat:0, carbs:0 };
        const logEntry = { id:uid(), date: d, kind:"food", sourceType:"inventory", sourceId:id, grams:Number(grams)||0, meal: m, ...n };
        return { ...prev, inventory, nutritionLog: [logEntry, ...prev.nutritionLog] };
      });
    },
    // То же слияние для продуктов/блюд (не из инвентаря): повторное добавление того же источника
    // в тот же приём суммирует граммовку в уже существующую строку, а не создаёт новую.
    logFood(sourceType, sourceId, grams, meal, date) {
      setState(prev => {
        const per100 = per100Of(sourceType, sourceId, prev.foods, prev.dishes);
        if (!per100) return prev;
        const d = date||todayStr(), m = meal||1;
        const dup = prev.nutritionLog.find(e => e.kind==="food" && e.date===d && (e.meal||1)===m && e.sourceType===sourceType && e.sourceId===sourceId);
        if (dup) {
          const combinedGrams = (dup.grams||0)+(Number(grams)||0);
          const n = nutritionFromGrams(per100, combinedGrams);
          return { ...prev, nutritionLog: prev.nutritionLog.map(e => e.id===dup.id ? { ...dup, grams:combinedGrams, ...n } : e) };
        }
        const n = nutritionFromGrams(per100, grams);
        const logEntry = { id:uid(), date: d, kind:"food", sourceType, sourceId, grams:Number(grams)||0, meal: m, ...n };
        return { ...prev, nutritionLog: [logEntry, ...prev.nutritionLog] };
      });
    },
    // Вода за день хранится ОДНОЙ записью (как еда — задваивать незачем): "+N мл" суммируется в
    // неё же. Заодно самостоятельно схлопывает любые старые "россыпи" записей за ту же дату, если
    // они где-то остались (не должно, но на всякий случай — не листать дневник ради этого).
    logWater(ml, date) {
      setState(prev => {
        const d = date||todayStr();
        const existingTotal = prev.nutritionLog.filter(e => e.kind==="water" && e.date===d).reduce((a,e) => a+(e.ml||0), 0);
        const others = prev.nutritionLog.filter(e => !(e.kind==="water" && e.date===d));
        const entry = { id:uid(), date:d, kind:"water", ml: existingTotal+(Number(ml)||0) };
        return { ...prev, nutritionLog: [entry, ...others] };
      });
    },
    // Прямая правка итога за день — так же просто, как pagesRead у книги или achievementsGot у игры.
    setWaterForDay(date, ml) {
      setState(prev => {
        const d = date||todayStr();
        const others = prev.nutritionLog.filter(e => !(e.kind==="water" && e.date===d));
        const entry = { id:uid(), date:d, kind:"water", ml: Math.max(0, Number(ml)||0) };
        return { ...prev, nutritionLog: [entry, ...others] };
      });
    },
    // Редактирование строки дневника (источник и/или граммовка). Если старая и/или новая запись
    // ведёт на инвентарь — корректно возвращает старое списание и применяет новое, тем же
    // способом, что и consumeInventory (per100 берётся от sourceType/sourceId самого инвентарного
    // предмета, а не от "inventory" напрямую — per100Of такого типа не понимает). Если после
    // правки источник совпал с другой строкой этого же приёма — сливаем в неё (та же логика
    // антидублирования, что при обычном добавлении), а редактируемая запись исчезает.
    updateNutritionLogEntry(id, { sourceType, sourceId, grams }) {
      setState(prev => {
        const old = prev.nutritionLog.find(e => e.id===id);
        if (!old) return prev;
        let inventory = prev.inventory;
        if (old.sourceType==="inventory") {
          inventory = inventory.map(x => x.id===old.sourceId ? { ...x, gramsLeft: x.gramsLeft + (old.grams||0) } : x);
        }
        let per100 = null;
        if (sourceType==="inventory") {
          const invItem = inventory.find(x => x.id===sourceId);
          if (!invItem) return prev;
          per100 = per100Of(invItem.sourceType, invItem.sourceId, prev.foods, prev.dishes);
        } else {
          per100 = per100Of(sourceType, sourceId, prev.foods, prev.dishes);
        }
        if (!per100) return prev;
        if (sourceType==="inventory") {
          inventory = inventory.map(x => x.id===sourceId ? { ...x, gramsLeft: Math.max(0, x.gramsLeft-(Number(grams)||0)) } : x);
        }
        const dup = prev.nutritionLog.find(e => e.id!==id && e.kind==="food" && e.date===old.date && (e.meal||1)===(old.meal||1) && e.sourceType===sourceType && e.sourceId===sourceId);
        if (dup) {
          const combinedGrams = (dup.grams||0)+(Number(grams)||0);
          const n = nutritionFromGrams(per100, combinedGrams);
          const nutritionLog = prev.nutritionLog.filter(e => e.id!==id).map(e => e.id===dup.id ? { ...dup, grams:combinedGrams, ...n } : e);
          return { ...prev, inventory, nutritionLog };
        }
        const n = nutritionFromGrams(per100, grams);
        const updated = { ...old, sourceType, sourceId, grams:Number(grams)||0, ...n };
        return { ...prev, inventory, nutritionLog: prev.nutritionLog.map(e => e.id===id ? updated : e) };
      });
      pushToast("Запись изменена", <Pencil className="w-4 h-4 text-amber-400"/>);
    },
    // Удаление строки дневника. Если запись списана с инвентарного предмета — грамм возвращается
    // в остаток (той же логикой, что и при редактировании: sourceType/sourceId/grams самой записи
    // и есть тот "маркер", по которому знаем, куда и сколько возвращать). Undo — зеркально списывает обратно.
    // Переставить строку дневника на позицию выше/ниже внутри того же приёма (direction: -1/+1).
    // Порядок отображения строк приёма — это их относительный порядок в самом nutritionLog,
    // поэтому переставляем физически элементы массива, а не храним отдельное поле "order".
    moveNutritionLogEntry(id, direction) {
      setState(prev => {
        const entry = prev.nutritionLog.find(e => e.id===id);
        if (!entry) return prev;
        const siblingArrIdx = [];
        prev.nutritionLog.forEach((e,i) => { if (e.kind==="food" && e.date===entry.date && (e.meal||1)===(entry.meal||1)) siblingArrIdx.push(i); });
        const entryArrIdx = prev.nutritionLog.indexOf(entry);
        const pos = siblingArrIdx.indexOf(entryArrIdx);
        const swapPos = pos + direction;
        if (swapPos<0 || swapPos>=siblingArrIdx.length) return prev;
        const otherArrIdx = siblingArrIdx[swapPos];
        const arr = prev.nutritionLog.slice();
        [arr[entryArrIdx], arr[otherArrIdx]] = [arr[otherArrIdx], arr[entryArrIdx]];
        return { ...prev, nutritionLog: arr };
      });
    },
    deleteNutritionLogEntry(id) {
      commit((prev, defer) => {
        const removedIdx = prev.nutritionLog.findIndex(e => e.id===id);
        const removed = prev.nutritionLog[removedIdx];
        if (!removed) return prev;
        let inventory = prev.inventory;
        if (removed.sourceType==="inventory") {
          inventory = inventory.map(x => x.id===removed.sourceId ? { ...x, gramsLeft: x.gramsLeft+(removed.grams||0) } : x);
        }
        defer(() => pushToast("Запись удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => {
            let inv2 = p2.inventory;
            if (removed.sourceType==="inventory") {
              inv2 = inv2.map(x => x.id===removed.sourceId ? { ...x, gramsLeft: Math.max(0, x.gramsLeft-(removed.grams||0)) } : x);
            }
            return { ...p2, inventory: inv2, nutritionLog: insertAt(p2.nutritionLog, removedIdx, removed) };
          });
        }));
        return { ...prev, inventory, nutritionLog: prev.nutritionLog.filter(e => e.id!==id) };
      });
    },
    // Убрать пустой (без единой записи) приём и сдвинуть номера последующих приёмов этой даты
    // на 1 вниз — чтобы не оставалось дырок в нумерации (1, [пусто], 3 → 1, 2). Сам пустой приём
    // нигде не хранится (это чисто локальное состояние вида), поэтому действию нечего удалять из
    // nutritionLog — только перенумеровать то, что идёт после.
    renumberMealsAfterEmptyRemoved(date, removedMeal) {
      setState(prev => ({
        ...prev,
        nutritionLog: prev.nutritionLog.map(e => (e.date===date && e.kind==="food" && (e.meal||1) > removedMeal) ? { ...e, meal:(e.meal||1)-1 } : e),
      }));
    },
    updateNutritionGoal(patch) {
      setState(prev => ({ ...prev, nutritionGoal: { ...defaultNutritionGoal(), ...prev.nutritionGoal, ...patch } }));
    },
    clearNutritionGoal() {
      setState(prev => ({ ...prev, nutritionGoal: defaultNutritionGoal() }));
    },

    // toggleLibrarySource("movie", "omdb", false) — включить/выключить конкретный источник
    // поиска обложек для конкретного вида.
    toggleLibrarySource(kind, sourceId, enabled) {
      setState(prev => {
        const cur = (prev.uiPrefs && prev.uiPrefs.librarySources) || defaultLibrarySources();
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), librarySources: { ...cur, [kind]: { ...cur[kind], [sourceId]: enabled } } } };
      });
    },

    // Единый экшен на перетаскивание и на стрелки вверх/вниз в списке вкладок меню — тот же
    // паттерн, что у категорий/типов отношений/людей. "hub" — как "Другое" у категорий, только
    // закреплён первым, а не последним: никогда не двигается и не скрывается.
    reorderTab(fromId, toId) {
      if (fromId==="hub" || toId==="hub") return;
      setState(prev => {
        const order = fullTabOrder(prev);
        const movable = order.filter(id => id!=="hub");
        const fromIdx = movable.indexOf(fromId);
        const toIdx = movable.indexOf(toId);
        if (fromIdx<0 || toIdx<0 || fromIdx===toIdx) return prev;
        const copy = movable.slice();
        const [item] = copy.splice(fromIdx, 1);
        copy.splice(toIdx, 0, item);
        const tabsPref = (prev.uiPrefs && prev.uiPrefs.tabs) || { hidden: [] };
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), tabs: { ...tabsPref, order: ["hub", ...copy] } } };
      });
    },
    toggleTabHidden(id) {
      if (id === "hub") return;
      setState(prev => {
        const tabsPref = (prev.uiPrefs && prev.uiPrefs.tabs) || { order: fullTabOrder(prev), hidden: [] };
        const hidden = tabsPref.hidden.includes(id) ? tabsPref.hidden.filter(x => x!==id) : [...tabsPref.hidden, id];
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), tabs: { ...tabsPref, hidden } } };
      });
    },

    addRelation(rel) {
      setState(prev => {
        if ((prev.peopleRelations||[]).some(r => r.name.toLowerCase()===rel.name.toLowerCase())) return prev;
        return { ...prev, peopleRelations: [...(prev.peopleRelations||[]), rel] };
      });
    },
    deleteRelation(name) {
      commit((prev, defer) => {
        if (name === "Другое") return prev;
        const removedIdx = (prev.peopleRelations||[]).findIndex(r => r.name===name);
        const removed = (prev.peopleRelations||[])[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Тип отношений удалён", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ((p2.peopleRelations||[]).some(r=>r.name===name) ? p2 : { ...p2, peopleRelations: insertAt(p2.peopleRelations, removedIdx, removed) }));
        }));
        return { ...prev, peopleRelations: prev.peopleRelations.filter(r => r.name!==name) };
      });
    },
    recolorRelation(name, color) {
      setState(prev => ({ ...prev, peopleRelations: (prev.peopleRelations||[]).map(r => r.name===name ? { ...r, color } : r) }));
    },
    reorderRelation(fromIdx, toIdx) {
      setState(prev => ({ ...prev, peopleRelations: moveInEditableList(prev.peopleRelations||[], fromIdx, toIdx) }));
    },

    addAccount(a) {
      commit((prev, defer) => {
        const order = (prev.accounts||[]).length;
        defer(() => pushToast("Счёт создан", <Wallet className="w-4 h-4 text-amber-400"/>));
        return { ...prev, accounts: [...(prev.accounts||[]), {
          id:uid(), kind:"regular", color:"amber", emoji:null, tracked:true, archived:false, order,
          createdAt:todayStr(), frozen:false, refillable:true, startDate:null, endDate:null, ...a,
        }] };
      });
    },
    updateAccount(id, patch) {
      setState(prev => ({ ...prev, accounts: (prev.accounts||[]).map(a => a.id===id ? { ...a, ...patch } : a) }));
    },
    // Порядок счетов задаётся вручную: он влияет и на списки в форме, и на разбивки, поэтому
    // держать первым тот счёт, которым пользуешься чаще, удобно. Двигаем обменом order с соседом
    // — тот же приём, что у категорий и типов отношений.
    moveAccount(id, delta) {
      setState(prev => {
        const list = (prev.accounts||[]).slice().sort((a,b) => (a.order??0)-(b.order??0));
        const idx = list.findIndex(a => a.id===id);
        const next = idx + delta;
        if (idx < 0 || next < 0 || next >= list.length) return prev;
        const reordered = list.slice();
        const [item] = reordered.splice(idx, 1);
        reordered.splice(next, 0, item);
        const orderById = {};
        reordered.forEach((a,i) => { orderById[a.id] = i; });
        return { ...prev, accounts: (prev.accounts||[]).map(a => ({ ...a, order: orderById[a.id] ?? a.order })) };
      });
    },
    toggleAccountTracked(id) {
      setState(prev => ({ ...prev, accounts: (prev.accounts||[]).map(a => a.id===id ? { ...a, tracked: a.tracked===false } : a) }));
    },
    // Счёт с историей удалять нельзя — операции остались бы висеть на несуществующем счёте, а их
    // суммы выпали бы из всех итогов. Тот же принцип, что у сфер с привязанными квестами: вместо
    // удаления предлагаем архивацию (счёт исчезает из выбора в форме, но история остаётся целой).
    deleteAccount(id) {
      commit((prev, defer) => {
        const inUse = (prev.transactions||[]).some(t => t.accountId===id || t.toAccountId===id);
        if (inUse) {
          defer(() => pushToast("Нельзя удалить: на счёте есть операции. Его можно архивировать", <Shield className="w-4 h-4 text-red-400"/>));
          return prev;
        }
        const removedIdx = (prev.accounts||[]).findIndex(a => a.id===id);
        const removed = (prev.accounts||[])[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Счёт удалён", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, accounts: insertAt(p2.accounts, removedIdx, removed) }));
        }));
        return { ...prev, accounts: prev.accounts.filter(a => a.id!==id) };
      });
    },
    archiveAccount(id, archived) {
      setState(prev => ({ ...prev, accounts: (prev.accounts||[]).map(a => a.id===id ? { ...a, archived: !!archived } : a) }));
    },
    addTransaction(tx) { setState(prev => ({ ...prev, transactions: [{ id:uid(), ...tx }, ...prev.transactions] })); },
    updateTransaction(id, patch) { setState(prev => ({ ...prev, transactions: prev.transactions.map(t => t.id===id ? { ...t, ...patch } : t) })); },
    deleteTransaction(id) {
      commit((prev, defer) => {
        const removedIdx = prev.transactions.findIndex(t => t.id===id);
        const removed = prev.transactions[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Операция удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, transactions: insertAt(p2.transactions, removedIdx, removed) }));
        }));
        return { ...prev, transactions: prev.transactions.filter(t => t.id!==id) };
      });
    },
    setBudget(category, amount) { setState(prev => ({ ...prev, budgets: { ...prev.budgets, [category]: amount } })); },

    addCategory(type, cat) {
      setState(prev => {
        if (prev.categories[type].some(c => c.name.toLowerCase()===cat.name.toLowerCase())) return prev;
        return { ...prev, categories: { ...prev.categories, [type]: insertBeforeOther(prev.categories[type], cat) } };
      });
    },
    deleteCategory(type, name) {
      commit((prev, defer) => {
        if (name === "Другое" || name === "Люди") return prev;
        const removed = prev.categories[type].find(c => c.name===name);
        defer(() => pushToast("Категория удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => (p2.categories[type].some(c=>c.name===name) ? p2 : { ...p2, categories: { ...p2.categories, [type]: insertBeforeOther(p2.categories[type], removed) } }));
        }));
        return { ...prev, categories: { ...prev.categories, [type]: prev.categories[type].filter(c => c.name!==name) } };
      });
    },
    recolorCategory(type, name, color) {
      setState(prev => ({ ...prev, categories: { ...prev.categories, [type]: prev.categories[type].map(c => c.name===name ? { ...c, color } : c) } }));
    },
    reorderCategory(type, fromIdx, toIdx) {
      setState(prev => ({ ...prev, categories: { ...prev.categories, [type]: moveInEditableList(prev.categories[type], fromIdx, toIdx) } }));
    },

    addAchievement(a) {
      setState(prev => ({ ...prev, achievements: [{ id:uid(), unlockedAt:null, ...a }, ...(prev.achievements||[])] }));
      pushToast("Достижение создано", <Award className="w-4 h-4 text-amber-400"/>);
    },
    deleteAchievement(id) {
      commit((prev, defer) => {
        const removedIdx = (prev.achievements||[]).findIndex(a => a.id===id);
        const removed = (prev.achievements||[])[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Достижение удалено", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, achievements: insertAt(p2.achievements, removedIdx, removed) }));
        }));
        return { ...prev, achievements: (prev.achievements||[]).filter(a => a.id!==id) };
      });
    },

    addReward(r) { setState(prev => ({ ...prev, rewards: [{ id:uid(), purchases:[], ...r }, ...prev.rewards] })); },
    deleteReward(id) {
      commit((prev, defer) => {
        const removedIdx = prev.rewards.findIndex(r => r.id===id);
        const removed = prev.rewards[removedIdx];
        if (!removed) return prev;
        defer(() => pushToast("Награда удалена", <Trash2 className="w-4 h-4 text-zinc-400"/>, () => {
          setState(p2 => ({ ...p2, rewards: insertAt(p2.rewards, removedIdx, removed) }));
        }));
        return { ...prev, rewards: prev.rewards.filter(r => r.id!==id) };
      });
    },
    purchaseReward(id) {
      commit((prev, defer) => {
        const reward = prev.rewards.find(r => r.id===id);
        if (!reward || prev.profile.currency < reward.cost) { defer(() => pushToast("Недостаточно золота", <Coins className="w-4 h-4 text-red-400"/>)); return prev; }
        let next = {
          ...prev,
          profile: { ...prev.profile, currency: prev.profile.currency - reward.cost },
          rewards: prev.rewards.map(r => r.id===id ? { ...r, purchases:[...(r.purchases||[]), todayStr()] } : r),
        };
        // Награда, привязанная к библиотеке: вещь куплена — значит она больше не «Хочу купить», а
        // «Хочу прочитать/поиграть/посмотреть». Статус меняем только если он всё ещё "buy": вещь
        // могли купить и руками, и тогда навязывать ей откат к «хочу» неправильно.
        const link = reward.link;
        const item = link && LIBRARY_KINDS[link.kind] ? (prev[LIBRARY_KINDS[link.kind].stateKey]||[]).find(x => x.id===link.itemId) : null;
        const movedItem = item && item.status === "buy";
        if (movedItem) {
          const key = LIBRARY_KINDS[link.kind].stateKey;
          next[key] = next[key].map(x => x.id===link.itemId ? { ...x, status:"want" } : x);
        }
        defer(() => pushToast(
          movedItem ? `Куплено: ${libraryDisplayTitle(item)} → «${libraryStatusLabel(link.kind, "want")}»` : `Награда получена: ${reward.title}`,
          <Gem className="w-4 h-4 text-violet-400"/>,
          () => setState(p2 => {
            const reverted = {
              ...p2,
              profile: { ...p2.profile, currency: p2.profile.currency + reward.cost },
              rewards: p2.rewards.map(r => r.id===id ? { ...r, purchases:(r.purchases||[]).slice(0,-1) } : r),
            };
            if (movedItem) {
              const key = LIBRARY_KINDS[link.kind].stateKey;
              reverted[key] = reverted[key].map(x => x.id===link.itemId ? { ...x, status:"buy" } : x);
            }
            return reverted;
          })
        ));
        return next;
      });
    },

    resetAll() { setState(cleanState()); setTab("hub"); pushToast("Данные сброшены", <Sparkles className="w-4 h-4 text-amber-400"/>); },
    // Заполняет всё демо-данными (как при самом первом запуске) — кроме API-ключей, их
    // осознанно не трогаем, чтобы не заставлять вводить заново.
    fillPreviewData() {
      setState(prev => {
        const demo = defaultState();
        return { ...demo, uiPrefs: { ...demo.uiPrefs, apiKeys: (prev.uiPrefs && prev.uiPrefs.apiKeys) || demo.uiPrefs.apiKeys } };
      });
      setTab("hub");
      pushToast("Заполнено демо-данными", <Sparkles className="w-4 h-4 text-amber-400"/>);
    },
    updateProfile(patch) { setState(prev => ({ ...prev, profile: { ...prev.profile, ...patch } })); },
    replaceState(data) { setState(data); },
  };

  if (!loaded || !state) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <GlobalStyles />
        <div className="text-zinc-500 font-data text-sm">Загрузка мира...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-body text-zinc-100" style={{ backgroundImage:"radial-gradient(circle at 15% 0%, rgba(99,102,241,0.08), transparent 40%), radial-gradient(circle at 85% 15%, rgba(245,158,11,0.06), transparent 35%)" }}>
      <GlobalStyles />
      <div className="flex" style={{ minHeight:"100vh" }}>
        <Sidebar tab={tab} onNavigate={navigate} open={navOpen} onClose={() => setNavOpen(false)} state={state} onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar tab={tab} onMenu={() => setNavOpen(true)} state={state} />
          <main className="flex-1 px-4 md:px-8 py-6 w-full mx-auto" style={{ maxWidth:1180 }}>
            {/* Напоминание живёт только на Хабе и только когда действительно пора: полоска на
                каждом экране превращается в фон, который перестают замечать — а замечать её нужно
                ровно один раз в жизни, перед тем как данные пропадут. */}
            {tab==="hub" && backupReminder.due && (
              <button onClick={() => setSettingsOpen(true)}
                className="w-full mb-4 flex items-center gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-left hover:border-amber-500/50 transition">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-amber-200">
                    {backupReminder.never ? "Бэкапа ещё не было" : `Последний бэкап ${backupReminder.age} ${pluralRu(backupReminder.age, "день", "дня", "дней")} назад`}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Все данные лежат только в этом браузере. Чистка истории сотрёт их без возможности вернуть.
                  </div>
                </div>
                <span className="text-xs text-amber-300 shrink-0">Сделать</span>
              </button>
            )}
            {tab==="hub" && <HubView state={state} actions={actions} navigate={navigate} />}
            <Suspense fallback={<div className="py-16 text-center text-sm text-zinc-600">Загрузка раздела…</div>}>
            {tab==="calendar" && <CalendarView state={state} actions={actions} navigate={navigate} />}
            {tab==="quests" && <QuestsView state={state} actions={actions} />}
            {tab==="habits" && <HabitsView state={state} actions={actions} navigate={navigate} />}
            {tab==="spheres" && <SpheresView state={state} actions={actions} focus={sphereFocus} setFocus={setSphereFocus} />}
            {tab==="people" && <PeopleView state={state} actions={actions} focus={peopleFocus} setFocus={setPeopleFocus} />}
            {tab==="library" && <LibraryView state={state} actions={actions} focus={libraryFocus} setFocus={setLibraryFocus} />}
            {tab==="notes" && <NotesView state={state} actions={actions} focus={notesFocus} setFocus={setNotesFocus} navigate={navigate} />}
            {tab==="misc" && <MiscView state={state} actions={actions} navigate={navigate} />}
            {tab==="nutrition" && <NutritionView state={state} actions={actions} />}
            {tab==="sport" && <SportView state={state} actions={actions} />}
            {tab==="profile" && <ProfileView state={state} actions={actions} navigate={navigate} />}
            {tab==="finance" && <FinanceView state={state} actions={actions} navigate={navigate} />}
            {tab==="rewards" && <RewardsView state={state} actions={actions} />}
            </Suspense>
            {tab==="achievements" && <AchievementsView state={state} actions={actions} />}
          </main>
        </div>
      </div>
      <ToastStack toasts={toasts} onUndo={handleUndo} />
      {levelUp && <LevelUpModal level={levelUp} onClose={() => setLevelUp(null)} />}
      {campaignDone && <CampaignDoneModal data={campaignDone} onClose={() => setCampaignDone(null)} />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} state={state} actions={actions} />
    </div>
  );
}
