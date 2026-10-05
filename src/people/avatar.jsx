// Аватар человека.

import { useState } from "react";
import { IconFor } from "../ui/icons.js";
import { imagePosStyle } from "../core/images.js";

// Аватар человека с откатом на иконку, если картинка по ссылке не загрузилась (битая ссылка,
// сайт заблокировал показ и т.п.) — тот же принцип, что у LibraryCover.
export function PersonAvatar({ person, wrapClassName, iconClassName }) {
  const [failed, setFailed] = useState(false);
  const Icon = IconFor(person.icon);
  return (
    <span className={`${wrapClassName} overflow-hidden`}>
      {person.avatarImage && !failed
        ? <img src={person.avatarImage} className="w-full h-full object-cover" style={imagePosStyle(person.avatarPos)} onError={() => setFailed(true)} alt="" />
        : person.avatarEmoji
          ? <span className="flex items-center justify-center w-full h-full text-2xl">{person.avatarEmoji}</span>
          : <Icon className={iconClassName} />}
    </span>
  );
}
