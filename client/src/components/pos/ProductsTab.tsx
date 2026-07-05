import { useState, type MouseEvent } from "react";
import { Plus, Pencil, Trash2, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const yen = (n: number) => "¥" + Math.round(n || 0).toLocaleString("ja-JP");

interface Props {
  products: any[];
  addLog: (action: string, detail?: string) => void;
  operator: string;
  operatorName: string;
}

export default function ProductsTab({ products, addLog, operator, operatorName }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formOrigin, setFormOrigin] = useState({ x: 0, y: 0 });
  const [form, setForm] = useState({ name: "", emoji: "📦", price: 0, cost: 0, initialStock: 0, threshold: 10, displayOrder: 0 });

  const createProduct = trpc.product.create.useMutation();
  const updateProduct = trpc.product.update.useMutation();
  const deleteProduct = trpc.product.delete.useMutation();
  const resetAll = trpc.resetAll.useMutation();
  const utils = trpc.useUtils();

  const handleSubmit = async () => {
    if (!form.name || form.price <= 0) {
      toast.error("商品名と価格は必須です");
      return;
    }
    try {
      if (editId) {
        await updateProduct.mutateAsync({ id: editId, ...form });
        addLog("edit_product", `${form.emoji} ${form.name}を編集`);
        toast.success("商品を更新しました");
      } else {
        await createProduct.mutateAsync({ ...form });
        addLog("add_product", `${form.emoji} ${form.name}を追加`);
        toast.success("商品を追加しました");
      }
      setShowForm(false);
      setEditId(null);
      setForm({ name: "", emoji: "📦", price: 0, cost: 0, initialStock: 0, threshold: 10, displayOrder: 0 });
      utils.product.list.invalidate();
    } catch {
      toast.error("操作に失敗しました");
    }
  };

  const handleEdit = (e: MouseEvent, p: any) => {
    setFormOrigin({ x: e.clientX, y: e.clientY });
    setEditId(p.id);
    setForm({
      name: p.name,
      emoji: p.emoji,
      price: p.price,
      cost: p.cost,
      initialStock: p.initialStock,
      threshold: p.threshold,
      displayOrder: p.displayOrder,
    });
    setShowForm(true);
  };

  const handleDelete = async (p: any) => {
    if (!confirm(`「${p.name}」を削除しますか？`)) return;
    try {
      await deleteProduct.mutateAsync({ id: p.id });
      addLog("delete_product", `${p.emoji} ${p.name}を削除`);
      toast.success("商品を削除しました");
      utils.product.list.invalidate();
    } catch {
      toast.error("削除に失敗しました");
    }
  };

  const handleReset = async () => {
    if (!confirm("全データ（取引・補充・商品）をリセットしますか？\nこの操作は取り消せません。")) return;
    if (!confirm("本当にリセットしますか？")) return;
    try {
      await resetAll.mutateAsync();
      addLog("reset_all", "全データリセット実行");
      toast.success("全データをリセットしました");
      utils.product.list.invalidate();
      utils.transaction.list.invalidate();
      utils.restock.list.invalidate();
      utils.activityLog.list.invalidate();
    } catch {
      toast.error("リセットに失敗しました");
    }
  };

  return (
    <div className="ws-fade">
      <div className="flex items-center justify-between mb-4">
        <h2 className="hos-title">商品管理</h2>
        <div className="flex gap-2">
          <button
            onClick={(e) => { setFormOrigin({ x: e.clientX, y: e.clientY }); setShowForm(true); setEditId(null); setForm({ name: "", emoji: "📦", price: 0, cost: 0, initialStock: 0, threshold: 10, displayOrder: 0 }); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold"
            style={{ background: "var(--ws-ac)", color: "#fff", border: "none", cursor: "pointer" }}
          >
            <Plus size={13} />追加
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold"
            style={{ background: "var(--ws-dgs)", color: "var(--ws-dg)", border: "1px solid var(--ws-dg)", cursor: "pointer" }}
          >
            <RotateCcw size={13} />リセット
          </button>
        </div>
      </div>

      {/* Product Form — HarmonyOS-style bottom sheet on mobile, centered on desktop */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex justify-center items-end md:items-center"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
        >
          <div
            className="ws-sheet-pop ws-glass-sheet w-full md:max-w-md max-h-[92vh] overflow-y-auto rounded-t-[28px] md:rounded-[28px] p-6"
            style={{
              transformOrigin: `${formOrigin.x}px ${formOrigin.y}px`,
            }}
          >
            <div className="w-9 h-1 rounded-full mx-auto mb-5 md:hidden" style={{ background: "var(--ws-bd)" }} />
            <h3 className="hos-subtitle mb-4">{editId ? "商品を編集" : "商品を追加"}</h3>
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <div className="w-20">
                  <label className="hos-caption mb-1 block">絵文字</label>
                  <input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className="ws-input text-center text-xl" />
                </div>
                <div className="flex-1">
                  <label className="hos-caption mb-1 block">商品名</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="ws-input" placeholder="商品名" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="hos-caption mb-1 block">販売価格</label>
                  <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className="ws-input font-number" />
                </div>
                <div>
                  <label className="hos-caption mb-1 block">原価</label>
                  <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} className="ws-input font-number" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="hos-caption mb-1 block">初期在庫</label>
                  <input type="number" value={form.initialStock} onChange={(e) => setForm({ ...form, initialStock: Number(e.target.value) })} className="ws-input font-number" />
                </div>
                <div>
                  <label className="hos-caption mb-1 block">警告閾値</label>
                  <input type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} className="ws-input font-number" />
                </div>
                <div>
                  <label className="hos-caption mb-1 block">表示順</label>
                  <input type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })} className="ws-input font-number" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowForm(false); setEditId(null); }}
                className="flex-1 py-2.5 text-sm font-bold"
                style={{ background: "var(--ws-s2)", border: "1.5px solid var(--ws-bd)", color: "var(--ws-ts)", cursor: "pointer" }}
              >
                キャンセル
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-2.5 text-sm font-bold"
                style={{ background: "var(--ws-ac)", color: "#fff", border: "none", cursor: "pointer" }}
              >
                {editId ? "更新" : "追加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product List — icon-chip leading element + primary/secondary/tertiary hierarchy */}
      <div className="grid md:grid-cols-2 gap-2.5">
        {products.map((p, i) => (
          <div key={p.id} className={`ws-card ws-fade ws-stagger-${Math.min(i + 1, 8)} p-4 flex items-center gap-3.5`}>
            <div className="ws-icon-chip" style={{ background: "var(--ws-s2)" }}>{p.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="hos-subtitle truncate">{p.name}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-number text-[13px] font-extrabold" style={{ color: "var(--ws-ac)" }}>{yen(p.price)}</span>
                <span className="hos-caption">原価 {yen(p.cost)}</span>
              </div>
              <div className="hos-caption mt-1">
                初期在庫 {p.initialStock} ・ 警告 {p.threshold}以下
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={(e) => handleEdit(e, p)}
                className="ws-icon-chip-sm"
                style={{ background: "var(--ws-s2)", color: "var(--ws-ts)", border: "none", cursor: "pointer" }}
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => handleDelete(p)}
                className="ws-icon-chip-sm"
                style={{ background: "var(--ws-dgs)", color: "var(--ws-dg)", border: "none", cursor: "pointer" }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
