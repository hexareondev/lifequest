import React, { Suspense, lazy, useState, useEffect, useMemo, useRef } from "react";
import { financeActions } from "./finance/actions.js";
import { reportActions } from "./reports/actions.js";
import { pendingReport, reportMonthWord } from "./reports/model.js";
import { calendarActions } from "./calendar/actions.js";
import { shareActions } from "./share/actions.js";
import { questActions } from "./quests/actions.js";
import { habitActions } from "./habits/actions.js";
import { libraryActions } from "./library/actions.js";
import { sportActions } from "./sport/actions.js";
import { sphereActions } from "./quests/sphere-actions.js";
import { profileActions } from "./profile/actions.js";
import { rewardActions } from "./rewards/actions.js";
import { settingsActions } from "./settings/actions.js";
import { peopleActions } from "./people/actions.js";
import { notesActions } from "./notes/actions.js";
import { nutritionActions } from "./nutrition/actions.js";
import { Flame, Sparkles, Check, AlertCircle, Medal } from "lucide-react";
import { todayStr, uid } from "./core/basics.js";
import { pluralRu } from "./core/format.js";
import { levelFromXp, overallOf } from "./core/xp.js";
import { visibleTabsOf } from "./core/tabs.js";
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
} from "./habits/model.js";
import { computeSyncedHolidayQuests } from "./quests/holidays.js";
import { backupReminderState } from "./core/backup.js";
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
const ReportsView = lazyView(() => import("./reports/ui.jsx"), "ReportsView");

/* =================================== APP =================================== */

export default function App() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("hub");
  const [sphereFocus, setSphereFocus] = useState(null);
  const [reportFocus, setReportFocus] = useState(null);
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
  // Отчёт считается из всех журналов — только на Хабе и только когда меняется состояние.
  const reportNotice = useMemo(() => (state && tab === "hub" ? pendingReport(state, todayStr()) : null), [state, tab]);

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

  // Откат вызывается СНАРУЖИ функции обновления: раньше он стоял внутри setToasts(ts => …), и
  // StrictMode в разработке прогонял её дважды — откат применялся дважды (золото списывалось
  // вдвое). undoneRef — от двойного нажатия «Отменить», пока тост ещё не исчез.
  const undoneRef = useRef(new Set());
  function handleUndo(id) {
    if (undoneRef.current.has(id)) return;
    const t = toasts.find(x => x.id===id);
    if (!t) return;
    undoneRef.current.add(id);
    if (t.undo) t.undo();
    setToasts(ts => ts.filter(x => x.id!==id));
  }

  function navigate(nextTab, focus) {
    setTab(nextTab);
    if (focus) {
      if (nextTab === "spheres") setSphereFocus(focus);
      else if (nextTab === "people") setPeopleFocus(focus);
      else if (nextTab === "library") setLibraryFocus(focus);
      else if (nextTab === "notes") setNotesFocus(focus);
      else if (nextTab === "reports") setReportFocus(focus);
    }
    setNavOpen(false);
  }

  // Действия разделов живут в их папках (*/actions.js) и получают от App только то, что им нужно:
  // setState, commit и pushToast, а квесты, привычки и библиотека — ещё окна уровня и кампании.
  // Здесь остаются действия самого App: они переключают вкладку или заменяют состояние целиком.
  const actions = {
    ...questActions({ setState, commit, pushToast, setLevelUp, setCampaignDone }),
    ...sphereActions({ setState, commit, pushToast }),
    ...habitActions({ setState, commit, pushToast, setLevelUp }),
    ...calendarActions({ setState, commit, pushToast }),
    ...peopleActions({ setState, commit, pushToast }),
    ...libraryActions({ setState, commit, pushToast, setLevelUp }),
    ...notesActions({ setState, commit, pushToast }),
    ...nutritionActions({ setState, commit, pushToast }),
    ...sportActions({ setState, commit, pushToast }),
    ...financeActions({ setState, commit, pushToast }),
    ...rewardActions({ setState, commit, pushToast }),
    ...profileActions({ setState, commit, pushToast }),
    ...settingsActions({ setState, commit, pushToast }),
    ...shareActions({ setState, commit, pushToast }),
    ...reportActions({ setState }),

    // Простое уведомление без отката — для мест, где действие происходит вне состояния
    // (скачивание файла, копирование в буфер), но человеку нужно подтверждение, что оно прошло.
    notify(text) { pushToast(text, <Check className="w-4 h-4 text-emerald-400"/>); },
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
            {/* Боевой отчёт за прошлый месяц — один раз, пока его не открыли. */}
            {tab==="hub" && reportNotice && (
              <button onClick={() => navigate("reports", reportNotice.ym)}
                className="w-full mb-4 flex items-center gap-3 p-3 rounded-xl border border-amber-500/40 text-left hover:border-amber-400/70 transition"
                style={{ background:"linear-gradient(90deg, rgba(245,158,11,0.14), rgba(99,102,241,0.06))" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ border:"2px solid #f59e0b", boxShadow:"0 0 16px rgba(245,158,11,0.35)" }}>
                  <Medal className="w-5 h-5 text-amber-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-amber-100 font-semibold">Боевой отчёт за {reportMonthWord(reportNotice.ym)} готов</div>
                  <div className="text-[11px] text-zinc-400">
                    {reportNotice.medals ? `${reportNotice.medals} ${pluralRu(reportNotice.medals, "медаль", "медали", "медалей")} · ` : ""}итоги месяца и сравнение с прошлым
                  </div>
                </div>
                <span className="text-xs text-amber-300 shrink-0">Открыть</span>
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
            {tab==="reports" && <ReportsView state={state} actions={actions} focus={reportFocus} setFocus={setReportFocus} />}
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
