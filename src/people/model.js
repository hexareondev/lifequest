// Люди: типы отношений, набор полей маленькой карточки и отбор активных. Модель без разметки.

// Резолвит тип отношений с фолбэком на "Другое" — тот же принцип, что у categoryMeta.
export function relationMeta(list, name) {
  const l = list || [];
  return l.find(r => r.name===name) || l.find(r => r.name==="Другое") || { name:"Другое", color:"zinc" };
}
export function defaultPeopleRelations() {
  return [
    { name:"Семья",   color:"rose" },
    { name:"Партнёр", color:"fuchsia" },
    { name:"Друг",    color:"emerald" },
    { name:"Коллега", color:"sky" },
    { name:"Другое",  color:"zinc" },
  ];
}
// Какие поля показывать на маленькой карточке человека в общем списке — настраивается
// пользователем (кнопка "Карточки" на вкладке "Люди") и хранится в state.uiPrefs.
export const PEOPLE_CARD_FIELD_LABELS = {
  counts:   "Квесты и привычки",
  debt:     "Долг",
  birthday: "Возраст и день рождения",
  notes:    "Заметки",
};
export function defaultPeopleCardFields() {
  return { counts:true, debt:true, birthday:true, notes:false };
}

export function activePeople(people) {
  return (people || []).filter(p => !p.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
