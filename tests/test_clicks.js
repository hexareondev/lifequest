/* Откат из тоста вызывается ровно один раз: раньше он стоял внутри функции обновления, и StrictMode
   при разработке прогонял его дважды — золото за отменённую привычку списывалось вдвое. */
const { eq, done, mainSource } = require("./notes_env.js");
// Откат не должен вызываться внутри функции обновления setToasts(ts => …).
const undoFn = mainSource.slice(mainSource.indexOf("function handleUndo"), mainSource.indexOf("function navigate"));
eq("handleUndo найден", undoFn.length > 0, true);
const inUpdater = /setToasts\(\s*ts\s*=>\s*\{[^}]*\.undo\(\)/.test(undoFn);
eq("откат вызывается снаружи функции обновления", inUpdater, false);
eq("повторное «Отменить» по тому же тосту игнорируется", /undoneRef\.current\.has\(id\)/.test(undoFn), true);

done();
