#!/usr/bin/env node
/* Обязательные проверки перед сдачей. На Node, а не на bash: проект собирается под Windows, и
   скрипт должен запускаться из обычной консоли, без Git Bash.

   Почему второй проход именно с этим набором кодов: первый (--checkJs false) ловит только
   синтаксис и НЕ видит повторных объявлений — дубль в списке импорта проходит его насквозь и
   падает уже на сборке. TS2300/TS2451 добавлены сюда после того, как ровно так и случилось. */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const MAIN = process.argv[2] || "src/questlife-app.jsx";
const TESTS_DIR = existsSync("tests") ? "tests" : ".";
let failed = false;
// Каждый шаг отчитывается ЗА СЕБЯ. Раньше все смотрели в общий флаг, и после падения первого
// остальные молчали — по выводу нельзя было понять, прошли они или просто не отчитались.
let stepFailed = false;
const step = (title) => { stepFailed = false; console.log(`=== ${title} ===`); };
const done = () => { if (stepFailed) failed = true; else console.log("ok"); };
const fail = (msg) => { console.log(msg); stepFailed = true; };

function tsc(extra) {
  try {
    return execSync(
      `npx tsc --jsx preserve --noEmit --allowJs --skipLibCheck ${extra} --target es2020 --module esnext --moduleResolution bundler "${MAIN}"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (e) {
    return (e.stdout || "") + (e.stderr || "");
  }
}

// Комментарии и строки заменяются пробелами, чтобы имя в тексте («иконка Lock») или ключ в
// данных (icon:"BookOpen") не считались использованием. Регулярные выражения распознаются по
// предыдущему символу: внутри них кавычки ничего не значат, а без этого разбор съезжает.
function stripCode(text) {
  let out = "", i = 0, mode = null;
  const prevSignificant = () => { const t = out.trimEnd(); return t ? t[t.length - 1] : ""; };
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (!mode) {
      if (c === "/" && n === "/") { mode = "//"; out += "  "; i += 2; continue; }
      if (c === "/" && n === "*") { mode = "/*"; out += "  "; i += 2; continue; }
      if (c === "/" && n !== ">" && (prevSignificant() === "" || "(,=:[!&|?{};+-*%~^".includes(prevSignificant())
          || /(?:return|typeof|case|in|of)$/.test(out.trimEnd()))) {
        let j = i + 1, cls = false;
        while (j < text.length && text[j] !== "\n") {
          if (text[j] === "\\") { j += 2; continue; }
          if (text[j] === "[") cls = true; else if (text[j] === "]") cls = false;
          else if (text[j] === "/" && !cls) { j++; break; }
          j++;
        }
        out += " ".repeat(j - i); i = j; continue;
      }
      if (c === '"' || c === "'") { mode = c; out += " "; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === "//") { if (c === "\n") { mode = null; out += "\n"; } else out += " "; i++; continue; }
    if (mode === "/*") {
      if (c === "*" && n === "/") { mode = null; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    if (c === "\\") { out += "  "; i += 2; continue; }
    if (c === mode || c === "\n") { mode = null; out += c === "\n" ? "\n" : " "; i++; continue; }
    out += " "; i++;
  }
  return out;
}

step("1. Синтаксис");
// Оставляем только грамматические ошибки (TS1xxx). Всё остальное на этом шаге — шум из
// node_modules: без @types/react компилятор жалуется на чужие .d.ts, а к нашему коду это
// отношения не имеет. Отсутствующие имена и дубли ловит второй шаг, по своим кодам.
const syntax = tsc("--checkJs false")
  .split("\n")
  .filter(l => /error TS1\d{3}:/.test(l));
if (syntax.length) fail(syntax.slice(0, 20).join("\n"));
done();

step("2. Неопределённые имена, повторные объявления, импорты");
// TS2305/TS2724/TS2614 — импорт имени, которого модуль не экспортирует; TS2307 — импорт файла,
// которого нет. Оба случая проходят тесты и падают только на сборке: так было с cover.jsx и
// avatar.jsx, лежавшими на диске под другими именами. Компилятор идёт от главного файла по
// импортам, так что проверяется всё дерево, до которого вообще можно дойти.
const errs = tsc("--checkJs")
  .split("\n")
  .filter(l => /TS2304|TS2552|TS2300|TS2451|TS2305|TS2307|TS2724|TS2614/.test(l));
if (errs.length) fail(errs.slice(0, 20).join("\n"));
done();

step("3. Аудит импортов и разметки");
{
  // Проверяется весь исходный код, а не только главный файл: после разделения на модули дубли и
  // затенения расползаются именно по модулям.
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx?|mjs)$/.test(e.name) && !p.includes(TESTS_DIR + path.sep)) files.push(p);
    }
  })(path.dirname(MAIN));

  // Полный список иконок берём из самого пакета, а не из импортов в коде: иконку, которую никто
  // больше не импортирует, по импортам не распознать — именно так потерялся Lock.
  let LUCIDE = new Set();
  try {
    const mod = await import("lucide-react");
    LUCIDE = new Set(Object.keys(mod).filter(k => /^[A-Z]/.test(k)));
  } catch {
    console.log("предупреждение: lucide-react не загрузился, проверка иконок без импорта пропущена");
  }

  const GLOBALS = new Set(["Map","Set","Image","Text","Range","Screen","Audio","Option","Event","Node",
    "Element","File","Blob","URL","Function","Object","Array","Number","String","Date","Promise",
    "Symbol","Error","JSON","Math","Intl","Document","Window","Location","Request","Response"]);

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const names = [];
    for (const m of src.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*"[^"]+"/g)) {
      if (/\/\/|\/\*/.test(m[1])) {
        console.log(`ОШИБКА ${file}: комментарий внутри блока импорта — ломает загрузчик превью`);
        stepFailed = true;
      }
      for (const part of m[1].split(",")) {
        const n = part.split(" as ").pop().trim();
        if (n) names.push(n);
      }
    }
    const seen = new Set(), dup = new Set();
    for (const n of names) (seen.has(n) ? dup : seen).add(n);
    if (dup.size) fail(`ОШИБКА ${file}: повторные имена в импортах: ${[...dup].join(", ")}`);

    const shadow = names.filter(n => GLOBALS.has(n));
    if (shadow.length) fail(`ОШИБКА ${file}: импорт затеняет глобальный конструктор: ${shadow.join(", ")}`);

    // Имя с большой буквы, которое используется, но в файле не импортировано и не объявлено.
    // Компилятор такое пропускает, если у браузера есть глобал с тем же именем: иконка Lock без
    // импорта молча стала классом Web Locks API, и React упал с «Illegal constructor» на всё дерево.
    {
      const code = stripCode(src);
      const known = new Set(["React", "Fragment", ...names]);
      for (const m of src.matchAll(/^import\s+(\w+)/gm)) known.add(m[1]);
      for (const m of code.matchAll(/(?:const|let|var|function|class)\s+([A-Z][\w$]*)/g)) known.add(m[1]);
      // { icon: Icon } и { icon: Icon = Plus } в параметрах и деструктуризации
      for (const m of code.matchAll(/\b[a-z][\w$]*\s*:\s*([A-Z][\w$]*)\s*(?:=[^,}]*)?\s*[,}]/g)) known.add(m[1]);
      for (const m of code.matchAll(/\{\s*([A-Z][\w$]*)\s*[,}]/g)) known.add(m[1]);
      const tags = new Set([...code.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)].map(m => m[1]));
      const icons = new Set([...code.matchAll(/(?<![\w.$])([A-Z][A-Za-z0-9]*)(?![\w$])/g)]
        .map(m => m[1]).filter(n => LUCIDE.has(n) && n !== "Map"));
      const missing = [...new Set([...tags, ...icons])].filter(n => !known.has(n)).sort();
      if (missing.length) fail(`ОШИБКА ${file}: используется без импорта: ${missing.join(", ")}`);
    }

    const lines = src.split("\n");
    lines.forEach((l, i) => {
      if (!l.trim().startsWith("//")) return;
      let prev = "";
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) if (lines[j].trim()) { prev = lines[j].trim(); break; }
      if (/^<[A-Za-z]/.test(prev) && !prev.endsWith(">")) {
        fail(`ОШИБКА ${file}:${i + 1}: комментарий // внутри открывающего JSX-тега`);
      }
    });
  }
  done();
}

step("4. Тесты");
for (const f of readdirSync(TESTS_DIR).filter(n => /^test_.*\.js$/.test(n))) {
  let out = "";
  try {
    out = execSync(`node "${path.join(TESTS_DIR, f)}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
  }
  const lines = out.trim().split("\n");
  const last = lines.pop();
  console.log(f.padEnd(28) + last);
  // При падении показываем первые строки вывода: раньше в отчёт попадал только хвост стека
  // («Node.js v24.20.0»), по которому причина не видна вовсе.
  if (last !== "все тесты прошли") {
    console.log(lines.slice(0, 6).map(l => "    " + l).join("\n"));
    stepFailed = true;
  }
}
if (stepFailed) failed = true;

console.log("=== ИТОГ ===");
console.log(failed ? "ЕСТЬ ПРОБЛЕМЫ" : "всё чисто");
process.exit(failed ? 1 : 0);
