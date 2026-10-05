/* Общее окружение для тестов заметок: функции вырезаются из исходников, а не копируются,
   чтобы тест проверял ровно тот код, который поедет в браузер. Сама вырезка живёт в cut.js —
   общая для всех тестов, чтобы переезд имени в модуль правился в одном месте. */
const { cutDecl, moduleBody, pool, mainSource } = require("./cut.js");

const src = mainSource;

// Прежние имена оставлены: вызовы ниже зовут их как раньше.
const cutConst = cutDecl;
const cutFunction = cutDecl;

// Три модели переехали в свои файлы — берём их целиком, а не режем по шапкам.
const collectionsSection = moduleBody("library/collections.js", "COLLECTION_MAIN_BRANCH");
const miscSection = moduleBody("misc/model.js", "defaultMiscPrefs");
const modelSection = moduleBody("notes/model.js", "NOTE_TAG_CLASS");

const markdownSection = moduleBody("notes/markdown.js", "MD_ACTIONS");
const questLinksSection = moduleBody("quests/links.js", "normalizeQuestLinks");
const basicsSection = moduleBody("core/basics.js", "todayStr");
const shareSection = moduleBody("share/model.js", "SHARE_SCHEMAS");
const backupSection = moduleBody("core/backup.js", "backupReminderState");

// LIBRARY_KINDS в исходнике держит React-компоненты иконок и целиком в node не вырезается.
// Подставляем заглушку, а совпадение ключей с настоящей таблицей проверяется отдельным тестом.

const code = `
  ${basicsSection}
  const LIBRARY_KIND_ORDER = ["book", "game", "movie"];
  const LIBRARY_STATUS_ORDER = ["buy", "want", "active", "done", "dropped"];
  ${cutConst("LIBRARY_IMPACT")}
  ${shareSection}
  const LIBRARY_KINDS = {
    book:  { stateKey:"books",  singular:"Книга" },
    game:  { stateKey:"games",  singular:"Игра" },
    movie: { stateKey:"movies", singular:"Фильм" },
  };
  ${cutConst("LIBRARY_PROGRESS_CAPS")}
  ${collectionsSection}
  ${miscSection}
  ${modelSection}
  ${markdownSection}
  ${cutFunction("insertAt")}
  ${backupSection}
  ${cutFunction("activePeople")}
  ${questLinksSection}
  ${cutFunction("libraryDisplayTitle")}
  ${cutFunction("libraryPickerItem")}
  ${cutFunction("imagePosOf")}
  ${cutFunction("imagePosStyle")}
  ${cutFunction("libraryItemTypeLabel")}
  ${cutFunction("librarySeriesSuffix")}
  ${cutConst("LIBRARY_TYPE_PLURALS")}
  ${cutFunction("libraryTypePlural")}
  ${cutFunction("libraryProgressOf")}
  return {
    extractTags, allNoteTags, noteHasAllTags, noteTitleOf,
    childFolders, notesInFolder, folderById, folderPathOf, folderPathLabel,
    folderBranchIds, canMoveFolder, folderNoteCount,
    searchNotes, sortNotesList, safeFileSegment, buildBranchFiles, buildNoteMarkdown,
    crc32, zipStore, utf8Bytes,
    parseMarkdown, parseInline, toggleMarkdownCheckbox,
    defaultNotesPrefs, insertAt,
    applyMarkdownAction, continueListOnEnter, MD_ACTIONS, keyboardInsetOf,
    parseEmbedRef, resolveEmbed, embedSyntax, libraryProgressOf, insertEmbedEdit,
    EMBED_ALIASES, EMBED_MAX_PER_NOTE, EMBED_FIELDS, EMBED_DEFAULT_FIELDS,
    embedFieldsOf, replaceEmbedLine, embedNavTarget,
    libraryDisplayTitle, libraryPickerItem, pickerItemMatches,
    libraryItemTypeLabel, librarySeriesSuffix, imagePosOf, imagePosStyle,
    questSphereIds, questPersonIds, questMainSphereId, questMainSphere,
    questTouchesSphere, questTouchesPerson, normalizeQuestLinks, activePeople,
    backupAgeDays, backupReminderState, BACKUP_REMIND_AFTER_DAYS,
    COLLECTION_MAIN_BRANCH, collectionById, collectionBranches, collectionRefs,
    refBranchId, collectionProgress,
    itemCollection, nextCollectionOrder, assignBranchOrder, reorderRefs, addToBranchPatches,
    anchorIsValid, topLevelBranches, branchesAnchoredTo, branchSubtreeIds,
    canAnchorBranch, canPlaceItemInBranch, collectionTree,
    collectionStrip, branchNameOf, collectionKindCounts, libraryTypePlural,
    reorderBranchList, reorderBy, expandShareSelection, shareDuplicateMatches,
    defaultMiscPrefs, pickWheelIndex, wheelTargetRotation, wheelLibraryOptions,
    wheelCustomOptions, wheelOptionsFrom, dishMissingIngredients, cookableDishes,
  };
`;

/* Собранный код — это склейка модулей, секций и отдельных вырезок. Если один и тот же кусок
   попал в неё дважды, new Function падает с «имя уже объявлено» и номером строки в безымянном
   скрипте, по которому ничего не найти. Проверяем заранее и называем имя. */
function assertNoDuplicates(text) {
  const seen = new Map();
  text.split("\n").forEach((line, i) => {
    const m = /^(?:async\s+)?(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (!m) return;
    const name = m[1];
    if (seen.has(name)) {
      throw new Error(`в собранном коде дважды объявлено ${name} (строки ${seen.get(name)} и ${i + 1}) ` +
        "— какой-то кусок исходника попал в сборку два раза");
    }
    seen.set(name, i + 1);
  });
}
assertNoDuplicates(code);

module.exports = new Function(code)();
// Сырой текст для тестов, которые сверяют вырезанное с исходником. Это ВСЕ файлы src/: имя,
// переехавшее в модуль, должно находиться и после переезда.
module.exports.rawSource = pool;
module.exports.mainSource = src;
module.exports.cutDecl = cutDecl;

let failures = 0;
module.exports.eq = function eq(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log("FAIL " + label + "\n  ждали " + e + "\n  вышло " + a); }
  else console.log("ok   " + label);
};
module.exports.done = function done() {
  console.log(failures ? `\n${failures} ТЕСТ(ОВ) УПАЛО` : "\nвсе тесты прошли");
  process.exit(failures ? 1 : 0);
};
