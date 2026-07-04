import { AlertTriangle, PackagePlus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  products: any[];
  getStock: (id: number) => number;
  initialMap: Record<number, number>;
  isAdmin: boolean;
  addLog: (action: string, detail?: string) => void;
  operator: string;
  operatorName: string;
}

export default function InventoryTab({ products, getStock, initialMap, isAdmin, addLog, operator, operatorName }: Props) {
  const createRestock = trpc.restock.create.useMutation();
  const utils = trpc.useUtils();

  const handleRestock = async (productId: number, amount: number) => {
    try {
      await createRestock.mutateAsync({ productId, amount });
      const product = products.find((p) => p.id === productId);
      addLog("restock", `${product?.name} +${amount}個`);
      toast.success("補充しました");
      utils.restock.list.invalidate();
    } catch {
      toast.error("補充に失敗しました");
    }
  };

  return (
    <div className="ws-fade">
      <h2 className="hos-title mb-4">在庫管理</h2>
      {/* HarmonyOS repeated-layout grid: single column on phones, two columns
          from the md breakpoint up, per the responsive grid guideline. */}
      <div className="grid md:grid-cols-2 gap-2.5">
        {products.map((p, i) => {
          const s = getStock(p.id);
          const inBase = initialMap[p.id] || p.initialStock || 1;
          const out = s <= 0;
          const low = s > 0 && s <= (p.threshold || 0);
          const pct = Math.max(0, Math.min(100, Math.round((s / inBase) * 100)));
          const dotColor = out ? "var(--ws-dg)" : low ? "var(--ws-warn)" : "var(--ws-sc)";
          return (
            <div key={p.id} className={`ws-card ws-fade ws-stagger-${Math.min(i + 1, 8)} flex items-center gap-3.5 p-4`}>
              <div className="ws-icon-chip" style={{ background: "var(--ws-s2)" }}>{p.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="ws-dot" style={{ background: dotColor }} />
                  <span className="hos-subtitle truncate">{p.name}</span>
                  {out && (
                    <span className="ws-badge" style={{ background: "var(--ws-dgs)", color: "var(--ws-dg)" }}>
                      <AlertTriangle size={10} />在庫切れ
                    </span>
                  )}
                  {low && (
                    <span className="ws-badge" style={{ background: "var(--ws-wns)", color: "var(--ws-warn)" }}>
                      <AlertTriangle size={10} />残りわずか
                    </span>
                  )}
                </div>
                {/* Progress bar */}
                <div className="h-[5px] rounded-full overflow-hidden mb-1.5" style={{ background: "var(--ws-s3)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: pct + "%", background: dotColor }}
                  />
                </div>
                <div className="hos-caption">
                  残 <span className="font-number font-bold" style={{ color: "var(--ws-tx)" }}>{s}</span> / {inBase}　警告 {p.threshold || 0}以下
                </div>
              </div>
              {isAdmin && (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => handleRestock(p.id, 10)}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] font-bold"
                    style={{ background: "var(--ws-ac)", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    <PackagePlus size={11} />+10
                  </button>
                  <button
                    onClick={() => handleRestock(p.id, 50)}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] font-bold"
                    style={{ background: "var(--ws-s2)", border: "1.5px solid var(--ws-bd)", color: "var(--ws-ts)", cursor: "pointer" }}
                  >
                    +50
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
