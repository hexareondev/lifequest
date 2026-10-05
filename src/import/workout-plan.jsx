import { WEEKDAY_LABELS } from "../core/week.js";
import { daysBetween, todayStr, uid } from "../core/basics.js";
import { CAMPAIGN_MAX_TITLE } from "../quests/campaigns.js";
import { isOurFileApp } from "../share/model.js";
import {
  BODY_EQUIPMENT, BODY_FOCUS, BODY_LEVELS, BODY_SEX, EXERCISE_KINDS, MUSCLE_GROUPS,
  ageFromBirthDate, bodyWeightOf, defaultBody, defaultSet, defaultSportGoal, isSportGoalSet,
  weekStartOf,
} from "../sport/model.js";
import { CAMPAIGN_IMPORT_MAX_CHARS, isDateStr, resolvePlanDate, stripCodeFences } from "./plan-dates.js";

/* ============ ИМПОРТ ПЛАНА ТРЕНИРОВОК (файл от ИИ) ============ */
// Тот же конверт и та же терпимость к ответам моделей, что у планов кампаний (см. ниже), плюс
// одна забота, которой там не было: СОПОСТАВЛЕНИЕ УПРАЖНЕНИЙ со справочником. Без него после трёх
// импортов в справочнике будут «Жим лёжа», «жим лежа» и «Жим штанги лёжа» как три разных
// упражнения, и вся статистика по рабочим весам развалится.

const WORKOUT_PLAN_FILE_VERSION = 1;
const PLAN_MAX_SESSIONS = 200;
const PLAN_MAX_WEEKS = 52;
const PLAN_MAX_EXERCISES = 20;
export const PLAN_MAX_SETS = 12;

// Ключ сравнения названий: регистр, лишние пробелы и ё/е не должны плодить дубликаты.
function exerciseNameKey(name) {
  return String(name||"").toLowerCase().replace(/ё/g,"е").replace(/[^a-zа-я0-9]+/gi," ").trim();
}
function findExerciseByName(exercises, name, aliases) {
  const keys = [name, ...(Array.isArray(aliases) ? aliases : [])].map(exerciseNameKey).filter(Boolean);
  return (exercises||[]).find(ex => {
    const own = [ex.name, ...(ex.aliases||[])].map(exerciseNameKey);
    return own.some(k => keys.includes(k));
  }) || null;
}

export function parseWorkoutPlanPayload(text, ctx) {
  const exercises = (ctx && ctx.exercises) || [];
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
  if (data.kind === "campaign") return { ok:false, error:"Это план кампании. Его загружают на вкладке «Квесты» → «Кампании»." };
  if (data.kind === "share") return { ok:false, error:"Это файл обмена записями, а не план тренировок." };
  if (!isOurFileApp(data.app)) return { ok:false, error:"Не похоже на файл QuestLife." };
  if ((data.version||1) > WORKOUT_PLAN_FILE_VERSION) return { ok:false, error:"Файл создан более новой версией приложения." };

  const p = (data.plan && typeof data.plan === "object") ? data.plan : data;
  const title = String(p.title||"").trim();
  if (!title) return { ok:false, error:"У плана нет названия (поле title)." };

  // Недели: либо weeks, либо плоский список sessions — второй превращается в одну неделю.
  let rawWeeks;
  if (Array.isArray(p.weeks) && p.weeks.length) rawWeeks = p.weeks;
  else if (Array.isArray(p.sessions) && p.sessions.length) rawWeeks = [{ week:1, sessions:p.sessions }];
  else return { ok:false, error:"В файле нет ни одной тренировки." };
  if (rawWeeks.length > PLAN_MAX_WEEKS) return { ok:false, error:`Слишком много недель (${rawWeeks.length}), максимум ${PLAN_MAX_WEEKS}.` };

  function cut(str, label) {
    const v = String(str||"").trim();
    if (v.length > CAMPAIGN_MAX_TITLE) { warnings.push(`${label} длиннее ${CAMPAIGN_MAX_TITLE} символов — обрезано.`); return v.slice(0, CAMPAIGN_MAX_TITLE); }
    return v;
  }

  const declaredStart = isDateStr(p.startDate) ? p.startDate : today;
  if (p.startDate && !isDateStr(p.startDate)) warnings.push(`Дата старта «${p.startDate}» не распознана — взят сегодняшний день.`);
  const skipWeekends = p.skipWeekends === true;

  const weeks = [];
  const newNames = new Map();   // ключ → название, чтобы одинаковые новые упражнения создались один раз
  let sessionCount = 0;
  const explicitDates = [];

  for (const wk of rawWeeks) {
    const weekNo = Math.max(1, Math.round(Number(wk && wk.week) || (weeks.length + 1)));
    const rawSessions = Array.isArray(wk && wk.sessions) ? wk.sessions : [];
    if (!rawSessions.length) { warnings.push(`Неделя ${weekNo} пустая — пропущена.`); continue; }
    const week = { id: uid(), week: weekNo, sessions: [] };
    for (const sn of rawSessions) {
      sessionCount++;
      if (sessionCount > PLAN_MAX_SESSIONS) return { ok:false, error:`Слишком много тренировок (больше ${PLAN_MAX_SESSIONS}).` };
      if (!sn || typeof sn !== "object") return { ok:false, error:"Среди тренировок есть не-объект — файл повреждён." };
      const sTitle = cut(sn.title, "Название тренировки");
      if (!sTitle) return { ok:false, error:"У одной из тренировок нет названия (поле title)." };
      let rawExercises = Array.isArray(sn.exercises) ? sn.exercises : [];
      if (!rawExercises.length) return { ok:false, error:`В тренировке «${sTitle}» нет упражнений.` };
      if (rawExercises.length > PLAN_MAX_EXERCISES) {
        warnings.push(`В тренировке «${sTitle}» больше ${PLAN_MAX_EXERCISES} упражнений — лишние отброшены.`);
        rawExercises = rawExercises.slice(0, PLAN_MAX_EXERCISES);
      }
      // Дата: либо явная, либо номер дня недели плана.
      let dateSpec = null;
      if (sn.date != null && sn.date !== "") {
        if (!isDateStr(sn.date)) return { ok:false, error:`У тренировки «${sTitle}» неверная дата «${sn.date}». Формат — ГГГГ-ММ-ДД.` };
        dateSpec = { kind:"date", value:sn.date };
        explicitDates.push(sn.date);
      } else {
        const day = Math.round(Number(sn.day));
        if (!isFinite(day) || day < 1 || day > 7) return { ok:false, error:`У тренировки «${sTitle}» неверный день «${sn.day}» — нужно число от 1 (понедельник) до 7.` };
        dateSpec = { kind:"day", value:day };
      }
      const items = rawExercises.map(ex => {
        const name = cut(ex && ex.name, "Название упражнения");
        if (!name) return null;
        const found = findExerciseByName(exercises, name, ex.alias || ex.aliases);
        let sets = Math.round(Number(ex.sets)||1);
        if (!isFinite(sets) || sets < 1) sets = 1;
        if (sets > PLAN_MAX_SETS) { warnings.push(`У «${name}» больше ${PLAN_MAX_SETS} подходов — обрезано.`); sets = PLAN_MAX_SETS; }
        const time = ex.time != null ? Math.round(Number(ex.time)||0) : null;      // секунды
        const km = ex.distance != null ? Number(ex.distance)||0 : null;
        const isCardio = (time != null && !ex.reps) || km != null;
        if (!found) newNames.set(exerciseNameKey(name), { name, kind: isCardio ? "cardio" : "strength" });
        return {
          id: uid(), name,
          exerciseId: found ? found.id : null,
          isNew: !found,
          kind: found ? found.kind : (isCardio ? "cardio" : "strength"),
          sets,
          reps: ex.reps != null ? Math.round(Number(ex.reps)||0) : null,
          weight: ex.weight != null ? Number(ex.weight)||0 : null,
          minutes: time != null ? Math.round(time/60*10)/10 : null,
          km,
        };
      }).filter(Boolean);
      if (!items.length) return { ok:false, error:`В тренировке «${sTitle}» нет ни одного корректного упражнения.` };
      week.sessions.push({
        id: uid(), include: true, title: sTitle,
        notes: cut(sn.notes, "Заметка"),
        minutes: sn.minutes != null ? Math.round(Number(sn.minutes)||0) : null,
        dateSpec, weekNo, items,
      });
    }
    if (week.sessions.length) weeks.push(week);
  }
  if (!weeks.length) return { ok:false, error:"В файле нет ни одной тренировки." };

  // Смещения в единицах плана — как у кампаний: одна ручка «дата старта» двигает весь план,
  // сохраняя относительные интервалы.
  const planStart = explicitDates.length ? [declaredStart, ...explicitDates].sort()[0] : weekStartOf(declaredStart);
  weeks.forEach(wk => wk.sessions.forEach(sn => {
    if (sn.dateSpec.kind === "date") sn.unitOffset = daysBetween(planStart, sn.dateSpec.value);
    else sn.unitOffset = (sn.weekNo - 1) * 7 + (sn.dateSpec.value - 1);
    delete sn.dateSpec;
  }));
  if (planStart < today) warnings.push("План начинается в прошлом — при желании сдвиньте дату старта ниже.");
  if (newNames.size) warnings.push(`Новых упражнений: ${newNames.size} — они будут добавлены в справочник при загрузке.`);

  return {
    ok: true, warnings,
    draft: {
      title: cut(title, "Название плана"),
      description: cut(p.description, "Описание плана"),
      startDate: planStart, skipWeekends,
      sessionsPerWeek: p.sessionsPerWeek != null ? Math.round(Number(p.sessionsPerWeek)||0) : null,
      minutesPerWeek: p.minutesPerWeek != null ? Math.round(Number(p.minutesPerWeek)||0) : null,
      weeks,
    },
  };
}

export function workoutPlanDraftSummary(draft) {
  const sessions = draft.weeks.flatMap(w => w.sessions.filter(s => s.include));
  const dates = sessions.map(s => resolvePlanDate(draft.startDate, s.unitOffset, draft.skipWeekends)).filter(Boolean).sort();
  const newOnes = new Set();
  sessions.forEach(s => s.items.forEach(it => { if (it.isNew) newOnes.add(exerciseNameKey(it.name)); }));
  return {
    count: sessions.length,
    excluded: draft.weeks.reduce((a,w) => a + w.sessions.filter(s => !s.include).length, 0),
    weeks: draft.weeks.length,
    exercises: sessions.reduce((a,s) => a + s.items.length, 0),
    newExercises: newOnes.size,
    from: dates[0] || null, to: dates[dates.length-1] || null,
  };
}

// Материализация: план + сессии журнала + недостающие упражнения справочника. Ровно как у
// кампаний, всё создаётся ДО commit, чтобы id не менялись при повторном прогоне updater-а.
export function buildWorkoutPlanImport(draft) {
  const planId = uid();
  const plan = {
    id: planId, title: draft.title, description: draft.description,
    status: "active", startDate: draft.startDate, weeks: draft.weeks.length,
    claimedFinal: false, completedAt: null, reward: { grantedXp:null, grantedGold:null },
    source: "import", importedAt: todayStr(), createdAt: todayStr(),
  };
  const newExercises = [];
  const newByKey = new Map();
  const sessions = [];
  draft.weeks.forEach(wk => wk.sessions.forEach(sn => {
    if (!sn.include) return;
    const date = resolvePlanDate(draft.startDate, sn.unitOffset, draft.skipWeekends);
    const entries = sn.items.map(it => {
      let exerciseId = it.exerciseId;
      if (!exerciseId) {
        const key = exerciseNameKey(it.name);
        let created = newByKey.get(key);
        if (!created) {
          created = {
            id: uid(), name: it.name, kind: it.kind, muscles: [],
            defaultLoad: it.kind==="strength"
              ? { sets: it.sets, reps: it.reps || 10, weight: it.weight }
              : { sets: it.sets, minutes: it.minutes, km: it.km },
            notes: "", archived: false, createdAt: todayStr(),
          };
          newByKey.set(key, created);
          newExercises.push(created);
        }
        exerciseId = created.id;
      }
      return {
        id: uid(), exerciseId, name: it.name,
        sets: Array.from({ length: Math.max(1, it.sets) }, () => ({
          ...defaultSet(it.kind),
          reps: it.kind==="strength" ? (it.reps != null ? it.reps : 10) : null,
          weight: it.weight != null ? it.weight : null,
          minutes: it.kind==="strength" ? null : (it.minutes != null ? it.minutes : 10),
          km: it.km != null ? it.km : null,
        })),
      };
    });
    sessions.push({
      id: uid(), date, workoutId: null, planId, sessionId: uid(),
      title: sn.title, status: "planned", minutes: sn.minutes || null, rpe: null, notes: sn.notes || "", entries,
    });
  }));
  sessions.sort((a,b) => a.date.localeCompare(b.date));
  return { plan, sessions, newExercises };
}

// Инструкция для ИИ — персональная, как у кампаний: подставляются реальные упражнения этого
// справочника, физический профиль и цель. Без этого модель придумывает свои названия («жим штанги
// лёжа на горизонтальной скамье»), и половина плана приезжает новыми упражнениями-дубликатами.
export function buildAiWorkoutGuide(state) {
  const body = state.profile.body || defaultBody();
  const goal = state.sportGoal || defaultSportGoal();
  const age = ageFromBirthDate(body.birthDate);
  const weight = bodyWeightOf(state);
  const list = (state.exercises||[]).filter(e => !e.archived);
  const exercisesTable = list.length
    ? list.map(e => `| ${e.name} | ${EXERCISE_KINDS[e.kind].label} | ${(e.muscles||[]).map(m => MUSCLE_GROUPS[m]).filter(Boolean).join(", ") || "—"} |`).join("\n")
    : "| — | — | справочник пуст, называй упражнения обычными русскими названиями |";
  const profileLines = [
    body.sex ? `- Пол: ${BODY_SEX[body.sex]}` : null,
    age != null ? `- Возраст: ${age}` : null,
    body.height ? `- Рост: ${body.height} см` : null,
    weight != null ? `- Вес: ${weight} кг` : null,
    `- Уровень подготовки: ${BODY_LEVELS[body.level] || "не указан"}`,
    `- Цель: ${BODY_FOCUS[body.focus] || "общее здоровье"}`,
    (body.equipment||[]).length ? `- Доступно: ${body.equipment.map(k => BODY_EQUIPMENT[k]).filter(Boolean).join(", ")}` : "- Доступно: только вес тела",
    (body.trainingDays||[]).length ? `- Удобные дни: ${body.trainingDays.map(d => WEEKDAY_LABELS[d-1]).join(", ")}` : null,
    body.limitations ? `- Ограничения: ${body.limitations}` : null,
    isSportGoalSet(goal) ? `- Норма: ${goal.sessionsPerWeek} тренировок и ${goal.minutesPerWeek} минут в неделю` : null,
  ].filter(Boolean).join("\n");

  return `# Как составить план тренировок для QuestLife

Ты составляешь тренировочный план, который человек загрузит в приложение одним файлом.
Приложение разложит его по дням и превратит в тренировки, где отмечаются подходы.

**Отдай ответ ОДНИМ JSON-объектом и ничем больше:** без пояснений до и после, без \`\`\`-обёртки,
без комментариев внутри JSON и без висячих запятых. Любой текст вокруг ломает загрузку.

## Про кого план

${profileLines}

## Структура

\`\`\`json
{
  "app": "questlife",
  "kind": "workout-plan",
  "version": 1,
  "plan": {
    "title": "Силовой блок, 6 недель",
    "description": "Три тренировки в неделю, фокус на базовых движениях",
    "startDate": "${todayStr()}",
    "sessionsPerWeek": 3,
    "minutesPerWeek": 180,
    "weeks": [
      {
        "week": 1,
        "sessions": [
          {
            "title": "День A. Ноги и спина",
            "day": 1,
            "minutes": 60,
            "exercises": [
              { "name": "Приседания со штангой", "sets": 4, "reps": 6, "weight": 60, "rest": 150 },
              { "name": "Тяга в наклоне", "sets": 3, "reps": 10, "weight": 40 },
              { "name": "Планка", "sets": 3, "time": 45 }
            ]
          }
        ]
      }
    ]
  }
}
\`\`\`

Если план на одну неделю — можно положить \`sessions\` прямо в \`plan\`, без \`weeks\`.

## Поля тренировки

| Поле | Обязательно | Что это |
|---|---|---|
| \`title\` | да | Название тренировки |
| \`day\` | да | День недели: 1 — понедельник, 7 — воскресенье |
| \`date\` | нет | Точная дата ГГГГ-ММ-ДД вместо \`day\` |
| \`minutes\` | нет | Ожидаемая длительность |
| \`notes\` | нет | Короткая заметка |
| \`exercises\` | да | Список упражнений, не пустой |

## Поля упражнения

| Поле | Что это |
|---|---|
| \`name\` | Название. **Бери из таблицы ниже, если упражнение там есть** |
| \`sets\` | Число подходов (до ${PLAN_MAX_SETS}) |
| \`reps\` | Повторов в подходе — для силовых |
| \`weight\` | Рабочий вес в кг |
| \`time\` | Длительность подхода в СЕКУНДАХ — для планки, кардио, растяжки |
| \`distance\` | Дистанция в км — для бега и велосипеда |
| \`rest\` | Отдых между подходами в секундах |
| \`alias\` | Массив синонимов, если упражнения нет в таблице |

## Упражнения этого пользователя

| Название | Вид | Мышцы |
|---|---|---|
${exercisesTable}

**Используй названия ровно как в таблице.** Если нужного упражнения там нет — назови его обычным
русским названием и добавь \`alias\` со списком синонимов: тогда следующий импорт узнает его и не
создаст дубликат.

## Как строить план

1. Учитывай уровень, доступный инвентарь и ограничения из блока «Про кого план» — упражнение,
   которое нечем и негде делать, бесполезно.
2. Одна тренировка — 4–7 упражнений, разминка и заминка отдельными строками не нужны.
3. Не ставь больше одной тренировки в день.
4. Прогрессия по неделям: наращивай вес или повторы постепенно, а не скачком.
5. Между тяжёлыми тренировками на одну группу мышц оставляй день отдыха.
6. Награда в приложении считается по самой длинной серии подряд выполненных тренировок, поэтому
   лучше реалистичные три занятия в неделю, чем недостижимые шесть.

## Частые ошибки

- Комментарии \`//\` и висячие запятые внутри JSON — файл не прочитается.
- \`day\` больше 7 — это день недели, а не номер дня плана; для следующей недели увеличивай \`week\`.
- \`time\` в минутах вместо секунд — планка на «45» означает 45 секунд.
- Выдуманные варианты названий вместо тех, что уже есть в таблице.
`;
}
