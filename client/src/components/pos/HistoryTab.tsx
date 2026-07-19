import { useMemo, useState } from "react";
import { Ban, Trash2, Receipt, CheckSquare, Square, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MEMBERS } from "@shared/posTypes";
import { getErrorMessage } from "@/lib/errorMessage";
import { dissolveOut, dissolveRestore } from "@/lib/dissolve";

const yen = (n: number) => "¥" + Math.round(n || 0).toLocaleString("ja-JP");

interface Props {
  transactions: any[];
  isAdmin: boolean;
  addLog: (action: string, detail?: string) => void;
  operator: string;
}

export default function HistoryTab({ transactions, isAdmin, addLog, operator }: Props) {
  const voidTx = trpc.transaction.void.useMutation();
  const deleteTx = trpc.transaction.delete.useMutation();
  const deleteManyTx = trpc.transaction.deleteMany.useMutation();
  const utils = trpc.useUtils();

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allIds = useMemo(() => transactions.map((t: any) => t.id), [transactions]);
  const allSelected = allIds.length > 0 && selected.size === allIds.length;

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(allIds));
  };

  const exitSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const handleVoid = async (tx: any) => {
    if (!confirm("この取引を取り消しますか？")) return;
    try {
      // The server logs this action atomically now (server/routers.ts
      // transaction.void), so no client-side addLog call here — that used
      // to create a second, redundant log entry.
      await voidTx.mutateAsync({ id: tx.id });
      toast.success("取引を取り消しました");
      utils.transaction.list.invalidate();
    } catch (e) {
      toast.error(getErrorMessage(e, "取消に失敗しました"));
    }
  };

  const handleDelete = async (tx: any, e: React.MouseEvent) => {
    // Capture the row element synchronously before the event is recycled or
    // the confirm() dialog blocks.
    const row = (e.currentTarget as HTMLElement).closest(".ws-card") as HTMLElement | null;
    if (!confirm("この取引を完全に削除しますか？\nこの操作は取り消せません。")) return;
    try {
      // Run the dissolve animation in parallel with the network request so it
      // overlaps the round-trip; the row stays in the DOM (data unchanged)
      // until the animation completes, then invalidate removes it.
      const del = deleteTx.mutateAsync({ id: tx.id });
      if (row) await dissolveOut(row);
      await del;
      toast.success("取引を削除しました");
      utils.transaction.list.invalidate();
    } catch (e2) {
      if (row) dissolveRestore(row);
      toast.error(getErrorMessage(e2, "削除に失敗しました"));
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`選択した${ids.length}件の取引を完全に削除しますか？\nこの操作は取り消せません。`)) return;
    try {
      await deleteManyTx.mutateAsync({ ids });
      toast.success(`${ids.length}件の取引を削除しました`);
      utils.transaction.list.invalidate();
      exitSelecting();
    } catch (e) {
      toast.error(getErrorMessage(e, "削除に失敗しました"));
    }
  };

  // Group by calendar day (HarmonyOS list-grouping pattern) while
  // preserving the original ordering of the transactions array.
  const groups = useMemo(() => {
    const todayKey = new Date().toDateString();
    const map = new Map<string, { label: string; items: any[] }>();
    transactions.forEach((tx: any) => {
      const d = new Date(tx.createdAt);
      const dayKey = d.toDateString();
      const label = dayKey === todayKey
        ? "本日"
        : d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
      if (!map.has(dayKey)) map.set(dayKey, { label, items: [] });
      map.get(dayKey)!.items.push(tx);
    });
    return Array.from(map.values());
  }, [transactions]);

  return (
    <div className="ws-fade">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="hos-title">取引履歴</h2>
        {isAdmin && transactions.length > 0 && (
          selecting ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
                style={{ background: "var(--ws-s2)", color: "var(--ws-tx)", border: "1px solid var(--ws-bd)", cursor: "pointer" }}
              >
                {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                {allSelected ? "全解除" : "全選択"}
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={selected.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
                style={{
                  background: "var(--ws-dgs)",
                  color: "var(--ws-dg)",
                  border: "none",
                  cursor: selected.size === 0 ? "not-allowed" : "pointer",
                  opacity: selected.size === 0 ? 0.5 : 1,
                }}
              >
                <Trash2 size={13} />
                {selected.size}件を削除
              </button>
              <button
                onClick={exitSelecting}
                className="ws-icon-chip-sm"
                style={{ width: 30, height: 30, background: "var(--ws-s2)", color: "var(--ws-ts)", border: "none", cursor: "pointer" }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSelecting(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold"
              style={{ background: "var(--ws-s2)", color: "var(--ws-tx)", border: "1px solid var(--ws-bd)", cursor: "pointer" }}
            >
              <CheckSquare size={14} />
              選択
            </button>
          )
        )}
      </div>

      {transactions.length === 0 ? (
        <div className="ws-card p-8 text-center hos-body">
          取引データがありません
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.label}>
            <div className="ws-section-label">{group.label}</div>
            <div className="flex flex-col gap-2">
              {group.items.map((tx: any, i: number) => {
                const items = Array.isArray(tx.items) ? (tx.items as any[]) : [];
                const memberName = MEMBERS[Number(tx.operator)]?.name || "";
                return (
                  <div
                    key={tx.id}
                    className={`ws-card ws-fade ws-stagger-${Math.min(i + 1, 8)} p-4 flex gap-3.5`}
                    style={{
                      opacity: tx.voided ? 0.45 : 1,
                      cursor: selecting ? "pointer" : "default",
                      outline: selecting && selected.has(tx.id) ? "2px solid var(--ws-ac)" : "none",
                      outlineOffset: -1,
                    }}
                    onClick={() => selecting && toggleSelect(tx.id)}
                  >
                    {selecting && (
                      <div
                        className="ws-icon-chip-sm"
                        style={{
                          width: 26, height: 26, flexShrink: 0,
                          background: selected.has(tx.id) ? "var(--ws-ac)" : "var(--ws-s2)",
                          color: "#fff", border: "1px solid var(--ws-bd)",
                        }}
                      >
                        {selected.has(tx.id) && <CheckSquare size={13} />}
                      </div>
                    )}
                    <div className="ws-icon-chip-sm" style={{ background: tx.voided ? "var(--ws-dgs)" : "var(--ws-secc)", color: tx.voided ? "var(--ws-dg)" : "var(--ws-onsecc)" }}>
                      <Receipt size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-number font-extrabold" style={{ fontSize: 17, color: "var(--ws-tx)", textDecoration: tx.voided ? "line-through" : "none" }}>
                            {yen(tx.total)}
                          </span>
                          {tx.voided && (
                            <span className="ws-badge" style={{ background: "var(--ws-dgs)", color: "var(--ws-dg)" }}>取消済</span>
                          )}
                        </div>
                        {isAdmin && !tx.voided && !selecting && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleVoid(tx)}
                              className="ws-icon-chip-sm"
                              style={{ width: 28, height: 28, background: "var(--ws-wns)", color: "var(--ws-warn)", border: "none", cursor: "pointer" }}
                              title="取消"
                            >
                              <Ban size={12} />
                            </button>
                            <button
                              onClick={(e) => handleDelete(tx, e)}
                              className="ws-icon-chip-sm"
                              style={{ width: 28, height: 28, background: "var(--ws-dgs)", color: "var(--ws-dg)", border: "none", cursor: "pointer" }}
                              title="削除"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                        {isAdmin && tx.voided && !selecting && (
                          <button
                            onClick={(e) => handleDelete(tx, e)}
                            className="ws-icon-chip-sm"
                            style={{ width: 28, height: 28, background: "var(--ws-dgs)", color: "var(--ws-dg)", border: "none", cursor: "pointer" }}
                            title="削除"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <div className="hos-caption mb-1.5">
                        #{tx.id} ・ {new Date(tx.createdAt).toLocaleString("ja-JP", { hour: "2-digit", minute: "2-digit" })} ・ {tx.operator}{memberName && `(${memberName})`}
                      </div>
                      <div className="hos-body text-[12px] mb-1">
                        {items.map((it: any) => `${it.emoji}${it.name}×${it.qty}`).join("、")}
                      </div>
                      <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--ws-ts)" }}>
                        <span>預かり {yen(tx.received)}</span>
                        <span style={{ color: "var(--ws-sc)" }}>釣銭 {yen(tx.changeAmount)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
