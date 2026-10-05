/* Напоминание о бэкапе. Единственная необратимая потеря в приложении — стёртое хранилище, и
   единственная защита от неё срабатывает, только если о ней напомнить. */
const E = require("./notes_env.js");
const { eq, done } = E;
const T = "2026-03-20";

eq("бэкапа не было — напоминаем сразу", E.backupReminderState(null, T).due, true);
eq("и говорим об этом прямо", E.backupReminderState(null, T).never, true);
eq("свежий бэкап — молчим", E.backupReminderState("2026-03-19", T).due, false);
eq("сегодняшний бэкап — молчим", E.backupReminderState(T, T), { due: false, age: 0, never: false });

const edge = E.BACKUP_REMIND_AFTER_DAYS;
eq("за день до порога ещё молчим",
  E.backupReminderState("2026-03-" + String(20 - edge + 1).padStart(2, "0"), T).due, false);
eq("ровно на пороге уже напоминаем",
  E.backupReminderState("2026-03-" + String(20 - edge).padStart(2, "0"), T).due, true);
eq("давний бэкап — напоминаем", E.backupReminderState("2026-01-01", T).due, true);
eq("и возраст считается верно", E.backupReminderState("2026-03-10", T).age, 10);

/* Дата из будущего — так выглядит бэкап, сделанный на устройстве с другим часовым поясом или
   переведёнными часами. Отрицательный возраст показывать нельзя. */
eq("дата из будущего не даёт отрицательного возраста", E.backupAgeDays("2026-04-01", T), 0);
eq("и не поднимает напоминание", E.backupReminderState("2026-04-01", T).due, false);
eq("мусор вместо даты не роняет", E.backupAgeDays("не дата", T), null);
eq("пустая отметка — возраста нет", E.backupAgeDays(null, T), null);

done();
