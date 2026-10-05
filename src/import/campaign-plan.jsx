import { addDaysToDateStr, clamp, daysBetween, todayStr, uid } from "../core/basics.js";
import { DIFFICULTY, PRIORITY } from "../core/rules.js";
import {
  CAMPAIGN_DEFAULT_PERCENT, CAMPAIGN_MAX_QUESTS, CAMPAIGN_MAX_STAGES, CAMPAIGN_MAX_SUBTASKS,
  CAMPAIGN_MAX_TITLE, campaignQuestsOf, defaultCampaignReward,
} from "../quests/campaigns.js";
import { questMainSphereId } from "../quests/links.js";
import { QUEST_MAX_SPAN_DAYS, normalizeQuestDates, questSpanTotal, questStartOf } from "../quests/spans.js";
import { SHARE_FILE_APP, isOurFileApp } from "../share/model.js";
import { PALETTE_KEYS } from "../ui/theme.js";
import {
  CAMPAIGN_FILE_VERSION, CAMPAIGN_IMPORT_MAX_CHARS, isDateStr, resolvePlanDate, stripCodeFences,
} from "./plan-dates.js";

/* ================== ИМПОРТ ПЛАНА КАМПАНИИ (файл от ИИ) ================== */
// Отдельная от «Обмена частями сохранения» система с тем же конвертом (app/kind/version), поэтому
// оба парсера умеют вежливо отсылать друг к другу, если файл перепутали.
//
// Разбор намеренно ТЕРПИМЫЙ к тому, как ведут себя языковые модели: снимается обёртка ```json,
// принимается и { campaign: {...} }, и плоский объект, и план без этапов (campaign.quests),
// незнакомые поля игнорируются молча. Чинить синтаксис JSON (комментарии, висячие запятые) при
// этом НЕ пытаемся — вместо самодеятельности даём понятную ошибку с советом, что попросить у ИИ.
//

// Разбор файла в ДРАФТ, готовый к правке на экране предпросмотра.
// Возвращает { ok, error, warnings, draft } — тексты уже готовы к показу человеку.
export function parseCampaignPayload(text, ctx) {
  const spheres = (ctx && ctx.spheres) || [];
  const people = (ctx && ctx.people) || [];
  const today = (ctx && ctx.today) || todayStr();
  const warnings = [];
  const raw = stripCodeFences(text);
  if (!raw) return { ok:false, error:"Пусто — вставьте содержимое файла или выберите файл." };
  if (raw.length > CAMPAIGN_IMPORT_MAX_CHARS) return { ok:false, error:"Файл слишком большой." };

  let data;
  try { data = JSON.parse(raw); }
  catch (e) {
    return { ok:false, error:"Файл не читается: это не JSON. Часто мешают комментарии, висячие запятые или пояснения вокруг — попросите ИИ прислать чистый JSON одним блоком." };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok:false, error:"Файл пустой или повреждён." };
  // Частая путаница: сюда принесли файл из «Поделиться» (Библиотека/Люди/Продукты) или полный бэкап.
  if (data.kind === "share") return { ok:false, error:"Это файл обмена записями. Его загружают кнопкой «Загрузить» в соответствующем разделе." };
  if (data.spheres && data.quests && !data.campaign) return { ok:false, error:"Это полная выгрузка QuestLife. Её можно загрузить в Настройки → Данные." };
  if (!isOurFileApp(data.app)) return { ok:false, error:"Не похоже на файл QuestLife." };
  if ((data.version||1) > CAMPAIGN_FILE_VERSION) return { ok:false, error:"Файл создан более новой версией приложения." };

  const c = (data.campaign && typeof data.campaign === "object") ? data.campaign : data;
  const title = String(c.title || "").trim();
  if (!title) return { ok:false, error:"У кампании нет названия (поле title)." };

  // Этапы: либо stages, либо плоский campaign.quests — второе превращается в единственный
  // безымянный этап, чтобы дальше по коду был ровно один случай.
  let rawStages;
  if (Array.isArray(c.stages) && c.stages.length) rawStages = c.stages;
  else if (Array.isArray(c.quests) && c.quests.length) rawStages = [{ title:"", quests:c.quests }];
  else return { ok:false, error:"В файле нет ни одного квеста." };
  if (rawStages.length > CAMPAIGN_MAX_STAGES) return { ok:false, error:`Слишком много этапов (${rawStages.length}), максимум ${CAMPAIGN_MAX_STAGES}.` };
  if (rawStages.some(st => st && st.reward)) warnings.push("У этапов в файле указана награда — она игнорируется: награда есть только у квестов и у кампании целиком.");

  function cut(str, label) {
    const v = String(str||"").trim();
    if (v.length > CAMPAIGN_MAX_TITLE) { warnings.push(`${label} длиннее ${CAMPAIGN_MAX_TITLE} символов — обрезано.`); return v.slice(0, CAMPAIGN_MAX_TITLE); }
    return v;
  }
  function resolveSphere(value, fallback) {
    if (value == null || value === "") return fallback;
    const v = String(value).trim().toLowerCase();
    const byId = spheres.find(sp => String(sp.id).toLowerCase() === v);
    if (byId) return byId.id;
    const byName = spheres.find(sp => String(sp.name).toLowerCase() === v);
    if (byName) return byName.id;
    warnings.push(`Сфера «${value}» не найдена — подставлена «${(spheres.find(sp=>sp.id===fallback)||{}).name || "по умолчанию"}».`);
    return fallback;
  }

  const campaignSphereId = resolveSphere(c.sphere ?? c.sphereId, (spheres[0]||{}).id || null);
  let personId = null, personName = null;
  if (c.person) {
    const v = String(c.person).trim().toLowerCase();
    const found = people.find(p => String(p.name).trim().toLowerCase() === v);
    if (found) { personId = found.id; personName = found.name; }
    else warnings.push(`Человек «${c.person}» не найден — кампания импортируется без привязки.`);
  }
  const color = PALETTE_KEYS.includes(String(c.color||"")) ? String(c.color) : null;
  const skipWeekends = c.skipWeekends === true;

  // --- Квесты: сначала собираем «сырьё» с датами в исходном виде ---
  const collected = [];
  let questCount = 0;
  for (const st of rawStages) {
    const stQuests = Array.isArray(st && st.quests) ? st.quests : [];
    if (!stQuests.length) { warnings.push(`Этап «${(st&&st.title)||"без названия"}» пустой — пропущен.`); continue; }
    const stage = { id:uid(), title: cut(st.title, "Название этапа"), description: cut(st.description, "Описание этапа"), quests:[] };
    for (const q of stQuests) {
      questCount++;
      if (questCount > CAMPAIGN_MAX_QUESTS) return { ok:false, error:`Слишком много квестов (больше ${CAMPAIGN_MAX_QUESTS}).` };
      if (!q || typeof q !== "object") return { ok:false, error:"Среди квестов есть не-объект — файл повреждён." };
      const qTitle = cut(q.title, "Название квеста");
      if (!qTitle) return { ok:false, error:"У одного из квестов нет названия (поле title)." };
      let duration = q.duration == null ? 1 : Math.round(Number(q.duration));
      if (!isFinite(duration)) duration = 1;
      if (duration < 1 || duration > QUEST_MAX_SPAN_DAYS) return { ok:false, error:`У квеста «${qTitle}» неверная длительность (${q.duration}); допустимо от 1 до ${QUEST_MAX_SPAN_DAYS} дней.` };
      const difficulty = DIFFICULTY[q.difficulty] ? q.difficulty : (q.difficulty ? (warnings.push(`Сложность «${q.difficulty}» у квеста «${qTitle}» неизвестна — поставлена «Средний».`), "medium") : "medium");
      const priority = PRIORITY[q.priority] ? q.priority : (q.priority ? (warnings.push(`Приоритет «${q.priority}» у квеста «${qTitle}» неизвестен — поставлен «Средний».`), "medium") : "medium");
      let subs = Array.isArray(q.subtasks) ? q.subtasks : [];
      if (subs.length > CAMPAIGN_MAX_SUBTASKS) { warnings.push(`У квеста «${qTitle}» больше ${CAMPAIGN_MAX_SUBTASKS} подзадач — лишние отброшены.`); subs = subs.slice(0, CAMPAIGN_MAX_SUBTASKS); }
      const subtasks = subs.map(x => ({ id:uid(), text: cut(typeof x === "string" ? x : (x && x.text), "Подзадача"), done:false })).filter(x => x.text);
      const rw = q.reward && typeof q.reward === "object" ? q.reward : null;
      const manualReward = !!(rw && (rw.xp != null || rw.gold != null));
      let dateSpec = null;
      if (q.date != null && q.date !== "") {
        if (!isDateStr(q.date)) return { ok:false, error:`У квеста «${qTitle}» неверная дата «${q.date}». Формат — ГГГГ-ММ-ДД.` };
        dateSpec = { kind:"date", value:q.date };
      } else if (q.day != null && q.day !== "") {
        const day = Math.round(Number(q.day));
        if (!isFinite(day) || day < 1) return { ok:false, error:`У квеста «${qTitle}» неверный номер дня «${q.day}» — нужно целое число от 1.` };
        dateSpec = { kind:"day", value:day };
      }
      stage.quests.push({
        id: uid(), include: true,
        title: qTitle, description: cut(q.description, "Описание квеста"),
        sphereId: resolveSphere(q.sphere ?? q.sphereId, campaignSphereId),
        difficulty, priority, duration, dateSpec,
        manualReward,
        rewardXp: manualReward ? Math.max(0, Math.round(Number(rw.xp)||0)) : DIFFICULTY[difficulty].xp,
        rewardGold: manualReward ? Math.max(0, Math.round(Number(rw.gold)||0)) : DIFFICULTY[difficulty].gold,
        subtasks,
      });
    }
    if (stage.quests.length) collected.push(stage);
  }
  if (!collected.length) return { ok:false, error:"В файле нет ни одного квеста." };

  // --- Дата старта плана и пересчёт всех дат в смещения ---
  const declaredStart = isDateStr(c.startDate) ? c.startDate : today;
  if (c.startDate && !isDateStr(c.startDate)) warnings.push(`Дата старта «${c.startDate}» не распознана — взят сегодняшний день.`);
  const explicitDates = [];
  collected.forEach(st => st.quests.forEach(q => { if (q.dateSpec && q.dateSpec.kind==="date") explicitDates.push(q.dateSpec.value); }));
  // План не может начинаться позже собственного первого квеста — иначе смещения ушли бы в минус.
  const planStart = explicitDates.length ? [declaredStart, ...explicitDates].sort()[0] : declaredStart;
  let hasExplicit = false, hasUndated = false;
  collected.forEach(st => st.quests.forEach(q => {
    if (!q.dateSpec) { q.unitOffset = null; hasUndated = true; }
    else if (q.dateSpec.kind === "day") q.unitOffset = q.dateSpec.value - 1;
    else { q.unitOffset = daysBetween(planStart, q.dateSpec.value); hasExplicit = true; }
    delete q.dateSpec;
  }));
  if (hasUndated) warnings.push("У части квестов нет ни day, ни date — они добавятся без срока (колонка «Без даты» в Канбане).");
  if (hasExplicit && skipWeekends) warnings.push("В файле есть квесты с явными датами и включён пропуск выходных — такие даты тоже пересчитываются, чтобы план двигался целиком.");
  if (planStart < today) warnings.push("План начинается в прошлом — при желании сдвиньте дату старта ниже.");

  const percent = c.rewardPercent != null ? clamp(Math.round(Number(c.rewardPercent)||0), 0, 100) : CAMPAIGN_DEFAULT_PERCENT;
  const manualFinal = !!(c.reward && typeof c.reward === "object" && (c.reward.xp != null || c.reward.gold != null));

  return {
    ok: true, warnings,
    draft: {
      title: cut(title, "Название кампании"),
      description: cut(c.description, "Описание кампании"),
      sphereId: campaignSphereId, personId, personName, color,
      startDate: planStart, skipWeekends,
      rewardMode: manualFinal ? "manual" : "auto",
      rewardPercent: percent,
      rewardXp: manualFinal ? Math.max(0, Math.round(Number(c.reward.xp)||0)) : 0,
      rewardGold: manualFinal ? Math.max(0, Math.round(Number(c.reward.gold)||0)) : 0,
      stages: collected,
    },
  };
}

// Итог по драфту — считается на лету при каждой правке на экране предпросмотра.
export function campaignDraftSummary(draft) {
  const quests = draft.stages.flatMap(st => st.quests.filter(q => q.include));
  const dates = quests.map(q => resolvePlanDate(draft.startDate, q.unitOffset, draft.skipWeekends)).filter(Boolean);
  const ends = quests.map(q => {
    const d = resolvePlanDate(draft.startDate, q.unitOffset, draft.skipWeekends);
    return d ? addDaysToDateStr(d, Math.max(1, q.duration) - 1) : null;
  }).filter(Boolean);
  const sumXp = quests.reduce((a,q)=>a+(q.rewardXp||0), 0);
  const sumGold = quests.reduce((a,q)=>a+(q.rewardGold||0), 0);
  const finalXp = draft.rewardMode === "manual" ? draft.rewardXp : Math.round(sumXp*clamp(draft.rewardPercent,0,100)/100);
  const finalGold = draft.rewardMode === "manual" ? draft.rewardGold : Math.round(sumGold*clamp(draft.rewardPercent,0,100)/100);
  return {
    count: quests.length,
    excluded: draft.stages.reduce((a,st)=>a+st.quests.filter(q=>!q.include).length, 0),
    subtasks: quests.reduce((a,q)=>a+q.subtasks.length, 0),
    from: dates.length ? dates.sort()[0] : null,
    to: ends.length ? ends.sort()[ends.length-1] : null,
    sumXp, sumGold, finalXp, finalGold,
  };
}

// Материализация драфта: кампания + обычные квесты. Дальше это просто квесты — кампания за ними
// не следит и не пересоздаёт их (см. блок «КАМПАНИИ» выше).
export function buildCampaignImport(draft) {
  const campaignId = uid();
  const stages = draft.stages
    .filter(st => st.quests.some(q => q.include))
    .map((st, i) => ({ id: st.id, title: st.title, description: st.description, order: i }));
  const namedStageIds = new Set(stages.filter(st => st.title).map(st => st.id));
  const campaign = {
    id: campaignId,
    title: draft.title,
    description: draft.description,
    sphereId: draft.sphereId,
    personId: draft.personId || null,
    personName: draft.personName || null,
    color: draft.color || null,
    status: "active",
    createdAt: todayStr(),
    completedAt: null,
    claimedFinal: false,
    reward: {
      ...defaultCampaignReward(),
      mode: draft.rewardMode,
      percent: clamp(draft.rewardPercent, 0, 100),
      xp: draft.rewardMode === "manual" ? draft.rewardXp : null,
      gold: draft.rewardMode === "manual" ? draft.rewardGold : null,
    },
    // Безымянный служебный этап (плоский план) в кампанию не попадает — иначе в интерфейсе
    // висел бы пустой заголовок группы.
    stages: stages.filter(st => st.title),
    source: "import",
    importedAt: todayStr(),
  };
  const quests = [];
  draft.stages.forEach(st => st.quests.forEach(q => {
    if (!q.include) return;
    const start = resolvePlanDate(draft.startDate, q.unitOffset, draft.skipWeekends);
    const deadline = start ? addDaysToDateStr(start, Math.max(1, q.duration) - 1) : null;
    const dates = normalizeQuestDates(start, deadline);
    quests.push({
      id: uid(), status: "active", createdAt: todayStr(),
      title: q.title, description: q.description,
      sphereId: questMainSphereId(q), priority: q.priority, difficulty: q.difficulty,
      manualReward: !!q.manualReward, rewardXp: q.rewardXp, rewardGold: q.rewardGold,
      startDate: dates.startDate, deadline: dates.deadline,
      personId: null, personName: null,
      campaignId, stageId: namedStageIds.has(st.id) ? st.id : null,
      subtasks: q.subtasks.map(x => ({ id: uid(), text: x.text, done: false })),
    });
  }));
  return { campaign, quests };
}

// Обратная выгрузка: из живой кампании собрать файл того же формата. Прогресс (статусы, флаги
// выдачи, даты завершения) не выгружается — уезжает ПЛАН, а не чужая история его прохождения,
// ровно по тому же принципу, что и в «Обмене частями сохранения».
export function buildCampaignExport(campaign, quests, spheres) {
  const list = campaignQuestsOf(quests, campaign.id);
  const dated = list.filter(q => q.deadline).map(questStartOf).sort();
  const planStart = dated.length ? dated[0] : todayStr();
  const sphereName = (id) => (spheres.find(sp => sp.id===id) || {}).id || null;
  const questOut = (q) => {
    const out = { title:q.title };
    if (q.description) out.description = q.description;
    const start = questStartOf(q);
    if (start) out.day = daysBetween(planStart, start) + 1;
    const span = questSpanTotal(q);
    if (span > 1) out.duration = span;
    out.difficulty = q.difficulty || "medium";
    if (q.priority && q.priority !== "medium") out.priority = q.priority;
    if (questMainSphereId(q) && questMainSphereId(q) !== campaign.sphereId) out.sphere = sphereName(questMainSphereId(q));
    if (q.manualReward) out.reward = { xp:q.rewardXp||0, gold:q.rewardGold||0 };
    if ((q.subtasks||[]).length) out.subtasks = q.subtasks.map(s => s.text);
    return out;
  };
  const stages = (campaign.stages||[]).map(st => ({
    title: st.title,
    description: st.description || undefined,
    quests: list.filter(q => q.stageId===st.id).map(questOut),
  })).filter(st => st.quests.length);
  const loose = list.filter(q => !q.stageId).map(questOut);
  const payload = {
    app: SHARE_FILE_APP, kind: "campaign", version: CAMPAIGN_FILE_VERSION, exportedAt: todayStr(),
    campaign: {
      title: campaign.title,
      description: campaign.description || undefined,
      sphere: campaign.sphereId,
      color: campaign.color || undefined,
      startDate: planStart,
      rewardPercent: (campaign.reward && campaign.reward.mode)==="manual" ? undefined : (campaign.reward||{}).percent,
      reward: (campaign.reward && campaign.reward.mode)==="manual" ? { xp:campaign.reward.xp||0, gold:campaign.reward.gold||0 } : undefined,
    },
  };
  if (stages.length && loose.length) payload.campaign.stages = [...stages, { title:"Прочее", quests:loose }];
  else if (stages.length) payload.campaign.stages = stages;
  else payload.campaign.quests = loose;
  return payload;
}

// Инструкция для ИИ собирается ПЕРСОНАЛЬНО: в неё подставляются реальные сферы этого сохранения
// (id + названия) и, по желанию, имена людей. Без этого модель придумывает несуществующие
// идентификаторы, и половина плана приезжает «не в ту сферу».
export function buildAiPlanGuide(state, opts) {
  const withPeople = !!(opts && opts.includePeople);
  const spheres = (state.spheres||[]).map(sp => `| \`${sp.id}\` | ${sp.name} |`).join("\n");
  const people = (state.people||[]).filter(p => !p.archived).map(p => p.name);
  const diff = Object.entries(DIFFICULTY).map(([k,v]) => `| \`${k}\` | ${v.label} | ${v.xp} XP / ${v.gold} золота |`).join("\n");
  const prio = Object.entries(PRIORITY).map(([k,v]) => `\`${k}\` — ${v.label}`).join(", ");
  return `# Как составить план для QuestLife

Ты составляешь план работ, который человек загрузит в приложение QuestLife одним файлом.
Приложение само разложит его по дням календаря и превратит в цепочку квестов.

**Отдай ответ ОДНИМ JSON-объектом и ничем больше:** без пояснений до и после, без \`\`\`-обёртки,
без комментариев внутри JSON и без висячих запятых. Любой текст вокруг ломает импорт.

## Структура

\`\`\`json
{
  "app": "questlife",
  "kind": "campaign",
  "version": 1,
  "campaign": {
    "title": "Название кампании",
    "description": "Одно-два предложения, зачем это всё",
    "sphere": "career",
    "startDate": "${todayStr()}",
    "skipWeekends": false,
    "rewardPercent": ${CAMPAIGN_DEFAULT_PERCENT},
    "stages": [
      {
        "title": "Этап 1. Название вехи",
        "description": "Что должно быть готово к концу этапа",
        "quests": [
          {
            "title": "Название квеста",
            "description": "Уточнение, если нужно",
            "day": 1,
            "duration": 1,
            "difficulty": "medium",
            "priority": "high",
            "subtasks": ["Шаг один", "Шаг два", "Шаг три"]
          }
        ]
      }
    ]
  }
}
\`\`\`

Если план простой и вех в нём нет — вместо \`stages\` положи \`quests\` прямо в \`campaign\`.

## Поля кампании

| Поле | Обязательно | Что это |
|---|---|---|
| \`title\` | да | Название кампании |
| \`description\` | нет | Кратко о цели |
| \`sphere\` | нет | Сфера жизни, id из таблицы ниже. По умолчанию — первая |
| \`person\` | нет | Имя человека из списка ниже, если кампания связана с кем-то |
| \`color\` | нет | Цвет: amber, violet, emerald, sky, rose, cyan, indigo, orange и т.п. |
| \`startDate\` | нет | Дата первого дня, ГГГГ-ММ-ДД. По умолчанию — сегодня |
| \`skipWeekends\` | нет | \`true\` — нумерация дней идёт только по будням |
| \`rewardPercent\` | нет | Награда за завершение кампании в процентах от суммы наград её квестов (по умолчанию ${CAMPAIGN_DEFAULT_PERCENT}) |

**Награду за кампанию суммой не задавай** — она считается процентом от наград квестов, поэтому
балансируй сложность отдельных квестов, а не итог. У этапов собственной награды нет.

## Поля квеста

| Поле | Обязательно | Что это |
|---|---|---|
| \`title\` | да | Название, глаголом в инфинитиве, до 80 символов |
| \`description\` | нет | Одно предложение уточнения |
| \`day\` | нет | Номер дня плана, считая от 1. Первый день — \`1\` |
| \`date\` | нет | Точная дата ГГГГ-ММ-ДД вместо \`day\` (приоритетнее) |
| \`duration\` | нет | Сколько дней подряд занимает квест, 1…${QUEST_MAX_SPAN_DAYS}. По умолчанию 1 |
| \`difficulty\` | нет | См. таблицу ниже. По умолчанию \`medium\` |
| \`priority\` | нет | ${prio}. По умолчанию \`medium\` |
| \`sphere\` | нет | Своя сфера, если отличается от сферы кампании |
| \`reward\` | нет | \`{ "xp": 40, "gold": 15 }\` — только если нужна нестандартная награда |
| \`subtasks\` | нет | Массив строк: шаги внутри квеста |

Квест без \`day\` и без \`date\` добавится без срока — так можно оформить фоновые задачи.

## Сферы этого пользователя

| id | Название |
|---|---|
${spheres}

${withPeople ? (people.length ? `## Люди этого пользователя\n\n${people.map(n=>`- ${n}`).join("\n")}\n\nИспользуй имя ровно так, как написано выше.` : "## Люди\n\nСписок пуст — поле `person` не используй.") : "Поле `person` не используй."}

## Сложность и награда

| Значение | Название | Награда |
|---|---|---|
${diff}

Ставь сложность по реальному объёму работы. \`epic\` — редкость, для по-настоящему больших дел.

## Как раскладывать работу

1. **Один квест — один заход**: объём, который человек реально закрывает за день. Больше —
   либо разбей на несколько квестов, либо поставь \`duration\` на нужное число дней.
2. **Подзадачи — конкретные шаги внутри квеста**, 2–6 штук, каждая формулируется так, чтобы
   на неё можно было честно ответить «сделано / не сделано».
3. **Этап — веха**, после которой есть осязаемый результат. Обычно 3–7 квестов на этап.
4. **Не ставь больше одного-двух квестов на один день.** Плотный план не выполняется.
5. Названия — действием: «Собрать требования», а не «Требования».
6. Учитывай зависимости: то, что нужно раньше, ставь на меньший \`day\`.

## Частые ошибки

- Комментарии \`//\` и висячие запятые внутри JSON — файл не прочитается.
- Обёртка в \`\`\`json — снимается не всегда, лучше без неё.
- Выдуманные id сфер — бери только из таблицы выше.
- Даты вида \`07.09.${new Date().getFullYear()}\` — нужен формат ГГГГ-ММ-ДД.
- Тысяча мелких квестов на один день — план должен быть выполнимым.
`;
}
