// Состояние приложения: ключи хранилища, первый запуск с демо-данными, сброс и приведение
// старых сохранений к нынешней форме.
//
// defaultState() — только демо для первого запуска. cleanState() — ручной сброс: личные данные
// уходят, структурные настройки остаются. normalizeState() — единственная дверь, через которую
// загруженное сохранение попадает в приложение: каждое новое поле должно получить здесь значение
// по умолчанию, иначе старые сохранения сломаются.

import { addDaysStr, todayStr, uid } from "../core/basics.js";
import { ensureCategory, normalizeCategoryList } from "../core/lists.js";
import {
  defaultApiKeys, defaultCalendarPrefs, defaultLibraryPrefs, defaultLibrarySources,
  defaultPeopleDetailPrefs, defaultQuestsPrefs,
} from "../core/prefs.js";
import { TABS } from "../core/tabs.js";
import { defaultAccounts, defaultFinanceTableFields } from "../finance/model.js";
import { BUDGET_SINCE_START, normalizeBudgetHistory } from "../finance/budget.js";
import { defaultLogRewards } from "../habits/model.js";
import { defaultMiscPrefs } from "../misc/model.js";
import { defaultNotesPrefs } from "../notes/model.js";
import { defaultNutritionGoal } from "../nutrition/model.js";
import { defaultPeopleCardFields, defaultPeopleRelations } from "../people/model.js";
import { withDemoReportHistory } from "../reports/demo.js";
import { CAMPAIGN_DEFAULT_PERCENT, defaultCampaignReward } from "../quests/campaigns.js";
import { questPersonIds, questSphereIds } from "../quests/links.js";
import { normalizeQuestDates } from "../quests/spans.js";
import { defaultBody, defaultSportGoal } from "../sport/model.js";
import { defaultEmojiAssignments, defaultEmojiPools } from "../ui/emoji-pools.js";

export const STORAGE_KEY = "questlife_state_v1";
// Ключ прошлого имени проекта. Читается один раз при первом запуске после переименования и
// сразу переписывается под новый ключ — иначе смена имени стоила бы человеку всех данных.
// Старый ключ при этом не удаляем: пусть остаётся запасной копией, места он не занимает.
export const LEGACY_STORAGE_KEY = "lifequest_state_v1";
// Заметки сохраняются ОТДЕЛЬНЫМ ключом (подробности — в разделе «ЗАМЕТКИ: МОДЕЛЬ»): набор
// текста не должен переписывать всё остальное сохранение, а отметка подхода в тренировке —
// мегабайт текста заметок.
export const NOTES_STORAGE_KEY = "questlife_notes_v1";

export function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  return {
    profile: { ...base.profile, ...raw.profile, body: { ...defaultBody(), ...((raw.profile && raw.profile.body) || {}) } },
    // Спорт: все поля новые, на старых сохранениях пусто — демо-данные только в defaultState().
    exercises: Array.isArray(raw.exercises) ? raw.exercises : [],
    workouts: Array.isArray(raw.workouts) ? raw.workouts : [],
    workoutLog: Array.isArray(raw.workoutLog) ? raw.workoutLog : [],
    bodyLog: Array.isArray(raw.bodyLog) ? raw.bodyLog : [],
    trainingPlans: (Array.isArray(raw.trainingPlans) ? raw.trainingPlans : []).map(pl => ({
      status:"active", description:"", claimedFinal:false, completedAt:null, source:"manual", importedAt:null,
      ...pl, reward: { grantedXp:null, grantedGold:null, ...(pl && pl.reward) },
    })),
    sportGoal: { ...defaultSportGoal(), ...raw.sportGoal },
    logRewards: { ...defaultLogRewards(), ...raw.logRewards, claimed: { ...defaultLogRewards().claimed, ...((raw.logRewards||{}).claimed) } },
    spheres: Array.isArray(raw.spheres) && raw.spheres.length ? raw.spheres : base.spheres,
    // Квесты: новых обязательных полей нет, но у мультидневных нужно удержать инварианты дат
    // (startDate только вместе с deadline и только строго раньше) — старое сохранение с ними
    // прийти не может, а вот руками поправленный файл бэкапа — вполне. campaignId/stageId у
    // обычных квестов просто отсутствуют и везде трактуются как null, проставлять их не нужно.
    quests: (Array.isArray(raw.quests) ? raw.quests : base.quests).map(q => {
      const { sphereId, personId, ...rest } = q;
      return {
        ...rest,
        sphereIds: questSphereIds(q),
        personIds: questPersonIds(q),
        ...normalizeQuestDates(q.startDate, q.deadline),
      };
    }),
    // Кампании (комплексные квесты) — новое поле. Как у people/books, отката на демо-данные из
    // base здесь НЕТ: пустой список честнее, чем подмешанная в реальные данные выдумка.
    campaigns: (Array.isArray(raw.campaigns) ? raw.campaigns : []).map((c,i) => ({
      status:"active", color:null, description:"", personId:null, personName:null,
      claimedFinal:false, completedAt:null, source:"manual", importedAt:null, order:i,
      ...c,
      reward: { ...defaultCampaignReward(), ...(c && c.reward) },
      stages: Array.isArray(c && c.stages) ? c.stages.map((st,j) => ({ order:j, description:"", ...st })) : [],
    })),
    habits: Array.isArray(raw.habits) ? raw.habits : base.habits,
    // Счета: если их ещё нет (сохранение до появления подсистемы) — заводим базовую пару и
    // переносим на неё всю историю. Обычные операции и «откуда» у сбережений уходят на
    // «Основной», сберегательный конец — на «Сбережения». Суммы при этом не меняются: общий
    // баланс, сбережения и долги после миграции обязаны совпасть с прежними.
    accounts: Array.isArray(raw.accounts) && raw.accounts.length
      ? raw.accounts.map((a,i) => ({ order:i, tracked:true, archived:false, emoji:null, color:"amber", kind:"regular", ...a }))
      : defaultAccounts(),
    transactions: (Array.isArray(raw.transactions) ? raw.transactions : base.transactions).map(t => {
      const migrated = { ...t };
      if (!migrated.accountId) migrated.accountId = "acc_main";
      if (migrated.type === "savings" && !migrated.toAccountId) migrated.toAccountId = "acc_savings";
      // «Начальный капитал» и «Проценты по вкладу» к обычному счёту отношения не имеют: деньги
      // либо уже лежали на вкладе до начала учёта, либо начислены банком прямо на него. Раньше
      // миграция всё равно проставляла им «Основной» — снимаем эту ссылку, чтобы история не
      // утверждала, будто деньги пришли с карты. На суммы это не влияет: у таких операций
      // эффект для обычного счёта и так был нулевым.
      if (migrated.type === "savings" && migrated.direction === "deposit"
          && (migrated.source === "opening" || migrated.source === "interest")) {
        migrated.accountId = null;
      }
      return migrated;
    }),
    // Бюджет с историей планов (finance/budget.js). Старый единый набор «категория → сумма»
    // становится одним планом «с самого начала» — прошлые месяцы видят те же лимиты, что и раньше.
    budgetHistory: normalizeBudgetHistory(raw) || base.budgetHistory,
    rewards: Array.isArray(raw.rewards) ? raw.rewards : base.rewards,
    achievements: Array.isArray(raw.achievements) && raw.achievements.length ? raw.achievements : defaultAchievements(),
    // people — новое поле: у старых сохранений/выгрузок его никогда не было, поэтому в отличие от
    // остальных массивов здесь НЕТ отката на demo-примеры из base — просто пусто, чтобы не
    // подмешивать вымышленных людей в реальные данные пользователя. peopleRelations (типы
    // отношений) — это словарь-таксономия, а не персональные данные, поэтому ему безопасно
    // подставить базовый набор по тому же принципу, что и умолчания категорий. order/archivedAt
    // у отдельных людей — тоже новые поля, докидываем дефолты (order по позиции в массиве),
    // не ломая старые сохранения без них.
    // trackBirthday — опт-ин, по умолчанию false: включать отслеживание автоматически не нужно,
    // человек сам решает через глазик у карточки/в кебаб-меню. birthdayQuestYears — года, за
    // которые уже заводился авто-квест поздравления (идемпотентность, тот же принцип, что
    // claimedTiers у привязанных привычек — не задваивать и не "воскрешать" после удаления).
    people: (Array.isArray(raw.people) ? raw.people : []).map((p,i) => ({ order:i, archivedAt:null, avatarEmoji:null, trackBirthday:false, birthdayQuestYears:[], ...p })),
    peopleRelations: normalizeCategoryList(raw.peopleRelations && raw.peopleRelations.length ? raw.peopleRelations : base.peopleRelations),
    // Подписки на праздники — { [holidayId]: { subscribed, personIds, questYears } }, ключи не
    // синхронизированы заранее со списком HOLIDAYS (он задан в коде, не в state) — отсутствующий
    // ключ везде в вычислениях трактуется как "не подписан", отдельно предзаполнять не нужно.
    holidaySubscriptions: raw.holidaySubscriptions && typeof raw.holidaySubscriptions==="object" ? raw.holidaySubscriptions : {},
    // Библиотека — тоже новые поля, тот же принцип, что у people: на старых сохранениях просто
    // пусто, а не демо-примеры (не подмешивать вымышленные книги/игры/фильмы в реальные данные).
    books: Array.isArray(raw.books) ? raw.books : [],
    games: Array.isArray(raw.games) ? raw.games : [],
    movies: Array.isArray(raw.movies) ? raw.movies : [],
    // Сами записи не трогаем: отсутствующие collectionId/branchId/collectionOrder корректно
    // читаются как "не в коллекции" и "основная линия", а прогонять три больших списка через
    // map ради трёх undefined — лишняя работа на каждой загрузке.
    libraryCollections: (Array.isArray(raw.libraryCollections) ? raw.libraryCollections : []).map((c, i) => ({
      coverEmoji: "📦", order: i, createdAt: todayStr(), ...c,
      name: String(c.name || "Без названия"),
      mainBranchName: c.mainBranchName || null,
      // Полоса прогресса включена, пока её явно не выключили: старые коллекции без поля должны
      // выглядеть как раньше.
      showProgress: c.showProgress !== false,
      branches: (Array.isArray(c.branches) ? c.branches : []).map((b, j) => ({ order: j, ...b, name: String(b.name || "Ветка"), anchorId: b.anchorId || null })),
    })),
    // Питание — тот же принцип: на старых сохранениях пусто, не демо-примеры.
    foods: Array.isArray(raw.foods) ? raw.foods : [],
    dishes: Array.isArray(raw.dishes) ? raw.dishes : [],
    inventory: Array.isArray(raw.inventory) ? raw.inventory : [],
    nutritionLog: Array.isArray(raw.nutritionLog) ? raw.nutritionLog : [],
    nutritionGoal: { ...defaultNutritionGoal(), ...raw.nutritionGoal },
    // Дневник прочитанных страниц по датам — пишется только пока у книги активна цель по чтению
    // (нужен для дневной разбивки авто-привычки чтения с переносом излишка вперёд).
    readingLog: Array.isArray(raw.readingLog) ? raw.readingLog : [],
    lastBackupAt: raw.lastBackupAt || null,
    // Открытые боевые отчёты: без этого поля уведомление и вскрытие отчёта повторялись бы после
    // каждой перезагрузки страницы.
    reportsSeen: Array.isArray(raw.reportsSeen) ? raw.reportsSeen.filter(x => typeof x === "string") : [],
    // Заметки и дерево папок — личные данные, значит фолбэк на пустоту, а не на демо-набор
    // (тот же принцип, что у людей и книг). Инварианты дерева здесь не чиним: битый parentId
    // обходится защитой по числу витков в folderPathOf, а не переписыванием чужих данных.
    notes: (Array.isArray(raw.notes) ? raw.notes : []).map(n => ({
      title:"", body:"", folderId:null, pinned:false, createdAt: todayStr(), updatedAt: todayStr(), ...n,
    })),
    noteFolders: (Array.isArray(raw.noteFolders) ? raw.noteFolders : []).map((f,i) => ({
      parentId:null, color:null, order:i, createdAt: todayStr(), ...f, name: String(f.name || "Без названия"),
    })),
    uiPrefs: {
      peopleCardFields: { ...defaultPeopleCardFields(), ...(raw.uiPrefs && raw.uiPrefs.peopleCardFields) },
      library: { ...defaultLibraryPrefs(), ...(raw.uiPrefs && raw.uiPrefs.library) },
      quests: { ...defaultQuestsPrefs(), ...(raw.uiPrefs && raw.uiPrefs.quests) },
      sport: { view:"journal", paramsCollapsed:false, ...(raw.uiPrefs && raw.uiPrefs.sport) },
      profile: { statsCollapsed:false, ...(raw.uiPrefs && raw.uiPrefs.profile) },
      notes: { ...defaultNotesPrefs(), ...(raw.uiPrefs && raw.uiPrefs.notes) },
      misc: { ...defaultMiscPrefs(), ...(raw.uiPrefs && raw.uiPrefs.misc) },
      peopleDetail: { ...defaultPeopleDetailPrefs(), ...(raw.uiPrefs && raw.uiPrefs.peopleDetail) },
      apiKeys: { ...defaultApiKeys(), ...(raw.uiPrefs && raw.uiPrefs.apiKeys) },
      customEmojis: Array.isArray(raw.uiPrefs && raw.uiPrefs.customEmojis) ? raw.uiPrefs.customEmojis : [],
      emojiPools: (() => {
        const base = defaultEmojiPools();
        const raws = (raw.uiPrefs && raw.uiPrefs.emojiPools) || {};
        const merged = { ...base };
        Object.keys(raws).forEach(id => {
          const r = raws[id];
          if (!r) return;
          merged[id] = { name: r.name || (base[id] && base[id].name) || id, emojis: Array.isArray(r.emojis) ? r.emojis : (base[id] ? base[id].emojis : []) };
        });
        return merged;
      })(),
      emojiAssignments: { ...defaultEmojiAssignments(), ...(raw.uiPrefs && raw.uiPrefs.emojiAssignments) },
      librarySources: {
        book:  { ...defaultLibrarySources().book,  ...(raw.uiPrefs && raw.uiPrefs.librarySources && raw.uiPrefs.librarySources.book) },
        movie: { ...defaultLibrarySources().movie, ...(raw.uiPrefs && raw.uiPrefs.librarySources && raw.uiPrefs.librarySources.movie) },
        game:  { ...defaultLibrarySources().game,  ...(raw.uiPrefs && raw.uiPrefs.librarySources && raw.uiPrefs.librarySources.game) },
      },
      tabs: {
        order: Array.isArray(raw.uiPrefs && raw.uiPrefs.tabs && raw.uiPrefs.tabs.order) && raw.uiPrefs.tabs.order.length ? raw.uiPrefs.tabs.order : TABS.map(t=>t.id),
        hidden: Array.isArray(raw.uiPrefs && raw.uiPrefs.tabs && raw.uiPrefs.tabs.hidden) ? raw.uiPrefs.tabs.hidden.filter(id => id!=="hub") : [],
      },
      financeTableFields: { ...defaultFinanceTableFields(), ...(raw.uiPrefs && raw.uiPrefs.financeTableFields) },
      calendar: {
        ...defaultCalendarPrefs(),
        ...(raw.uiPrefs && raw.uiPrefs.calendar),
        filters: { ...defaultCalendarPrefs().filters, ...(raw.uiPrefs && raw.uiPrefs.calendar && raw.uiPrefs.calendar.filters) },
        monthPanel: { ...defaultCalendarPrefs().monthPanel, ...(raw.uiPrefs && raw.uiPrefs.calendar && raw.uiPrefs.calendar.monthPanel) },
      },
    },
    categories: {
      expense: ensureCategory(normalizeCategoryList(raw.categories && raw.categories.expense), "Люди", "cyan"),
      income: ensureCategory(normalizeCategoryList(raw.categories && raw.categories.income), "Люди", "cyan"),
    },
  };
}


/* ============================== SEED DATA ============================== */

// Демо-данные первого запуска и кнопки «Заполнить демо-данными». История за два прошлых месяца
// дописывается отдельно (reports/demo.js) — чтобы в демо сразу были видны боевые отчёты.
export function defaultState() {
  return withDemoReportHistory(demoState(), todayStr());
}

function demoState() {
  return {
    profile: { name: "Путник", currency: 165, avatarIcon: "Star", avatarImage: null,
      body: { ...defaultBody(), sex:"male", height:178, weight:76.9, level:"regular", focus:"health", equipment:["dumbbells","pullupBar"], trainingDays:[1,3,5] } },
    spheres: [
      { id:"health",     name:"Здоровье",   icon:"Heart",     color:"emerald", xp:210 },
      { id:"finance",    name:"Финансы",    icon:"Coins",     color:"amber",   xp:95  },
      { id:"career",     name:"Карьера",    icon:"Briefcase", color:"indigo",  xp:320 },
      { id:"knowledge",  name:"Обучение",   icon:"BookOpen",  color:"violet",  xp:150 },
      { id:"social",     name:"Отношения",  icon:"Users",     color:"rose",    xp:70  },
      { id:"home",       name:"Быт",        icon:"Home",      color:"orange",  xp:55  },
      { id:"creativity", name:"Творчество", icon:"Palette",   color:"cyan",    xp:25  },
      { id:"mind",       name:"Дисциплина", icon:"Brain",     color:"sky",     xp:130 },
    ],
    quests: [
      { id:uid(), title:"Собрать команду для нового проекта", description:"Найти и утвердить состав команды под запуск продукта.", sphereId:"career", priority:"high", difficulty:"hard", rewardXp:70, rewardGold:30, status:"active", deadline:addDaysStr(3), subtasks:[
        { id:uid(), text:"Составить список кандидатов", done:true },
        { id:uid(), text:"Провести собеседования", done:false },
        { id:uid(), text:"Сделать оффер финалисту", done:false },
      ], createdAt:addDaysStr(-2) },
      { id:uid(), title:"Прочитать книгу по инвестициям", description:"", sphereId:"knowledge", priority:"low", difficulty:"easy", rewardXp:15, rewardGold:5, status:"active", deadline:addDaysStr(10), subtasks:[], createdAt:addDaysStr(-5) },
      { id:uid(), title:"Организовать день рождения друга", description:"Забронировать место, придумать программу, купить подарок.", sphereId:"social", priority:"critical", difficulty:"epic", rewardXp:150, rewardGold:75, status:"active", deadline:addDaysStr(1), personId:"p1", personName:"Настя", subtasks:[
        { id:uid(), text:"Забронировать кафе", done:true },
        { id:uid(), text:"Купить подарок", done:false },
      ], createdAt:addDaysStr(-3) },
      { id:uid(), title:"Пробежать 5 км", description:"", sphereId:"health", priority:"medium", difficulty:"medium", rewardXp:35, rewardGold:15, status:"done", deadline:addDaysStr(-1), subtasks:[], createdAt:addDaysStr(-4), completedAt:addDaysStr(-1) },
      { id:uid(), title:"Убраться в гараже", description:"", sphereId:"home", priority:"low", difficulty:"medium", rewardXp:35, rewardGold:15, status:"failed", deadline:addDaysStr(-4), subtasks:[], createdAt:addDaysStr(-9) },
      // Демонстрационная кампания (см. campaigns ниже): один выполненный квест, один идущий
      // многодневный и один впереди — чтобы при первом запуске было видно, как это работает.
      { id:"dq1", campaignId:"dc1", stageId:"ds1", title:"Собрать требования к сайту", description:"", sphereId:"creativity", priority:"high", difficulty:"medium", rewardXp:35, rewardGold:15, status:"done", deadline:addDaysStr(-1), subtasks:[], createdAt:addDaysStr(-3), completedAt:addDaysStr(-1) },
      { id:"dq2", campaignId:"dc1", stageId:"ds1", title:"Нарисовать макет главной", description:"", sphereId:"creativity", priority:"medium", difficulty:"hard", rewardXp:70, rewardGold:30, status:"active", startDate:todayStr(), deadline:addDaysStr(2), subtasks:[
        { id:uid(), text:"Сетка и типографика", done:false },
        { id:uid(), text:"Первый экран", done:false },
      ], createdAt:addDaysStr(-3) },
      { id:"dq3", campaignId:"dc1", stageId:"ds2", title:"Свёрстать главную страницу", description:"", sphereId:"creativity", priority:"medium", difficulty:"hard", rewardXp:70, rewardGold:30, status:"active", deadline:addDaysStr(6), subtasks:[], createdAt:addDaysStr(-3) },
    ],
    campaigns: [
      { id:"dc1", title:"Сайт-портфолио", description:"Собрать и выложить портфолио за пару недель.",
        sphereId:"creativity", color:"cyan", status:"active", createdAt:addDaysStr(-3), completedAt:null,
        claimedFinal:false, reward:{ mode:"auto", percent:CAMPAIGN_DEFAULT_PERCENT, xp:null, gold:null, grantedXp:null, grantedGold:null },
        stages:[
          { id:"ds1", title:"Этап 1. Дизайн", description:"", order:0 },
          { id:"ds2", title:"Этап 2. Вёрстка", description:"", order:1 },
        ], source:"manual", importedAt:null },
    ],
    habits: [
      { id:"h2", title:"30 минут спорта", sphereId:"health", logs:[addDaysStr(0),addDaysStr(-1),addDaysStr(-3),addDaysStr(-4),addDaysStr(-7)] },
      { id:"h4", title:"Планировать день", sphereId:"mind", logs:[addDaysStr(0),addDaysStr(-1),addDaysStr(-2),addDaysStr(-3),addDaysStr(-4),addDaysStr(-5),addDaysStr(-6)] },
      { id:"h5", title:"Позвонить родителям", sphereId:"social", personId:"p2", personName:"Мама", logs:[addDaysStr(-2),addDaysStr(-9)] },
    ],
    accounts: defaultAccounts(),
    transactions: [
      { id:uid(), type:"income",  amount:120000, category:"Зарплата",    date:addDaysStr(-2),  description:"Зарплата за месяц" },
      { id:uid(), type:"expense", amount:32000,  category:"Жильё",       date:addDaysStr(-2),  description:"Аренда квартиры" },
      { id:uid(), type:"expense", amount:8400,   category:"Еда",         date:addDaysStr(-4),  description:"Продукты на неделю" },
      { id:uid(), type:"expense", amount:2200,   category:"Транспорт",   date:addDaysStr(-6),  description:"Проездной" },
      { id:uid(), type:"income",  amount:18000,  category:"Фриланс",     date:addDaysStr(-9),  description:"Проект для клиента" },
      { id:uid(), type:"expense", amount:5600,   category:"Развлечения", date:addDaysStr(-10), description:"Кино и ужин" },
      { id:uid(), type:"expense", amount:1200,   category:"Подписки",    date:addDaysStr(-15), description:"Стриминг-сервисы" },
      { id:uid(), type:"income",  amount:120000, category:"Зарплата",    date:addDaysStr(-33), description:"Зарплата за месяц" },
      { id:uid(), type:"expense", amount:29500,  category:"Жильё",       date:addDaysStr(-33), description:"Аренда квартиры" },
      { id:uid(), type:"expense", amount:9700,   category:"Еда",         date:addDaysStr(-36), description:"Продукты" },
      { id:uid(), type:"expense", amount:14300,  category:"Одежда",      date:addDaysStr(-40), description:"Новая куртка" },
      { id:uid(), type:"income",  amount:120000, category:"Зарплата",    date:addDaysStr(-63), description:"Зарплата за месяц" },
      { id:uid(), type:"expense", amount:31000,  category:"Жильё",       date:addDaysStr(-63), description:"Аренда квартиры" },
      { id:uid(), type:"expense", amount:7100,   category:"Еда",         date:addDaysStr(-58), description:"Продукты" },
      { id:uid(), type:"savings", direction:"deposit", amount:15000, category:"Сбережения", date:addDaysStr(-2),  description:"Отложил с зарплаты" },
      { id:uid(), type:"savings", direction:"deposit", amount:10000, category:"Сбережения", date:addDaysStr(-33), description:"Отложил с зарплаты" },
      { id:uid(), type:"debt", direction:"lend", source:"manual",  personId:"p1", person:"Настя", via:"Настя", amount:5000, category:"Долг", date:addDaysStr(-15),  description:"Одолжил на новый телефон" },
      { id:uid(), type:"debt", direction:"lend", source:"opening", personId:"p2", person:"Мама",  via:"Мама",  amount:3000, category:"Долг", date:addDaysStr(-100), description:"Долг с начала учёта" },
      { id:uid(), type:"expense", personId:"p1", person:"Настя", via:"Настя", amount:1500, category:"Люди", date:addDaysStr(-6), description:"Скинулись на подарок" },
      { id:uid(), type:"income",  personId:"p2", person:"Мама",  via:"Мама",  amount:2000, category:"Люди", date:addDaysStr(-3), description:"Вернула за продукты" },
    ],
    budgetHistory: [{ from: BUDGET_SINCE_START, limits: { "Еда":28000, "Транспорт":6000, "Развлечения":9000, "Подписки":3000, "Жильё":33000 } }],
    rewards: [
      { id:uid(), title:"Вечер кино дома", cost:30,  repeatable:true,  purchases:[addDaysStr(-6)] },
      { id:uid(), title:"Новая игра",      cost:120, repeatable:false, purchases:[] },
      { id:uid(), title:"Поход в спа",     cost:280, repeatable:false, purchases:[] },
    ],
    achievements: defaultAchievements(),
    people: [
      { id:"p1", name:"Настя", relation:"Друг",  icon:"Heart", color:"rose",  avatarEmoji:null, avatarImage:null, notes:"Знакомы со студенчества.", birthday:null, xp:40, archived:false, archivedAt:null, order:0, createdAt:addDaysStr(-90) },
      { id:"p2", name:"Мама",  relation:"Семья", icon:"Home",  color:"amber", avatarEmoji:null, avatarImage:null, notes:"", birthday:null, xp:15, archived:false, archivedAt:null, order:1, createdAt:addDaysStr(-90) },
    ],
    peopleRelations: defaultPeopleRelations(),
    holidaySubscriptions: {},
    books: [
      { id:"b1", title:"Дюна", coverEmoji:"📚", coverImage:null, status:"active", pagesRead:180, pagesTotal:412, rating:0, sphereId:"knowledge", rewardXp:60, readingGoal:{ startDate:addDaysStr(-3), endDate:addDaysStr(11), pagesPerDay:20 }, notes:[{ id:uid(), text:"Начало неспешное, но мир затягивает.", date:addDaysStr(-4) }], createdAt:addDaysStr(-10) },
    ],
    games: [
      { id:"g1", title:"Hades", coverEmoji:"🎮", coverImage:null, status:"done", hours:38, achievementsGot:32, achievementsTotal:49, rating:5, sphereId:"creativity", rewardXp:40, notes:[], createdAt:addDaysStr(-40) },
    ],
    movies: [
      { id:"m1", title:"Интерстеллар", coverEmoji:"🎬", coverImage:null, status:"want", kind:"movie", episodesTotal:0, episodeAt:0, rating:0, sphereId:null, rewardXp:0, notes:[], createdAt:addDaysStr(-2) },
    ],
    foods: [
      { id:"f1", name:"Куриная грудка",  emoji:"🍗", caloriesPer100:165, proteinPer100:31,  fatPer100:3.6, carbsPer100:0,    pieceWeight:null, createdAt:addDaysStr(-30) },
      { id:"f2", name:"Рис варёный",     emoji:"🍚", caloriesPer100:130, proteinPer100:2.7, fatPer100:0.3, carbsPer100:28,   pieceWeight:null, createdAt:addDaysStr(-30) },
      { id:"f3", name:"Яблоко",          emoji:"🍎", caloriesPer100:52,  proteinPer100:0.3, fatPer100:0.2, carbsPer100:14,   pieceWeight:150,  createdAt:addDaysStr(-30) },
      { id:"f4", name:"Яйцо варёное",    emoji:"🥚", caloriesPer100:155, proteinPer100:13,  fatPer100:11,  carbsPer100:1.1,  pieceWeight:50,   createdAt:addDaysStr(-30) },
      { id:"f5", name:"Молоко 3.2%",     emoji:"🥛", caloriesPer100:60,  proteinPer100:3,   fatPer100:3.2, carbsPer100:4.7,  pieceWeight:null, createdAt:addDaysStr(-30) },
    ],
    dishes: [
      { id:"d1", name:"Курица с рисом", emoji:"🍲", ingredients:[ { foodId:"f1", grams:200 }, { foodId:"f2", grams:200 } ], createdAt:addDaysStr(-20) },
    ],
    inventory: [
      { id:"inv1", name:"Курица с рисом (партия)", emoji:"🍲", sourceType:"dish", sourceId:"d1", gramsTotal:800, gramsLeft:500, createdAt:addDaysStr(-2) },
    ],
    nutritionLog: [
      { id:uid(), date:addDaysStr(0),  kind:"food",  sourceType:"food",      sourceId:"f4",   grams:100, meal:1, calories:155,   protein:13,    fat:11,   carbs:1.1 },
      { id:uid(), date:addDaysStr(0),  kind:"food",  sourceType:"food",      sourceId:"f3",   grams:150, meal:1, calories:78,    protein:0.45,  fat:0.3,  carbs:21 },
      { id:uid(), date:addDaysStr(0),  kind:"food",  sourceType:"inventory", sourceId:"inv1", grams:300, meal:2, calories:442.5, protein:50.55, fat:5.85, carbs:42 },
      { id:uid(), date:addDaysStr(0),  kind:"water", ml:300 },
      { id:uid(), date:addDaysStr(0),  kind:"water", ml:500 },
      { id:uid(), date:addDaysStr(-1), kind:"food",  sourceType:"food",      sourceId:"f5",   grams:200, meal:1, calories:120, protein:6, fat:6.4, carbs:9.4 },
      { id:uid(), date:addDaysStr(-1), kind:"water", ml:1000 },
    ],
    nutritionGoal: { startDate:addDaysStr(-3), endDate:addDaysStr(10), calories:2000, protein:120, fat:70, carbs:200, water:2000 },
    // Базовый справочник упражнений: без него первая тренировка начинается с заполнения формы, а
    // не с тренировки. Этот же список переживает сброс данных (см. cleanState).
    exercises: [
      { id:"ex_squat",   name:"Приседания со штангой", kind:"strength", muscles:["legs","glutes"], defaultLoad:{ sets:4, reps:8, weight:50 }, notes:"", archived:false, createdAt:addDaysStr(-30) },
      { id:"ex_bench",   name:"Жим лёжа",              kind:"strength", muscles:["chest","arms"],  defaultLoad:{ sets:4, reps:8, weight:40 }, notes:"", archived:false, createdAt:addDaysStr(-30) },
      { id:"ex_row",     name:"Тяга в наклоне",        kind:"strength", muscles:["back","arms"],   defaultLoad:{ sets:3, reps:10, weight:35 }, notes:"", archived:false, createdAt:addDaysStr(-30) },
      { id:"ex_pullup",  name:"Подтягивания",          kind:"strength", muscles:["back","arms"],   defaultLoad:{ sets:3, reps:6, weight:null }, notes:"", archived:false, createdAt:addDaysStr(-30) },
      { id:"ex_plank",   name:"Планка",                kind:"mobility", muscles:["core"],          defaultLoad:{ sets:3, minutes:1 }, notes:"", archived:false, createdAt:addDaysStr(-30) },
      { id:"ex_run",     name:"Бег",                   kind:"cardio",   muscles:["cardio"],        defaultLoad:{ sets:1, minutes:30, km:5 }, notes:"", archived:false, createdAt:addDaysStr(-30) },
    ],
    workouts: [
      { id:"w_full", title:"Базовая тренировка", description:"Три движения на всё тело",
        items:[
          { id:uid(), exerciseId:"ex_squat",  sets:4, reps:8, weight:50, minutes:null, km:null, restSec:120 },
          { id:uid(), exerciseId:"ex_bench",  sets:4, reps:8, weight:40, minutes:null, km:null, restSec:120 },
          { id:uid(), exerciseId:"ex_row",    sets:3, reps:10, weight:35, minutes:null, km:null, restSec:90 },
        ], archived:false, createdAt:addDaysStr(-30) },
    ],
    workoutLog: [
      { id:uid(), date:addDaysStr(-2), workoutId:"w_full", planId:null, sessionId:null, title:"Базовая тренировка",
        status:"done", minutes:55, rpe:7, notes:"",
        entries:[
          { id:uid(), exerciseId:"ex_squat", name:"Приседания со штангой", sets:[
            { id:uid(), reps:8, weight:50, done:true }, { id:uid(), reps:8, weight:50, done:true },
            { id:uid(), reps:8, weight:52.5, done:true }, { id:uid(), reps:6, weight:52.5, done:true },
          ]},
          { id:uid(), exerciseId:"ex_bench", name:"Жим лёжа", sets:[
            { id:uid(), reps:8, weight:40, done:true }, { id:uid(), reps:8, weight:40, done:true },
            { id:uid(), reps:7, weight:40, done:true }, { id:uid(), reps:6, weight:40, done:false },
          ]},
        ] },
    ],
    trainingPlans: [],
    sportGoal: defaultSportGoal(),
    logRewards: defaultLogRewards(),
    bodyLog: [
      { id:uid(), date:addDaysStr(-28), weight:78.4, waist:86, chest:null, hips:null, bodyFat:null, notes:"" },
      { id:uid(), date:addDaysStr(-14), weight:77.6, waist:85, chest:null, hips:null, bodyFat:null, notes:"" },
      { id:uid(), date:addDaysStr(-2),  weight:76.9, waist:84, chest:null, hips:null, bodyFat:null, notes:"" },
    ],
    noteFolders: [
      { id:"nf-ideas", name:"Идеи", parentId:null, color:null, order:0, createdAt: addDaysStr(-6) },
      { id:"nf-books", name:"Из книг", parentId:"nf-ideas", color:null, order:0, createdAt: addDaysStr(-6) },
    ],
    notes: [
      { id:"nt-hello", title:"Как устроены заметки", folderId:null, pinned:true, createdAt: addDaysStr(-6), updatedAt: addDaysStr(-1),
        body:"Обычный markdown: **жирный**, *курсив*, `код`, ==выделение==.\n\n## Что умеет раздел\n\n- Папки любой вложенности, перетаскиванием\n- Теги прямо в тексте: #заметки #справка\n- Ссылки на другие заметки: [[Черновик недели]]\n- Списки дел, которые отмечаются в просмотре:\n\n- [x] создать первую заметку\n- [ ] завести свою структуру папок\n\n## Объекты из других разделов\n\nСтрока вида ![[тип:Название]] превращается в живую карточку — кнопка на панели подставит имя сама:\n\n![[сфера:Здоровье]]\n\n> Ветку целиком можно скачать архивом — получится обычная папка с .md-файлами." },
      { id:"nt-week", title:"Черновик недели", folderId:"nf-ideas", pinned:false, createdAt: addDaysStr(-3), updatedAt: addDaysStr(-3),
        body:"Мысли, которые ещё не оформились. #идеи\n\n- посмотреть, что съедает вечера\n- вынести повторяющиеся дела в кампанию" },
    ],
    // Какие боевые отчёты уже открыты — уведомление на Хабе приходит один раз (см. reports/model.js).
    reportsSeen: [],
    libraryCollections: [],
    readingLog: [
      { id:uid(), bookId:"b1", date:addDaysStr(-3), pages:20 },
      { id:uid(), bookId:"b1", date:addDaysStr(-2), pages:25 },
      { id:uid(), bookId:"b1", date:addDaysStr(-1), pages:15 },
      { id:uid(), bookId:"b1", date:addDaysStr(0),  pages:10 },
    ],
    uiPrefs: { peopleCardFields: defaultPeopleCardFields(), library: defaultLibraryPrefs(), quests: defaultQuestsPrefs(), peopleDetail: defaultPeopleDetailPrefs(), apiKeys: defaultApiKeys(), customEmojis: [], emojiPools: defaultEmojiPools(), emojiAssignments: defaultEmojiAssignments(), librarySources: defaultLibrarySources(), tabs: { order: TABS.map(t=>t.id), hidden: [] }, calendar: defaultCalendarPrefs(), notes: defaultNotesPrefs(), misc: defaultMiscPrefs() },
    categories: {
      expense: [
        { name:"Еда",         color:"emerald" },
        { name:"Транспорт",   color:"sky" },
        { name:"Жильё",       color:"indigo" },
        { name:"Развлечения", color:"violet" },
        { name:"Подписки",    color:"fuchsia" },
        { name:"Здоровье",    color:"rose" },
        { name:"Одежда",      color:"orange" },
        { name:"Люди",        color:"cyan" },
        { name:"Другое",      color:"zinc" },
      ],
      income: [
        { name:"Зарплата",    color:"amber" },
        { name:"Фриланс",     color:"cyan" },
        { name:"Подарки",     color:"rose" },
        { name:"Инвестиции",  color:"emerald" },
        { name:"Люди",        color:"cyan" },
        { name:"Другое",      color:"zinc" },
      ],
    },
  };
}

function defaultAchievements() {
  return [
    { id:uid(), title:"Опытный искатель",     desc:"Достигни 5 уровня персонажа",     icon:"Trophy",    kind:"level",       target:5,    sphereId:null, unlockedAt:null },
    { id:uid(), title:"Мастер жизни",          desc:"Достигни 10 уровня персонажа",    icon:"Award",     kind:"level",       target:10,   sphereId:null, unlockedAt:null },
    { id:uid(), title:"Охотник за квестами",   desc:"Заверши 10 квестов",              icon:"Target",    kind:"quests",      target:10,   sphereId:null, unlockedAt:null },
    { id:uid(), title:"Неделя дисциплины",     desc:"Держи серию 7 дней подряд",       icon:"Sparkles",  kind:"streak",      target:7,    sphereId:null, unlockedAt:null },
    { id:uid(), title:"Копилка",               desc:"Накопи 500 золота",               icon:"Coins",     kind:"currency",    target:500,  sphereId:null, unlockedAt:null },
    { id:uid(), title:"Первые сбережения",     desc:"Отложи 20 000 ₽ в сбережения",    icon:"PiggyBank", kind:"savings",     target:20000, sphereId:null, unlockedAt:null },
    { id:uid(), title:"Гармония",              desc:"Все сферы достигли 3 уровня",     icon:"Compass",   kind:"allSpheres",  target:3,    sphereId:null, unlockedAt:null },
  ];
}

// Состояние для честного сброса ("Сбросить все данные"): структурные примеры (сферы, привычки,
// награды, категории, бюджеты, достижения) остаются, чтобы новый пользователь видел, как ими
// пользоваться, но весь НАКОПЛЕННЫЙ прогресс — опыт, стрики, покупки, золото, квесты, история
// операций — обнулён. defaultState() с его богатыми тестовыми данными используется только при
// самом первом запуске (когда в хранилище вообще ничего нет), но не при ручном сбросе.
export function cleanState() {
  const seed = defaultState();
  return {
    profile: { name: seed.profile.name, currency: 0, avatarIcon: seed.profile.avatarIcon, avatarImage: null },
    spheres: seed.spheres.map(s => ({ ...s, xp: 0 })),
    quests: [],
    campaigns: [],
    // Справочник упражнений при сбросе возвращается к базовому — это структурное умолчание вроде
    // категорий и сфер, а не личные данные. Журнал, шаблоны и замеры чистятся полностью.
    exercises: seed.exercises.map(e => ({ ...e })),
    workouts: [],
    workoutLog: [],
    bodyLog: [],
    trainingPlans: [],
    sportGoal: defaultSportGoal(),
    habits: seed.habits.map(h => ({ id: h.id, title: h.title, sphereId: h.sphereId, personId: h.personId || null, personName: h.personName || null, logs: [], claimedDates: [] })),
    accounts: defaultAccounts(),
    transactions: [],
    // План бюджета — структурный пример, как категории: при сбросе остаётся, но «с самого начала»,
    // без истории изменений из демо.
    budgetHistory: [{ from: BUDGET_SINCE_START, limits: { ...seed.budgetHistory[seed.budgetHistory.length - 1].limits } }],
    rewards: seed.rewards.map(r => ({ ...r, purchases: [] })),
    achievements: defaultAchievements(),
    // Люди при "Сбросить всё" очищаются полностью (не как структурные примеры у привычек/наград):
    // демо-карточки с вымышленными именами уместны только при самом первом запуске (defaultState),
    // а не как постоянный "образец" после сознательного ручного сброса.
    people: [],
    peopleRelations: seed.peopleRelations,
    holidaySubscriptions: {},
    // Библиотека — тот же принцип, что у людей: полностью очищается при ручном сбросе, демо-книги/
    // игры/фильмы уместны только при самом первом запуске.
    books: [],
    games: [],
    movies: [],
    // Питание — та же логика: полностью очищается при ручном сбросе (в т.ч. цель — обратно к
    // "без цели").
    foods: [],
    dishes: [],
    inventory: [],
    nutritionLog: [],
    nutritionGoal: defaultNutritionGoal(),
    libraryCollections: [],
    readingLog: [],
    reportsSeen: [],
    // Заметки — личные данные: при осознанном сбросе очищаются полностью, как люди и библиотека.
    notes: [],
    noteFolders: [],
    uiPrefs: { peopleCardFields: defaultPeopleCardFields(), library: defaultLibraryPrefs(), quests: defaultQuestsPrefs(), peopleDetail: defaultPeopleDetailPrefs(), apiKeys: defaultApiKeys(), customEmojis: [], emojiPools: defaultEmojiPools(), emojiAssignments: defaultEmojiAssignments(), librarySources: defaultLibrarySources(), tabs: { order: TABS.map(t=>t.id), hidden: [] }, calendar: defaultCalendarPrefs(), notes: defaultNotesPrefs(), misc: defaultMiscPrefs() },
    categories: seed.categories,
  };
}
