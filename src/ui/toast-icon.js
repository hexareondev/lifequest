// Иконка для тоста без JSX. Действия разделов (*/actions.js) — обычные .js-файлы, чтобы их можно
// было подключать в тестах под Node, а Node разметку не читает. Результат тот же, что у
// <Icon className="w-4 h-4 …"/>.

import { createElement } from "react";

export function toastIcon(Icon, tone) {
  return createElement(Icon, { className: "w-4 h-4 " + tone });
}
