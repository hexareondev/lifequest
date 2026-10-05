// Обложка записи библиотеки: картинка по ссылке, а при неудаче — эмодзи. Картинка может
// отвалиться в любой момент (ссылка протухла, сайт закрыл показ), и карточка не должна при этом
// оставаться пустой.

import { useState } from "react";
import { imagePosStyle } from "../core/images.js";

export function LibraryCover({ item, className }) {
  const [failed, setFailed] = useState(false);
  if (item.coverImage && !failed) {
    return <img src={item.coverImage} className={`object-cover ${className}`} style={imagePosStyle(item.coverPos)} onError={() => setFailed(true)} alt="" />;
  }
  return <span className={`flex items-center justify-center ${className}`}>{item.coverEmoji}</span>;
}
