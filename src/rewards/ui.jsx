// Магазин наград: свои награды, покупка за золото, история покупок.

import { useEffect, useMemo, useState } from "react";
import { fmtDateShort } from "../core/format.js";
import { LIMIT_OPTIONS } from "../finance/ui.jsx";
import {
  LIBRARY_KINDS, LIBRARY_KIND_ORDER, libraryDisplayTitle, libraryStatusLabel,
} from "../library/constants.js";
import { LibraryCover } from "../library/cover.jsx";
import {
  Button, Card, EmptyState, Modal, Pager, SectionHeader, StickyAddButton, inputCls, labelCls,
} from "../ui/atoms.jsx";
import { Check, Coins, Gem, Repeat, Trash2, Lock } from "lucide-react";

function RewardForm({ state, onSubmit, onCancel }) {
  const [mode, setMode] = useState("custom");
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState(30);
  const [repeatable, setRepeatable] = useState(true);
  const [pick, setPick] = useState(null); // { kind, itemId }

  // В выбор попадают только вещи со статусом «Хочу купить» — иначе список превратился бы во всю
  // библиотеку, и найти в нём то, что действительно собираешься покупать, было бы невозможно.
  const wishlist = useMemo(() => {
    const out = [];
    LIBRARY_KIND_ORDER.forEach(kind => {
      (state[LIBRARY_KINDS[kind].stateKey] || []).forEach(item => {
        if (item.status === "buy") out.push({ kind, item });
      });
    });
    return out;
  }, [state.books, state.games, state.movies]); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = pick ? wishlist.find(x => x.kind===pick.kind && x.item.id===pick.itemId) : null;
  const ready = mode === "custom" ? !!title.trim() : !!picked;

  function submit() {
    if (!ready || !cost) return;
    if (mode === "custom") { onSubmit({ title: title.trim(), cost: Number(cost)||0, repeatable, link: null }); return; }
    // Одноразовость у покупки вещи не опция: купить одну и ту же книгу дважды бессмысленно, а
    // после покупки она вообще уходит из списка «Хочу купить».
    onSubmit({ title: libraryDisplayTitle(picked.item), cost: Number(cost)||0, repeatable: false, link: { kind: picked.kind, itemId: picked.item.id } });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {[{ id:"custom", label:"Своя награда" }, { id:"library", label:`Из библиотеки${wishlist.length ? ` (${wishlist.length})` : ""}` }].map(t => (
          <button key={t.id} onClick={() => setMode(t.id)}
            className={`py-2.5 rounded-xl text-xs font-medium border transition ${mode===t.id ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "border-zinc-800 text-zinc-500"}`}>{t.label}</button>
        ))}
      </div>

      {mode === "custom" ? (
        <div>
          <label className={labelCls}>Название награды</label>
          <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например: Вечер за игрой" autoFocus />
        </div>
      ) : wishlist.length === 0 ? (
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/40 text-sm text-zinc-500">
          В библиотеке нет ничего со статусом «Хочу купить». Поставьте его книге, игре или фильму —
          и они появятся здесь, а покупка награды переведёт вещь в «Хочу прочитать/поиграть/посмотреть».
        </div>
      ) : (
        <div>
          <label className={labelCls}>Что покупаем</label>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 lq-scroll">
            {wishlist.map(({ kind, item }) => {
              const active = pick && pick.kind===kind && pick.itemId===item.id;
              return (
                <button key={`${kind}:${item.id}`} onClick={() => setPick({ kind, itemId:item.id })}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition text-left ${active ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"}`}>
                  <LibraryCover item={item} className="text-xl shrink-0 w-9 aspect-[2/3] rounded-md bg-zinc-900" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-zinc-100 truncate">{libraryDisplayTitle(item)}</div>
                    <div className="text-xs text-zinc-600">{LIBRARY_KINDS[kind].singular}</div>
                  </div>
                  {active && <Check className="w-4 h-4 text-amber-400 shrink-0"/>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className={labelCls}>Стоимость, золото</label>
        <div className="relative">
          <Coins className="w-4 h-4 text-amber-400 absolute" style={{ left:12, top:"50%", transform:"translateY(-50%)" }} />
          <input type="number" min="1" className={inputCls} style={{ paddingLeft:36 }} value={cost} onChange={e=>setCost(e.target.value)} />
        </div>
      </div>

      {mode === "custom" ? (
        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={repeatable} onChange={e=>setRepeatable(e.target.checked)} />
          Можно покупать многократно
        </label>
      ) : (
        <div className="text-xs text-zinc-600">
          Покупка спишет золото и переведёт вещь в «{picked ? libraryStatusLabel(picked.kind, "want") : "Хочу…"}». Награда одноразовая.
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
        <Button onClick={submit} disabled={!ready}>Добавить</Button>
      </div>
    </div>
  );
}

// Награда может быть привязана к элементу библиотеки со статусом «Хочу купить»: покупка награды
// тогда не просто списывает золото, а переводит вещь в «Хочу прочитать/поиграть/посмотреть».
// Хранится только ссылка { kind, itemId } — название и обложка всегда берутся из самой библиотеки,
// поэтому переименование книги не оставляет в магазине устаревшую копию (тот же принцип
// computed-not-stored, что у наград кампаний).
function rewardLinkedItem(reward, state) {
  const link = reward && reward.link;
  if (!link || !LIBRARY_KINDS[link.kind]) return null;
  const list = state[LIBRARY_KINDS[link.kind].stateKey] || [];
  return list.find(x => x.id===link.itemId) || null;
}

function RewardCard({ reward, currency, item, onBuy, onDelete }) {
  const canAfford = currency >= reward.cost;
  const purchased = (reward.purchases||[]).length;
  const locked = !reward.repeatable && purchased>0;
  // Привязка к библиотеке потерялась (вещь удалили) — награда остаётся рабочей, просто без
  // обложки: молча прятать её из магазина было бы хуже, чем показать как обычную.
  const linkLost = !!(reward.link && !item);
  const title = item ? libraryDisplayTitle(item) : reward.title;
  return (
    <Card className="p-4 flex flex-col">
      {/* Шапка карточки — обложка/иконка, растягивающееся название и удаление, как в строке
          библиотеки: название занимает всё место между ними и переносится, а не обрезается. */}
      <div className="flex items-start gap-3">
        {item
          ? <LibraryCover item={item} className="text-2xl shrink-0 w-12 aspect-[2/3] rounded-lg bg-zinc-900" />
          : <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-violet-500/15"><Gem className="w-5 h-5 text-violet-400"/></div>}
        <div className="flex-1 min-w-0" style={{ minHeight: 48 }}>
          <div className="text-sm font-semibold text-zinc-100 break-words">{title}</div>
          {item && <div className="text-xs text-zinc-500 mt-0.5">{LIBRARY_KINDS[reward.link.kind].singular}</div>}
          {linkLost && <div className="text-xs text-zinc-600 mt-0.5">Вещь удалена из библиотеки</div>}
        </div>
        <button onClick={onDelete} className="text-zinc-600 hover:text-red-400 p-1 shrink-0" title="Удалить награду"><Trash2 className="w-3.5 h-3.5"/></button>
      </div>

      <div className="text-xs text-zinc-500 mt-3 flex items-center gap-1">
        {reward.repeatable ? <Repeat className="w-3 h-3"/> : <Lock className="w-3 h-3"/>}
        {reward.repeatable ? "Многоразовая" : (purchased>0 ? "Уже получена" : "Одноразовая")}
      </div>

      <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-amber-300 font-data text-sm"><Coins className="w-4 h-4"/>{reward.cost}</span>
        <Button size="sm" disabled={!canAfford || locked} onClick={onBuy}>{locked ? "Получено" : "Купить"}</Button>
      </div>
    </Card>
  );
}

// История покупок — такая же таблица, как «Все операции» в Финансах: ровные колонки и сортировка
// по клику на заголовок. Список из трёх значений в строку читался хуже именно из-за плавающих
// колонок: дата и цена оказывались в разных местах у каждой строки.
function PurchaseHistoryTable({ purchases }) {
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const list = purchases.slice();
    list.sort((a,b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === "cost") { va = Number(va)||0; vb = Number(vb)||0; }
      else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      if (va < vb) return sortDir==="asc" ? -1 : 1;
      if (va > vb) return sortDir==="asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [purchases, sortKey, sortDir]);

  useEffect(() => { setPage(1); }, [limit, sortKey, sortDir, purchases.length]);
  const totalPages = limit===Infinity ? 1 : Math.max(1, Math.ceil(sorted.length/limit));
  const safePage = Math.min(page, totalPages);
  const shown = limit===Infinity ? sorted : sorted.slice((safePage-1)*limit, safePage*limit);

  function toggleSort(key) {
    if (sortKey===key) setSortDir(d => d==="asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key==="title" ? "asc" : "desc"); }
  }
  // Классы выравнивания пишутся целиком, а не собираются из кусков: сборщик Tailwind ищет их в
  // исходнике буквально, и `text-${align}` в собранной сборке просто не существовало бы.
  function Th({ k, children, right }) {
    return (
      <th onClick={() => toggleSort(k)} className={`${right ? "text-right" : "text-left"} text-xs font-data uppercase tracking-wide text-zinc-500 px-3 py-2 cursor-pointer hover:text-zinc-300 select-none whitespace-nowrap`}>
        {children}{sortKey===k && <span className="ml-1">{sortDir==="asc" ? "↑" : "↓"}</span>}
      </th>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs mb-3">
        <span className="text-zinc-500">Показать:</span>
        {LIMIT_OPTIONS.map(n => (
          <button key={n===Infinity?"all":n} onClick={() => setLimit(n)} className={`px-2 py-1 rounded-md ${limit===n ? "bg-amber-500/15 text-amber-300" : "text-zinc-500 hover:text-zinc-300"}`}>{n===Infinity ? "Все" : n}</button>
        ))}
      </div>
      <div className="overflow-x-auto lq-scroll">
        <table className="w-full border-collapse" style={{ minWidth:360 }}>
          <thead>
            <tr className="border-b border-zinc-800">
              <Th k="title">Награда</Th>
              <Th k="date">Дата</Th>
              <Th k="cost" right>Стоимость</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p,i) => (
              <tr key={`${p.date}-${p.title}-${i}`} className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
                <td className="px-3 py-2.5 text-sm text-zinc-300">{p.title}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-500 font-data whitespace-nowrap">{fmtDateShort(p.date)}</td>
                <td className="px-3 py-2.5 text-xs text-amber-300 font-data whitespace-nowrap text-right">
                  <span className="inline-flex items-center gap-1"><Coins className="w-3 h-3"/>-{p.cost}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={safePage} limit={limit} total={sorted.length} onChange={setPage} />
    </div>
  );
}

export function RewardsView({ state, actions }) {
  const [modalOpen, setModalOpen] = useState(false);
  // Название берётся из библиотеки, если награда к ней привязана: в истории должно стоять текущее
  // имя вещи, а не то, каким оно было в момент покупки.
  const allPurchases = useMemo(() => {
    const list = [];
    state.rewards.forEach(r => {
      const item = rewardLinkedItem(r, state);
      const title = item ? libraryDisplayTitle(item) : r.title;
      (r.purchases||[]).forEach(d => list.push({ title, date:d, cost:r.cost }));
    });
    return list;
  }, [state.rewards, state.books, state.games, state.movies]);

  return (
    <div className="space-y-5">
      <SectionHeader eyebrow="Трать честно заработанное" title="Магазин наград" />

      <Card className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center"><Coins className="w-6 h-6 text-amber-400"/></div>
        <div>
          <div className="text-xs text-zinc-500">Доступно золота</div>
          <div className="font-data text-2xl font-semibold text-amber-300">{state.profile.currency}</div>
        </div>
      </Card>

      {state.rewards.length === 0 ? (
        <EmptyState icon={Gem} title="Пока нет наград" subtitle="Придумай, чем побалуешь себя за выполненные квесты." action={<Button size="sm" onClick={() => setModalOpen(true)}>Добавить награду</Button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {state.rewards.map(r => <RewardCard key={r.id} reward={r} currency={state.profile.currency} item={rewardLinkedItem(r, state)}
            onBuy={() => actions.purchaseReward(r.id)} onDelete={() => actions.deleteReward(r.id)} />)}
        </div>
      )}

      <Card className="p-5">
        <div className="text-sm font-semibold text-zinc-200 mb-3">История покупок</div>
        {allPurchases.length === 0
          ? <div className="text-sm text-zinc-500">Пока пусто.</div>
          : <PurchaseHistoryTable purchases={allPurchases} />}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Новая награда">
        <RewardForm state={state} onSubmit={(r) => { actions.addReward(r); setModalOpen(false); }} onCancel={() => setModalOpen(false)} />
      </Modal>
      <StickyAddButton onClick={() => setModalOpen(true)} label="Новая награда" />
    </div>
  );
}
