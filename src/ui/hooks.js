// Хуки, общие для разделов.

import { useState, useEffect } from "react";

// Только для решения "открывать модалку дня или обновлять постоянную боковую панель" в Месяце —
// на широком экране (от lg, как и брейкпоинт панели ниже) день кликается в панель сбоку, на узком
// (где панели нет и негде её показать) — по-прежнему в модалку, как было раньше везде.
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  useEffect(() => {
    function onResize() { setIsDesktop(window.innerWidth >= 1024); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isDesktop;
}
