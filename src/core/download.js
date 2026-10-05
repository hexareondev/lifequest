// Сохранение файла на устройство. Программное скачивание может быть заблокировано песочницей —
// поэтому в интерфейсе рядом с каждой выгрузкой есть кнопка «Скопировать» и само содержимое на
// экране: возврат false здесь означает «покажи запасной путь», а не «всё пропало».

// Общая выгрузка текста файлом. Программное скачивание может быть заблокировано песочницей —
// поэтому везде рядом есть кнопка «Скопировать» и само содержимое на экране (тот же запасной
// путь, что у полной выгрузки и у «Поделиться»).
export function downloadTextFile(text, filename, mime) {
  try {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) { return false; }
}


/* ========================= КАМПАНИИ: ИНТЕРФЕЙС ========================= */

export function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  } catch (e) { /* падать здесь нечему, но браузеры бывают разные */ }
  return Promise.resolve(false);
}
