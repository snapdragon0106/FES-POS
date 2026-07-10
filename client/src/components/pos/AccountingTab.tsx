import { useState, useMemo } from "react";
import { Wallet, ShoppingBag, MinusCircle, Trash2, Plus, Landmark, Printer } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const yen = (n: number) => "¥" + Math.round(n || 0).toLocaleString("ja-JP");
const LOAN_AMOUNT = 40000;

interface Props {
  transactions: any[];
  addLog: (action: string, detail?: string) => void;
  operator: string;
  isAdmin: boolean;
}

function EntryForm({
  placeholder,
  onSubmit,
}: {
  placeholder: string;
  onSubmit: (label: string, amount: number, note: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const submit = () => {
    const amt = Number(amount);
    if (!label.trim()) { toast.error("項目名を入力してください"); return; }
    if (!Number.isInteger(amt) || amt <= 0) { toast.error("金額を正しく入力してください"); return; }
    onSubmit(label.trim(), amt, note.trim());
    setLabel("");
    setAmount("");
    setNote("");
  };

  return (
    <div className="ws-card p-3.5 flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={placeholder}
          className="ws-input flex-1 text-sm"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder="金額"
          className="ws-input font-number w-28 text-sm text-right"
        />
      </div>
      <div className="flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="メモ（任意）"
          className="ws-input flex-1 text-xs"
        />
        <button
          onClick={submit}
          className="flex items-center gap-1 px-4 text-sm font-bold"
          style={{ background: "var(--ws-ac)", color: "#fff", border: "none", cursor: "pointer" }}
        >
          <Plus size={14} />
          追加
        </button>
      </div>
    </div>
  );
}

export default function AccountingTab({ transactions, addLog, operator, isAdmin }: Props) {
  const entriesQuery = trpc.accounting.list.useQuery();
  const createEntry = trpc.accounting.create.useMutation();
  const deleteEntry = trpc.accounting.delete.useMutation();
  const utils = trpc.useUtils();

  const entries = entriesQuery.data || [];
  const purchases = entries.filter((e: any) => e.category === "purchase");
  const deductions = entries.filter((e: any) => e.category === "deduction");
  const loanRepayments = entries.filter((e: any) => e.category === "loan_repay");

  const totals = useMemo(() => {
    const totalSales = transactions
      .filter((t: any) => !t.voided)
      .reduce((s: number, t: any) => s + t.total, 0);
    const purchaseTotal = purchases.reduce((s: number, e: any) => s + e.amount, 0);
    const grossProfit = totalSales - purchaseTotal;
    const deductionTotal = deductions.reduce((s: number, e: any) => s + e.amount, 0);
    const netProfit = grossProfit - deductionTotal;
    const loanRepaid = loanRepayments.reduce((s: number, e: any) => s + e.amount, 0);
    const loanRemaining = LOAN_AMOUNT - loanRepaid;
    return { totalSales, purchaseTotal, grossProfit, deductionTotal, netProfit, loanRepaid, loanRemaining };
  }, [transactions, purchases, deductions, loanRepayments]);

  const handleAdd = async (category: "purchase" | "deduction" | "loan_repay", label: string, amount: number, note: string) => {
    try {
      await createEntry.mutateAsync({ category, label, amount, note: note || undefined });
      const logLabel = category === "purchase" ? "仕入れ" : category === "deduction" ? "控除" : "貸付金返済";
      addLog(
        category === "purchase" ? "add_purchase" : category === "deduction" ? "add_deduction" : "loan_repay",
        `${logLabel}: ${label} ${yen(amount)}`
      );
      toast.success("記録しました");
      utils.accounting.list.invalidate();
    } catch {
      toast.error("記録に失敗しました");
    }
  };

  const handleDelete = async (id: number, category: string, label: string) => {
    if (!confirm(`「${label}」の記録を削除しますか？`)) return;
    try {
      await deleteEntry.mutateAsync({ id, category: category as any });
      toast.success("削除しました");
      utils.accounting.list.invalidate();
    } catch {
      toast.error("削除に失敗しました");
    }
  };

  const EntryRow = ({ e }: { e: any }) => (
    <div className="ws-card p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="hos-subtitle truncate" style={{ fontSize: 14 }}>{e.label}</div>
        <div className="hos-caption">
          {new Date(e.createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })} ・ {e.operator}
          {e.note && ` ・ ${e.note}`}
        </div>
      </div>
      <span className="font-number font-extrabold" style={{ color: "var(--ws-tx)" }}>{yen(e.amount)}</span>
      {isAdmin && (
        <button
          onClick={() => handleDelete(e.id, e.category, e.label)}
          className="ws-icon-chip-sm"
          style={{ width: 28, height: 28, background: "var(--ws-dgs)", color: "var(--ws-dg)", border: "none", cursor: "pointer" }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );

  return (
    <div className="ws-fade">
      <div className="flex items-center justify-between mb-1">
        <h2 className="hos-title">会計報告</h2>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold"
          style={{ background: "var(--ws-s2)", color: "var(--ws-tx)", border: "1px solid var(--ws-bd)", cursor: "pointer" }}
        >
          <Printer size={14} />
          PDF出力
        </button>
      </div>
      <p className="hos-caption mb-5">物品販売の収支を、生徒会への報告用にまとめます</p>

      {/* Summary */}
      <div className="ws-card p-5 mb-4">
        <div className="hos-subtitle mb-3">最終集計</div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between"><span className="hos-body">総売上</span><span className="font-number font-bold">{yen(totals.totalSales)}</span></div>
          <div className="flex justify-between"><span className="hos-body">− 仕入れ支出</span><span className="font-number" style={{ color: "var(--ws-dg)" }}>−{yen(totals.purchaseTotal)}</span></div>
          <hr className="ws-sep" />
          <div className="flex justify-between"><span className="hos-subtitle" style={{ fontSize: 14 }}>粗利益</span><span className="font-number font-extrabold">{yen(totals.grossProfit)}</span></div>
          <div className="flex justify-between"><span className="hos-body">− 利益からの控除</span><span className="font-number" style={{ color: "var(--ws-dg)" }}>−{yen(totals.deductionTotal)}</span></div>
          <hr className="ws-sep" />
          <div className="flex justify-between items-center">
            <span className="hos-subtitle" style={{ fontSize: 15 }}>生徒会への還元額</span>
            <span className="font-number font-extrabold" style={{ fontSize: 20, color: "var(--ws-sc)" }}>{yen(totals.netProfit)}</span>
          </div>
        </div>
      </div>

      {/* Loan */}
      <div className="ws-section-label">貸付金（40,000円）</div>
      <div className="ws-card p-5 mb-2">
        <div className="flex items-center gap-3 mb-3">
          <div className="ws-icon-chip" style={{ background: "var(--ws-secc)", color: "var(--ws-onsecc)" }}>
            <Landmark size={19} />
          </div>
          <div className="flex-1">
            <div className="hos-caption">返済状況</div>
            <div className="font-number font-extrabold" style={{ fontSize: 17 }}>
              {yen(totals.loanRepaid)} <span className="hos-caption">/ {yen(LOAN_AMOUNT)}</span>
            </div>
          </div>
          <span
            className="ws-badge"
            style={{
              background: totals.loanRemaining <= 0 ? "var(--ws-scg)" : "var(--ws-wns)",
              color: totals.loanRemaining <= 0 ? "var(--ws-sc)" : "var(--ws-warn)",
            }}
          >
            {totals.loanRemaining <= 0 ? "返済完了" : `残り${yen(totals.loanRemaining)}`}
          </span>
        </div>
        <EntryForm placeholder="例：生徒会へ返済" onSubmit={(l, a, n) => handleAdd("loan_repay", l, a, n)} />
        {loanRepayments.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2">
            {loanRepayments.map((e: any) => <EntryRow key={e.id} e={e} />)}
          </div>
        )}
      </div>

      {/* Purchases */}
      <div className="ws-section-label">仕入れ支出</div>
      <div className="flex flex-col gap-2 mb-2">
        <EntryForm placeholder="例：たこ焼き粉・食材一式" onSubmit={(l, a, n) => handleAdd("purchase", l, a, n)} />
        {purchases.map((e: any) => <EntryRow key={e.id} e={e} />)}
        {purchases.length === 0 && <div className="hos-caption text-center py-2">まだ記録がありません</div>}
      </div>

      {/* Deductions */}
      <div className="ws-section-label">利益から差し引ける費目（保菌検査代・生徒からの集金・両替手数料など）</div>
      <div className="flex flex-col gap-2 mb-2">
        <EntryForm placeholder="例：保菌検査代" onSubmit={(l, a, n) => handleAdd("deduction", l, a, n)} />
        {deductions.map((e: any) => <EntryRow key={e.id} e={e} />)}
        {deductions.length === 0 && <div className="hos-caption text-center py-2">まだ記録がありません</div>}
      </div>

      {/* ===== Print-only report (hidden on screen, shown via @media print) ===== */}
      <div className="print-report">
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>物品販売 会計報告書</h1>
        <p style={{ fontSize: 12, color: "#555", marginBottom: 24 }}>
          作成日：{new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 20, marginBottom: 8, borderBottom: "2px solid #333", paddingBottom: 4 }}>
          最終集計
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            <tr><td style={{ padding: "4px 0" }}>総売上</td><td style={{ textAlign: "right" }}>{yen(totals.totalSales)}</td></tr>
            <tr><td style={{ padding: "4px 0" }}>仕入れ支出</td><td style={{ textAlign: "right" }}>−{yen(totals.purchaseTotal)}</td></tr>
            <tr style={{ borderTop: "1px solid #ccc" }}><td style={{ padding: "6px 0", fontWeight: 700 }}>粗利益</td><td style={{ textAlign: "right", fontWeight: 700 }}>{yen(totals.grossProfit)}</td></tr>
            <tr><td style={{ padding: "4px 0" }}>利益からの控除</td><td style={{ textAlign: "right" }}>−{yen(totals.deductionTotal)}</td></tr>
            <tr style={{ borderTop: "2px solid #333" }}>
              <td style={{ padding: "8px 0", fontWeight: 800, fontSize: 15 }}>生徒会への還元額</td>
              <td style={{ textAlign: "right", fontWeight: 800, fontSize: 15 }}>{yen(totals.netProfit)}</td>
            </tr>
          </tbody>
        </table>

        <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 24, marginBottom: 8, borderBottom: "2px solid #333", paddingBottom: 4 }}>
          貸付金の返済状況
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            <tr><td style={{ padding: "4px 0" }}>貸付金</td><td style={{ textAlign: "right" }}>{yen(LOAN_AMOUNT)}</td></tr>
            <tr><td style={{ padding: "4px 0" }}>返済済み</td><td style={{ textAlign: "right" }}>{yen(totals.loanRepaid)}</td></tr>
            <tr style={{ borderTop: "1px solid #ccc" }}><td style={{ padding: "6px 0", fontWeight: 700 }}>残額</td><td style={{ textAlign: "right", fontWeight: 700 }}>{yen(totals.loanRemaining)}</td></tr>
          </tbody>
        </table>

        <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 24, marginBottom: 8, borderBottom: "2px solid #333", paddingBottom: 4 }}>
          仕入れ支出 明細
        </h2>
        <PrintTable rows={purchases} />

        <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 24, marginBottom: 8, borderBottom: "2px solid #333", paddingBottom: 4 }}>
          利益からの控除 明細
        </h2>
        <PrintTable rows={deductions} />

        <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 24, marginBottom: 8, borderBottom: "2px solid #333", paddingBottom: 4 }}>
          貸付金 返済明細
        </h2>
        <PrintTable rows={loanRepayments} />
      </div>
    </div>
  );
}

function PrintTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 12, color: "#777" }}>記録なし</p>;
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #999" }}>
          <th style={{ textAlign: "left", padding: "3px 0" }}>日付</th>
          <th style={{ textAlign: "left", padding: "3px 0" }}>項目</th>
          <th style={{ textAlign: "left", padding: "3px 0" }}>メモ</th>
          <th style={{ textAlign: "right", padding: "3px 0" }}>金額</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any) => (
          <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
            <td style={{ padding: "3px 0" }}>{new Date(r.createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</td>
            <td style={{ padding: "3px 0" }}>{r.label}</td>
            <td style={{ padding: "3px 0", color: "#555" }}>{r.note || ""}</td>
            <td style={{ padding: "3px 0", textAlign: "right" }}>{yen(r.amount)}</td>
          </tr>
        ))}
        <tr>
          <td colSpan={3} style={{ padding: "5px 0", fontWeight: 700, textAlign: "right" }}>合計</td>
          <td style={{ padding: "5px 0", fontWeight: 700, textAlign: "right" }}>{yen(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}
