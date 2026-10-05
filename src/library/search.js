// Поиск обложек по внешним источникам. Единственное место во всём приложении, которое ходит в
// сеть: остальное работает в браузере на localStorage. Наружу смотрят только список источников,
// подсказки и две точки входа — конкретные запросы к API остаются внутри модуля.

// Проверенные источники обложек по видам — можно включать/выключать по отдельности
// (Настройки → Библиотека). needsKey — какой ключ из apiKeys нужен, null — работает без ключа.
// Открытая ссылка на регистрацию — keyUrl, показывается прямо в настройках.
export const LIBRARY_SEARCH_SOURCES = {
  book: [
    { id:"openLibrary", label:"Open Library", needsKey:null },
    { id:"googleBooks", label:"Google Books", needsKey:null, optionalKey:"googleBooks", keyUrl:"https://console.cloud.google.com/apis/library/books.googleapis.com" },
  ],
  movie: [
    { id:"tmdb",    label:"TMDB",    needsKey:"tmdb", keyUrl:"https://www.themoviedb.org/settings/api" },
    { id:"omdb",    label:"OMDb",    needsKey:"omdb", keyUrl:"https://www.omdbapi.com/apikey.aspx" },
    { id:"anilist", label:"AniList", needsKey:null },
  ],
  game: [
    { id:"rawg", label:"RAWG (экспериментально)", needsKey:"rawg", keyUrl:"https://rawg.io/apidocs" },
  ],
};
export const LIBRARY_SEARCH_HINT = {
  book:  "Лучше искать по оригинальному названию — так выше шанс найти обложку.",
  movie: "Лучше искать по оригинальному названию — с русским переводом может не найти.",
  game:  "Название на английском обычно надёжнее русского.",
};
// Каждая функция возвращает { id, name (чистое название — для автозаполнения карточки), title
// (для подписи под миниатюрой), imageUrl, source (для бейджа), и, если источник даёт —
// pagesTotal/episodesTotal/isSeries для автоподстановки в форму.
async function searchOpenLibrary(query) {
  const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=title,author_name,cover_i,first_publish_year,number_of_pages_median&limit=12`);
  if (!res.ok) throw new Error("Open Library недоступен");
  const data = await res.json();
  return (data.docs||[]).filter(d => d.cover_i).map(d => ({
    id: `ol-${d.cover_i}`,
    name: d.title,
    title: d.title + (d.author_name ? ` — ${d.author_name[0]}` : "") + (d.first_publish_year ? ` (${d.first_publish_year})` : ""),
    imageUrl: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`,
    source: "Open Library",
    pagesTotal: d.number_of_pages_median || null,
  }));
}
async function searchGoogleBooks(query, apiKey) {
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : "";
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12${keyParam}`);
  if (!res.ok) throw new Error("Google Books недоступен");
  const data = await res.json();
  return (data.items||[]).filter(d => d.volumeInfo && d.volumeInfo.imageLinks && d.volumeInfo.imageLinks.thumbnail).map(d => ({
    id: `gb-${d.id}`,
    name: d.volumeInfo.title,
    title: d.volumeInfo.title + (d.volumeInfo.authors ? ` — ${d.volumeInfo.authors[0]}` : "") + (d.volumeInfo.publishedDate ? ` (${d.volumeInfo.publishedDate.slice(0,4)})` : ""),
    imageUrl: d.volumeInfo.imageLinks.thumbnail.replace("http://","https://"),
    source: "Google Books",
    pagesTotal: d.volumeInfo.pageCount || null,
  }));
}
async function searchTMDB(query, apiKey) {
  const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&include_adult=false`);
  if (!res.ok) throw new Error("TMDB недоступен — проверь ключ");
  const data = await res.json();
  return (data.results||[]).filter(d => d.poster_path && (d.media_type==="movie" || d.media_type==="tv")).slice(0,12).map(d => ({
    id: `tmdb-${d.id}`,
    name: d.title || d.name,
    title: (d.title||d.name) + ((d.release_date||d.first_air_date) ? ` (${(d.release_date||d.first_air_date).slice(0,4)})` : ""),
    imageUrl: `https://image.tmdb.org/t/p/w200${d.poster_path}`,
    source: "TMDB",
    isSeries: d.media_type==="tv",
    tmdbId: d.id,
  }));
}
export async function fetchTMDBEpisodeCount(tmdbId, apiKey) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.number_of_episodes || null;
  } catch (e) { return null; }
}
async function searchOMDb(query, apiKey) {
  const res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&s=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("OMDb недоступен");
  const data = await res.json();
  if (data.Response === "False") return [];
  return (data.Search||[]).filter(d => d.Poster && d.Poster !== "N/A").map(d => ({
    id: `omdb-${d.imdbID}`,
    name: d.Title,
    title: `${d.Title} (${d.Year})`,
    imageUrl: d.Poster,
    source: "OMDb",
    isSeries: d.Type === "series",
  }));
}
async function searchAniList(query) {
  const gql = `query ($search: String) { Page(perPage: 12) { media(search: $search, sort: SEARCH_MATCH) { id title { romaji english } coverImage { medium large } episodes format } } }`;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type":"application/json", "Accept":"application/json" },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
  });
  if (!res.ok) throw new Error("AniList недоступен");
  const data = await res.json();
  const list = (data.data && data.data.Page && data.data.Page.media) || [];
  return list.filter(m => m.coverImage && (m.coverImage.large || m.coverImage.medium)).map(m => ({
    id: `anilist-${m.id}`,
    name: m.title.english || m.title.romaji,
    title: (m.title.english || m.title.romaji) + (m.format ? ` (${m.format})` : ""),
    imageUrl: m.coverImage.large || m.coverImage.medium,
    source: "AniList",
    isSeries: true,
    episodesTotal: m.episodes || null,
  }));
}
async function searchRAWG(query, apiKey) {
  const res = await fetch(`https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(query)}&page_size=12`);
  if (!res.ok) throw new Error("RAWG недоступен");
  const data = await res.json();
  return (data.results||[]).filter(d => d.background_image).map(d => ({
    id: `rawg-${d.id}`,
    name: d.name,
    title: d.name + (d.released ? ` (${d.released.slice(0,4)})` : ""),
    imageUrl: d.background_image,
    source: "RAWG",
  }));
}
export async function runLibrarySourceSearch(sourceId, query, apiKeys) {
  switch (sourceId) {
    case "openLibrary": return searchOpenLibrary(query);
    case "googleBooks": return searchGoogleBooks(query, apiKeys.googleBooks);
    case "tmdb":    return searchTMDB(query, apiKeys.tmdb);
    case "omdb":    return searchOMDb(query, apiKeys.omdb);
    case "anilist": return searchAniList(query);
    case "rawg":    return searchRAWG(query, apiKeys.rawg);
    default: return [];
  }
}
