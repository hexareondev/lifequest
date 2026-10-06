// Действия раздела «Люди»: карточки, архив, порядок, дни рождения, праздники и типы отношений.
// Устроены как действия финансов — см. finance/actions.js.

import { defaultPeopleDetailPrefs } from "../core/prefs.js";
import { todayStr, uid } from "../core/basics.js";
import { insertAt, moveInEditableList } from "../core/lists.js";
import { extractActiveBirthdayQuest } from "../habits/model.js";
import { HOLIDAYS, extractActiveHolidayQuest } from "../quests/holidays.js";
import { defaultPeopleCardFields } from "./model.js";
import { Archive, EyeOff, Trash2, Users } from "lucide-react";
import { toastIcon } from "../ui/toast-icon.js";

export function peopleActions({ setState, commit, pushToast }) {
  return {
    // id и дата всюду считаются ДО функции обновления, а не внутри: React вправе прогнать её
    // дважды, и запись получила бы два разных id (тот же принцип, что у addQuest).
    addPerson(p) {
      const id = uid(), today = todayStr();
      setState(prev => {
        const activeCount = (prev.people||[]).filter(x=>!x.archived).length;
        return { ...prev, people: [{ id, xp:0, archived:false, archivedAt:null, order:activeCount, createdAt:today, trackBirthday:false, birthdayQuestYears:[], ...p }, ...(prev.people||[])] };
      });
      pushToast("Карточка человека создана", toastIcon(Users, "text-amber-400"));
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
      const today = todayStr();
      commit((prev, defer) => {
        const target = (prev.people||[]).find(p => p.id===id);
        if (!target) return prev;
        const wasTracked = target.trackBirthday === true;
        const { quests: questsAfter, removed: removedQuest } = wasTracked
          ? extractActiveBirthdayQuest(prev.quests, id)
          : { quests: prev.quests, removed: null };
        const removedYear = removedQuest ? Number(removedQuest.deadline.slice(0,4)) : null;
        defer(() => pushToast("Человек перемещён в архив", toastIcon(Archive, "text-zinc-400"), () => {
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
            ...p, archived:true, archivedAt: today,
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
        defer(() => pushToast("Карточка человека удалена", toastIcon(Trash2, "text-zinc-400"), () => {
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
          defer(() => pushToast("Отслеживание ДР выключено, квест-поздравление снят", toastIcon(EyeOff, "text-zinc-400"), () => {
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

    // Тот же принцип, что у togglePersonBirthdayTracking выше: подписка — просто флаг (личные
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
          defer(() => pushToast(`Отписка от «${holiday ? holiday.name : "праздника"}», квест-поздравление снят`, toastIcon(EyeOff, "text-zinc-400"), () => {
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

    updatePeopleCardFields(patch) {
      setState(prev => ({ ...prev, uiPrefs: { ...(prev.uiPrefs||{}), peopleCardFields: { ...defaultPeopleCardFields(), ...(prev.uiPrefs && prev.uiPrefs.peopleCardFields), ...patch } } }));
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
        defer(() => pushToast("Тип отношений удалён", toastIcon(Trash2, "text-zinc-400"), () => {
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

    // Свернуть/развернуть секцию карточки человека (Квесты/Привычки/Долги/Переводы) — общая
    // настройка вида, запоминается между сессиями (не привязана к конкретному человеку).
    toggleCollapsedSection(key) {
      setState(prev => {
        const cur = (prev.uiPrefs && prev.uiPrefs.peopleDetail && prev.uiPrefs.peopleDetail.collapsedSections) || [];
        const next = cur.includes(key) ? cur.filter(k => k!==key) : [...cur, key];
        return { ...prev, uiPrefs: { ...(prev.uiPrefs||{}), peopleDetail: { ...defaultPeopleDetailPrefs(), ...(prev.uiPrefs && prev.uiPrefs.peopleDetail), collapsedSections: next } } };
      });
    },
  };
}
