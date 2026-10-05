const fs = require("fs");
const os = require("os");
const path = require("path");
// Архивы для ручной проверки распаковщиком кладём во временную папку системы: в tests/ они
// попадали в репозиторий при каждом коммите.
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "questlife-zip-"));
const E = require("./notes_env.js");
const { eq, done } = E;

/* --- Безопасные имена файлов --- */
eq("слэши и двоеточия вырезаются", E.safeFileSegment("отчёт/за: 2026"), "отчёт за 2026");
eq("точки в начале убираются (иначе файл скрытый)", E.safeFileSegment("...секрет"), "секрет");
eq("управляющие символы вырезаются", E.safeFileSegment("а\u0001б"), "а б");
eq("пустое имя получает заглушку", E.safeFileSegment("   "), "Без названия");
eq("длина ограничена", E.safeFileSegment("я".repeat(200)).length, 80);
eq("кириллица не калечится", E.safeFileSegment("Отчёт «за год»"), "Отчёт «за год»");

/* --- Раскладка ветки в файлы --- */
const state = {
  noteFolders: [
    { id: "f1", name: "Работа", parentId: null, order: 0 },
    { id: "f2", name: "Проекты", parentId: "f1", order: 0 },
    { id: "f3", name: "Личное", parentId: null, order: 1 },
  ],
  notes: [
    { id: "n1", title: "План", folderId: "f1", body: "# План\nтело", updatedAt: "2026-01-01" },
    { id: "n2", title: "Идея", folderId: "f2", body: "мысль", updatedAt: "2026-01-02" },
    { id: "n3", title: "План", folderId: "f2", body: "второй с тем же именем", updatedAt: "2026-01-03" },
    { id: "n4", title: "Дом", folderId: "f3", body: "не должен попасть в ветку Работы", updatedAt: "2026-01-04" },
    { id: "n5", title: "Корневая", folderId: null, body: "корень", updatedAt: "2026-01-05" },
  ],
};

const branch = E.buildBranchFiles(state, "f1").map(f => f.path).sort();
eq("ветка содержит только свои заметки, с папками в пути",
  branch, ["Работа/План.md", "Работа/Проекты/Идея.md", "Работа/Проекты/План.md"]);

const dup = E.buildBranchFiles({
  noteFolders: [],
  notes: [
    { id: "a", title: "План", folderId: null, body: "1" },
    { id: "b", title: "План", folderId: null, body: "2" },
    { id: "c", title: "План", folderId: null, body: "3" },
  ],
}, null).map(f => f.path);
eq("одинаковые названия в одной папке разводятся суффиксом",
  dup.sort(), ["План (2).md", "План (3).md", "План.md"]);

const all = E.buildBranchFiles(state, null).map(f => f.path).sort();
eq("выгрузка всего начинается от корня без лишнего префикса",
  all, ["Корневая.md", "Личное/Дом.md", "Работа/План.md", "Работа/Проекты/Идея.md", "Работа/Проекты/План.md"]);

eq("в файл едет чистое тело заметки, без служебной обёртки",
  E.buildNoteMarkdown({ title: "План", body: "# План\nтело" }), "# План\nтело");

/* --- CRC32 против известных значений --- */
eq("CRC32 пустых данных", E.crc32(new Uint8Array(0)), 0);
eq("CRC32 строки '123456789' (эталон стандарта)", E.crc32(E.utf8Bytes("123456789")), 0xCBF43926);
eq("CRC32 строки 'The quick brown fox jumps over the lazy dog'",
  E.crc32(E.utf8Bytes("The quick brown fox jumps over the lazy dog")), 0x414FA339);

/* --- Реальный архив: структура проверяется распаковщиком, а не глазами --- */
const files = E.buildBranchFiles(state, null);
const bytes = E.zipStore(files);
fs.writeFileSync(path.join(OUT, "out_test.zip"), Buffer.from(bytes));
eq("архив начинается сигнатурой локального заголовка",
  [bytes[0], bytes[1], bytes[2], bytes[3]], [0x50, 0x4b, 0x03, 0x04]);
eq("архив не пустой", bytes.length > 200, true);

/* Пустой архив тоже обязан быть валидным: пустая ветка — штатный случай */
fs.writeFileSync(path.join(OUT, "out_empty.zip"), Buffer.from(E.zipStore([])));

done();
