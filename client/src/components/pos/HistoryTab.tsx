import { useMemo } from "react";
import { Ban, Trash2, Receipt } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MEMBERS } from "@shared/posTypes";

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
  const utils = trpc.useUtils();

  const handleVoid = async (tx: any) => {
    if (!confirm("この取引を取り消しますか？")) return;
    try {
      await voidTx.mutateAsync({ id: tx.id });
      addLog("void_tx", `取引#${tx.id} (${yen(tx.total)}) を取消`);
      toast.success("取引を取り消しました");
      utils.transaction.list.invalidate();
    } catch {
      toast.error("取消に失敗しました");
    }
  };

  const handleDelete = async (tx: any) => {
    if (!confirm("この取引を完全に削除しますか？\nこの操作は取り消せません。")) return;
    try {
      await deleteTx.mutateAsync({ id: tx.id });
      addLog("delete_tx", `取引#${tx.id} (${yen(tx.total)}) を削除`);
      toast.success("取引を削除しました");
      utils.transaction.list.invalidate();
    } catch {
      toast.error("削除に失敗しました");
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
      <h2 className="hos-title mb-4">取引履歴</h2>

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
                const items = tx.items as any[] || [];
                const memberName = MEMBERS[Number(tx.operator)]?.name || "";
                return (
                  <div
                    key={tx.id}
                    className={`ws-card ws-fade ws-stagger-${Math.min(i + 1, 8)} p-4 flex gap-3.5`}
                    style={{
                      opacity: tx.voided ? 0.45 : 1,
                    }}
                  >
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
                        {isAdmin && !tx.voided && (
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
                              onClick={() => handleDelete(tx)}
                              className="ws-icon-chip-sm"
                              style={{ width: 28, height: 28, background: "var(--ws-dgs)", color: "var(--ws-dg)", border: "none", cursor: "pointer" }}
                              title="削除"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                        {isAdmin && tx.voided && (
                          <button
                            onClick={() => handleDelete(tx)}
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
