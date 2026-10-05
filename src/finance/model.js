// Счета, накопления и долги: где лежат деньги и как операции меняют остаток. Остаток нигде не
// хранится — он всегда считается из операций, иначе он и история неминуемо разойдутся.

import { todayStr } from "../core/basics.js";
import { monthKey } from "../core/format.js";

// Счёт — где физически лежат деньги: карта, наличные, вклад. Остаток счёта НЕ хранится, а
// считается из операций (computed-not-stored, как везде в проекте): иначе остаток и история
// неминуемо разойдутся при любом редактировании или откате операции.
//
// Стартового остатка у счёта нет намеренно: счёт создаётся пустым, а первые деньги вносятся
// обычной операцией «Начальный капитал» — так у суммы ровно один источник правды.
//
// tracked — участвует ли счёт в общих итогах (общий баланс, сбережения). Выключенный счёт не
// исчезает и продолжает вести свою историю, просто не подмешивается в сводные цифры: удобно для
// чужих/технических счетов, за которыми хочется следить отдельно.
// Единая категория для всех переводов — у них нет пользовательской категории, это движение
// между своими счетами, а не трата.
export const TRANSFER_CATEGORY = "Между счетами";
export const ACCOUNT_KINDS = {
  regular: { label:"Счёт",         plural:"Счета" },
  savings: { label:"Сбережения",   plural:"Сберегательные" },
};
export function defaultAccounts() {
  return [
    { id:"acc_main",    name:"Основной",   kind:"regular", color:"amber",  emoji:"💳", tracked:true, archived:false, order:0, createdAt:todayStr() },
    { id:"acc_savings", name:"Сбережения", kind:"savings", color:"violet", emoji:"🐷", tracked:true, archived:false, order:1, createdAt:todayStr(),
      frozen:false, refillable:true, startDate:null, endDate:null },
  ];
}
export function accountMeta(accounts, id) {
  return (accounts||[]).find(a => a.id===id) || null;
}
// Остаток одного счёта. Правила намеренно разные для двух видов счетов:
// • обычный — доходы плюсуют, расходы/выданные долги/переводы в сбережения минусуют;
// • сберегательный — плюсуют вклады, минусуют снятия, и здесь «Начальный капитал» УЧИТЫВАЕТСЯ,
//   в отличие от общего баланса. Иначе вклад, заведённый задним числом, показывал бы ноль:
//   деньги на нём реально лежат, просто они не были заработаны в отслеживаемый период.
export function accountBalanceOf(state, accountId) {
  const acc = accountMeta(state.accounts, accountId);
  if (!acc) return 0;
  let sum = 0;
  (state.transactions||[]).forEach(t => {
    // Перевод между счетами обрабатываем до разбора по видам: он одинаково работает и для
    // обычных счетов, и для сберегательных — деньги просто переезжают, общий баланс не меняется
    // (поэтому balanceEffectOf для него равен нулю).
    if (t.type === "transfer") {
      if (t.accountId === accountId) sum -= t.amount;
      if (t.toAccountId === accountId) sum += t.amount;
      return;
    }
    if (acc.kind === "savings") {
      if (t.type==="savings" && t.toAccountId===accountId) {
        sum += (t.direction==="withdraw" ? -t.amount : t.amount);
      }
      return;
    }
    if (t.accountId !== accountId) return;
    if (t.type === "income") sum += t.amount;
    else if (t.type === "expense") sum -= t.amount;
    else if (t.type === "debt") {
      if (debtMovesBalance(t)) sum += (t.direction==="repay" ? t.amount : -t.amount);
    } else if (t.type === "savings") {
      if (savingsCountsAsIncome(t)) sum += t.amount;
      if (savingsMovesBalance(t)) sum += (t.direction==="withdraw" ? t.amount : -t.amount);
    }
  });
  return sum;
}
export function activeAccounts(state, kind) {
  return (state.accounts||[])
    .filter(a => !a.archived && (!kind || a.kind===kind))
    .sort((a,b) => (a.order??0)-(b.order??0));
}
// Итоги считаются только по отслеживаемым счетам — см. tracked выше.
export function accountsTotal(state, kind) {
  return (state.accounts||[])
    .filter(a => a.kind===kind && a.tracked !== false)
    .reduce((sum, a) => sum + accountBalanceOf(state, a.id), 0);
}
// Показатель счёта под конкретную карточку сверху. Раньше все дриллдауны показывали один и тот же
// остаток, из-за чего «Расходы за месяц» по счетам выглядели как непонятные балансы. Теперь
// каждая карточка резюмирует своё: расходы — сколько ушло с карты, доходы — сколько пришло,
// баланс месяца — изменение остатка за месяц, общий баланс — сам остаток.
export function accountMetricOf(state, accountId, metric, month) {
  if (metric === "balance") return accountBalanceOf(state, accountId);
  const acc = accountMeta(state.accounts, accountId);
  if (!acc) return 0;
  let sum = 0;
  (state.transactions||[]).forEach(t => {
    if (month && monthKey(t.date) !== month) return;
    // Перевод — движение между своими счетами, а не доход и не расход: в суммах доходов и
    // расходов он участвовать не должен, но остаток за месяц двигает.
    if (t.type === "transfer") {
      if (metric !== "monthBalance") return;
      if (t.accountId === accountId) sum -= t.amount;
      if (t.toAccountId === accountId) sum += t.amount;
      return;
    }
    if (acc.kind === "savings") {
      if (t.type==="savings" && t.toAccountId===accountId) {
        const delta = t.direction==="withdraw" ? -t.amount : t.amount;
        if (metric === "monthBalance") sum += delta;
        else if (metric === "income" && delta > 0) sum += delta;
        else if (metric === "expense" && delta < 0) sum += -delta;
      }
      return;
    }
    if (t.accountId !== accountId) return;
    if (metric === "income") {
      if (t.type === "income") sum += t.amount;
      else if (t.type === "debt" && t.direction === "repay" && debtMovesBalance(t)) sum += t.amount;
      else if (t.type === "savings" && t.direction === "withdraw" && savingsMovesBalance(t)) sum += t.amount;
    } else if (metric === "expense") {
      if (t.type === "expense") sum += t.amount;
      else if (t.type === "debt" && t.direction === "lend" && debtMovesBalance(t)) sum += t.amount;
      else if (t.type === "savings" && t.direction === "deposit" && savingsMovesBalance(t)) sum += t.amount;
    } else if (metric === "monthBalance") {
      if (t.type === "income") sum += t.amount;
      else if (t.type === "expense") sum -= t.amount;
      else if (t.type === "debt" && debtMovesBalance(t)) sum += (t.direction==="repay" ? t.amount : -t.amount);
      else if (t.type === "savings") {
        if (savingsCountsAsIncome(t)) sum += t.amount;
        if (savingsMovesBalance(t)) sum += (t.direction==="withdraw" ? t.amount : -t.amount);
      }
    }
  });
  return sum;
}
export function totalSavingsOf(state) {
  // Раньше — прямая сумма savings-операций. Теперь та же величина, но собранная по счетам, что
  // даёт и разбивку, и возможность исключить счёт из итогов флагом tracked. Для сохранений,
  // прошедших миграцию, результат совпадает с прежним до копейки.
  return accountsTotal(state, "savings");
}
export function savingsSourceOf(t) { return t.source || "manual"; }
// Начальный капитал — задним числом внесённые деньги, которые не были заработаны в отслеживаемый период:
// не считается ни доходом, ни движением по бюджету текущего месяца.
// Проценты по вкладу — реальная прибыль, которая тут же уходит в сбережения: считается и доходом, и движением по бюджету
// (эти два эффекта взаимно гасят друг друга в балансе месяца, что математически равно "доход + перевод в сбережения").
export function savingsMovesBalance(t) { return t.type==="savings" && savingsSourceOf(t) !== "opening"; }
export function savingsCountsAsIncome(t) { return t.type==="savings" && t.direction==="deposit" && savingsSourceOf(t)==="interest"; }
export const SAVINGS_SOURCES = {
  manual:   { label:"Из бюджета" },
  opening:  { label:"Начальный капитал" },
  interest: { label:"Проценты по вкладу" },
};

// Долги — деньги, которые дали в долг другим людям (и когда-нибудь должны вернуть).
// "Новый долг" и "Мне вернули" — реальные события бюджета текущего месяца.
// "Долг с начала учёта" — долг, который уже существовал до начала учёта: не трогает бюджет
// месяца, но входит в общую сумму "мне должны" — тот же принцип, что с начальным капиталом сбережений.
export function debtSourceOf(t) { return t.source || "manual"; }
export function debtMovesBalance(t) { return t.type==="debt" && debtSourceOf(t) !== "opening"; }
export function totalDebtOf(state) {
  return (state.transactions||[]).filter(t => t.type==="debt").reduce((a,t) => a + (t.direction==="repay" ? -t.amount : t.amount), 0);
}
// Группируем по personId, если он проставлен (устойчиво к переименованию карточки),
// иначе — по тексту person (как раньше, для долгов без привязки к карточке человека).
export function debtsByPerson(state) {
  const map = {};
  (state.transactions||[]).filter(t => t.type==="debt").forEach(t => {
    const key = t.personId ? `id:${t.personId}` : `name:${(t.person||"").trim() || "Без имени"}`;
    if (!map[key]) map[key] = { person: (t.person||"").trim() || "Без имени", personId: t.personId || null, amount: 0 };
    map[key].amount += (t.direction==="repay" ? -t.amount : t.amount);
  });
  return Object.values(map).sort((a,b) => b.amount-a.amount);
}
export const DEBT_SOURCES = {
  manual:  { label:"Новый долг" },
  opening: { label:"Долг с начала учёта" },
};

// Единственный источник истины для реального эффекта операции на располагаемый баланс:
// >0 — пополняет, <0 — тратит, 0 — не влияет (например, "до начала учёта" или проценты по
// вкладу, которые тут же уходят в сбережения и гасят собственный эффект как доход).
// Используется для сортировки графика баланса и для знака (+/−/без знака) в истории операций —
// не дублировать эту логику по месту, а всегда брать значение отсюда.
export function balanceEffectOf(t) {
  if (t.type === "income") return t.amount;
  if (t.type === "expense") return -t.amount;
  if (t.type === "savings") {
    let effect = 0;
    if (savingsCountsAsIncome(t)) effect += t.amount;
    if (savingsMovesBalance(t)) effect += (t.direction === "withdraw" ? t.amount : -t.amount);
    return effect;
  }
  if (t.type === "debt") {
    if (!debtMovesBalance(t)) return 0;
    return t.direction === "repay" ? t.amount : -t.amount;
  }
  return 0;
}

// Какие колонки показывать в истории операций. Тот же паттерн, что peopleCardFields.
export const FINANCE_TABLE_FIELDS = [
  { id:"date",        label:"Дата",      locked:true },
  { id:"category",    label:"Категория" },
  { id:"operation",   label:"Операция (откуда → куда)" },
  { id:"description", label:"Описание" },
  { id:"amount",      label:"Сумма",     locked:true },
];
export function defaultFinanceTableFields() {
  // Отдельной колонки «Человек» нет намеренно: для операций с людьми и долгов «Источник»
  // заполняется именем человека автоматически, так что колонка дублировала бы его один в один.
  return { date:true, category:true, operation:true, description:true, amount:true };
}
