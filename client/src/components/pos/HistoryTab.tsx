import { Ban, Trash2 } from "lucide-react";
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

  return (
    <div className="ws-fade">
      <h2 className="text-[22px] font-extrabold mb-4" style={{ color: "var(--ws-tx)", fontFamily: "var(--font-heading)" }}>
        取引履歴
      </h2>

      {transactions.length === 0 ? (
        <div className="ws-card p-8 text-center text-sm" style={{ color: "var(--ws-td)" }}>
          取引データがありません
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {transactions.map((tx: any) => {
            const items = tx.items as any[] || [];
            const memberName = MEMBERS[Number(tx.operator)]?.name || "";
            return (
              <div
                key={tx.id}
                className="ws-card p-4"
                style={{
                  borderWidth: "1.5px",
                  opacity: tx.voided ? 0.4 : 1,
                  textDecoration: tx.voided ? "line-through" : "none",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-number text-[11px] font-bold" style={{ color: "var(--ws-ts)" }}>
                      #{tx.id}
                    </span>
                    <span className="font-number text-[11px]" style={{ color: "var(--ws-ts)" }}>
                      {new Date(tx.createdAt).toLocaleString("ja-JP", {
                        month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    <span className="text-[11px] font-bold" style={{ color: "var(--ws-tx)" }}>
                      {tx.operator} {memberName && `(${memberName})`}
                    </span>
                    {tx.voided && (
                      <span className="ws-badge" style={{ background: "var(--ws-dgs)", color: "var(--ws-dg)" }}>
                        取消済
                      </span>
                    )}
                  </div>
                  {isAdmin && !tx.voided && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleVoid(tx)}
                        className="p-1.5 rounded-md"
                        style={{ background: "var(--ws-wns)", color: "var(--ws-warn)", border: "none", cursor: "pointer" }}
                        title="取消"
                      >
                        <Ban size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(tx)}
                        className="p-1.5 rounded-md"
                        style={{ background: "var(--ws-dgs)", color: "var(--ws-dg)", border: "none", cursor: "pointer" }}
                        title="削除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                  {isAdmin && tx.voided && (
                    <button
                      onClick={() => handleDelete(tx)}
                      className="p-1.5 rounded-md"
                      style={{ background: "var(--ws-dgs)", color: "var(--ws-dg)", border: "none", cursor: "pointer" }}
                      title="削除"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--ws-ts)" }}>
                  <span>
                    {items.map((it: any) => `${it.emoji}${it.name}×${it.qty}`).join("、")}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-[12px]">
                  <span className="font-number font-bold" style={{ color: "var(--ws-tx)" }}>
                    合計: {yen(tx.total)}
                  </span>
                  <span style={{ color: "var(--ws-ts)" }}>
                    預かり: {yen(tx.received)}
                  </span>
                  <span style={{ color: "var(--ws-sc)" }}>
                    釣銭: {yen(tx.changeAmount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
