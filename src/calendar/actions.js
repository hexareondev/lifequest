// Действия раздела «Календарь»: вид, раскладка недели, фильтры, канбан и панель месяца.
// Устроены как действия финансов — см. finance/actions.js.

import { defaultCalendarPrefs } from "../core/prefs.js";


export function calendarActions({ setState, commit, pushToast }) {
  return {
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
  };
}
