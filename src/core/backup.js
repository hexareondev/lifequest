import { daysBetween, todayStr } from "./basics.js";

/* --- Напоминание о бэкапе ---
   Всё сохранение живёт в одной копии в localStorage. Её стирает чистка браузера, переустановка и
   случайное «очистить данные сайта» — и это единственная необратимая потеря во всём приложении:
   сломанный раздел чинится за вечер, стёртое хранилище не чинится никогда.

   Бэкап при этом делается руками, то есть не делается вовсе: о нём просто не вспоминают. Отсюда
   напоминание — не назойливое, а по факту давности. */
export const BACKUP_REMIND_AFTER_DAYS = 10;

// Отметка ставится в момент, когда бэкап ДЕЙСТВИТЕЛЬНО создан: файл скачан, текст скопирован,
// отправка подтверждена. Открытие настроек или неудачная попытка отметкой не считаются — иначе
// напоминание замолкало бы ровно тогда, когда бэкапа как раз и нет.
export function backupAgeDays(lastBackupAt, today) {
  if (!lastBackupAt) return null;
  const days = daysBetween(lastBackupAt, today || todayStr());
  return isFinite(days) ? Math.max(0, days) : null;
}
export function backupReminderState(lastBackupAt, today) {
  const age = backupAgeDays(lastBackupAt, today);
  if (age === null) return { due: true, age: null, never: true };
  return { due: age >= BACKUP_REMIND_AFTER_DAYS, age, never: false };
}
