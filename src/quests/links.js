// Связи квеста со сферами и людьми: чтение списков, главная сфера, проверки принадлежности и
// приведение старой формы полей к новой. Модель без разметки — её читают и Хаб, и Календарь, и
// карточка человека.

/* Квест может относиться сразу к нескольким сферам и людям: «сходить с отцом в спортзал» — это и
   здоровье, и семья. Списки хранятся в sphereIds/personIds, а прежние одиночные sphereId/personId
   остаются только как вход для миграции: два поля об одном и том же неминуемо разъехались бы.

   Награда каждой связанной сфере выдаётся ПОЛНОСТЬЮ, а не долей. Делёж превращал бы связь с
   несколькими сферами в наказание, и человек перестал бы их указывать — то есть данные стали бы
   беднее ровно там, где они интереснее всего. */

export function questSphereIds(quest) {
  if (!quest) return [];
  if (Array.isArray(quest.sphereIds)) return quest.sphereIds.filter(Boolean);
  return quest.sphereId ? [quest.sphereId] : [];
}
export function questPersonIds(quest) {
  if (!quest) return [];
  if (Array.isArray(quest.personIds)) return quest.personIds.filter(Boolean);
  return quest.personId ? [quest.personId] : [];
}
// Главная сфера — первая в списке. От неё берутся цвет и значок: карточке нужен один цвет, и
// выбирать его каждый раз заново по какому-нибудь правилу значило бы менять вид квеста от того,
// в каком порядке сферы перечислены в другом месте.
export function questMainSphereId(quest) { return questSphereIds(quest)[0] || null; }
export function questMainSphere(spheres, quest) {
  const id = questMainSphereId(quest);
  return id ? (spheres || []).find(s => s.id === id) || null : null;
}
export function questTouchesSphere(quest, sphereId) { return questSphereIds(quest).includes(sphereId); }
export function questTouchesPerson(quest, personId) { return questPersonIds(quest).includes(personId); }

// Единственное место, где одиночные поля превращаются в списки при СОЗДАНИИ квеста. Через него
// проходят и форма, и импорт кампании, и планы ИИ — иначе каждый источник пришлось бы чинить
// отдельно, а новый источник молча принёс бы квест со старой формой полей.
export function normalizeQuestLinks(q) {
  const { sphereId, personId, ...rest } = q || {};
  return { ...rest, sphereIds: questSphereIds(q), personIds: questPersonIds(q) };
}
