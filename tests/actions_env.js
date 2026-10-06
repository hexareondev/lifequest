/* Окружение для тестов действий разделов (файлы actions.js в папках разделов): то же, что App даёт
   действиям, — setState, commit и pushToast, — только состояние лежит в обычной переменной.

   setState и commit здесь ведут себя строже, чем в браузере. React вправе прогнать функцию обновления
   несколько раз (StrictMode делает это нарочно), поэтому она обязана быть чистой: от одного и того
   же состояния — одинаковый результат. Окружение прогоняет каждую дважды и падает, если результаты
   разошлись: обычно это uid() или todayStr() внутри обновления, а не до него. */
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const load = (rel) => require(path.join(SRC, rel));

function makeStore(initial) {
  const store = { state: initial, toasts: [] };

  store.setState = (next) => {
    if (typeof next !== "function") { store.state = next; return; }
    const first = next(store.state), second = next(store.state);
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error("функция обновления в setState нечистая: два прогона от одного состояния дали разный результат");
    }
    store.state = second;
  };

  store.commit = (updater) => {
    const effects1 = [], effects2 = [];
    const first = updater(store.state, fn => effects1.push(fn));
    const second = updater(store.state, fn => effects2.push(fn));
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error("функция обновления нечистая: два прогона от одного состояния дали разный результат");
    }
    store.state = second;
    effects2.forEach(fn => fn());
  };

  store.pushToast = (text, icon, undo) => { store.toasts.push({ text, undo }); };

  store.lastToast = () => store.toasts[store.toasts.length - 1];
  store.undoLast = () => {
    const t = store.lastToast();
    if (!t || !t.undo) throw new Error("у последнего тоста нет отката");
    t.undo();
  };
  return store;
}

module.exports = { makeStore, load };
