// Настройки разделов, которые запоминаются между сессиями: что было открыто, как отсортировано,
// какие источники обложек включены. Здесь только значения по умолчанию.

export function defaultLibraryPrefs() {
  return { lastKind:null, lastItemId:null, viewByKind:{}, sortByKind:{} };
}
// Настройки вкладки «Квесты»: выбранный вид, состояние переключателя архива и список
// РАЗВЁРНУТЫХ кампаний. Всё запоминается между сессиями по тому же принципу, что вид Библиотеки
// и свёрнутые секции карточки человека, — возвращаться каждый раз к схлопнутому списку и виду
// «Квесты» после каждой перезагрузки незачем.
export function defaultQuestsPrefs() {
  return { view:"quests", sort:"urgency", showArchivedCampaigns:false, expandedCampaigns:[] };
}
// Какие секции карточки человека свёрнуты — общая настройка вида, не привязана к конкретному
// человеку (свернул "Долги" один раз — они свёрнуты у всех, как и ожидаешь от настройки экрана,
// а не данных о ком-то конкретном).
export function defaultPeopleDetailPrefs() {
  return { collapsedSections: [] };
}
export function defaultApiKeys() {
  return { tmdb:"", rawg:"", omdb:"", googleBooks:"" };
}
// Фильтры/последний выбранный вид отображения Календаря — таксономия интерфейса, не персональные
// данные, безопасный дефолт-фолбэк по тому же принципу, что у остальных uiPrefs-разделов.
export function defaultCalendarPrefs() {
  // spanMode — как показывать мультидневные квесты: "all" (каждый свой день) или "edges" (только
  // первый и последний день), чтобы длинный квест не забивал Повестку. campaign — фильтр по
  // конкретной кампании: null (все), "none" (только вне кампаний) или её id.
  return { filters: { quests:true, birthdays:true, habits:true, holidays:true, spheres:[], spanMode:"all", campaign:null }, view:"month", kanbanCollapsed:[], monthPanel: { enabled:true, width:300 }, weekLayout:"grid" };
}
export function defaultLibrarySources() {
  return {
    book:  { openLibrary:true, googleBooks:true },
    movie: { tmdb:true, omdb:true, anilist:true },
    game:  { rawg:true },
  };
}
