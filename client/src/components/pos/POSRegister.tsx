import { useState, useCallback, useRef } from "react";
import { AlertTriangle, Plus, Minus, Trash2, Receipt, Coins } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { TransactionItem } from "@shared/posTypes";
import CheckoutModal from "./CheckoutModal";

const yen = (n: number) => "¥" + Math.round(n || 0).toLocaleString("ja-JP");

interface CartItem {
  id: number;
  name: string;
  emoji: string;
  price: number;
  cost: number;
  qty: number;
}

interface Props {
  products: any[];
  getStock: (id: number) => number;
  operator: string;
  operatorName: string;
  addLog: (action: string, detail?: string) => void;
  onSync: () => void;
}

export default function POSRegister({ products, getStock, operator, operatorName, addLog, onSync }: Props) {
  const [cart, setCart] = useState<Record<number, CartItem>>({});
  const [showCheckout, setShowCheckout] = useState(false);

  const createTx = trpc.transaction.create.useMutation();
  const utils = trpc.useUtils();
  const submittingRef = useRef(false);

  const cartItems = Object.values(cart).filter((c) => c.qty > 0);
  const cartTotal = cartItems.reduce((s, it) => s + it.price * it.qty, 0);
  const cartCount = cartItems.reduce((s, it) => s + it.qty, 0);

  const addToCart = (p: any) => {
    const stock = getStock(p.id);
    const current = cart[p.id]?.qty || 0;
    if (current >= stock) {
      toast.error("在庫が不足しています");
      return;
    }
    setCart((prev) => ({
      ...prev,
      [p.id]: {
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        price: p.price,
        cost: p.cost,
        qty: current + 1,
      },
    }));
  };

  const changeQty = (id: number, delta: number) => {
    setCart((prev) => {
      const item = prev[id];
      if (!item) return prev;
      const newQty = item.qty + delta;
      if (newQty <= 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      if (delta > 0) {
        const stock = getStock(id);
        if (newQty > stock) {
          toast.error("在庫が不足しています");
          return prev;
        }
      }
      return { ...prev, [id]: { ...item, qty: newQty } };
    });
  };

  const removeFromCart = (id: number) => {
    setCart((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleCheckoutConfirm = async (received: number) => {
    if (submittingRef.current) return; // prevent double submission (double-tap)
    submittingRef.current = true;
    const items: TransactionItem[] = cartItems.map((it) => ({
      product_id: it.id,
      name: it.name,
      emoji: it.emoji,
      price: it.price,
      cost: it.cost,
      qty: it.qty,
    }));

    try {
      await createTx.mutateAsync({
        items,
        total: cartTotal,
        received,
        changeAmount: received - cartTotal,
      });
      addLog("checkout", `合計${yen(cartTotal)} (${cartCount}点)`);
      setCart({});
      setShowCheckout(false);
      toast.success("会計完了！");
      utils.transaction.list.invalidate();
    } catch {
      toast.error("会計に失敗しました");
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <div className="ws-fade">
      <h2 className="hos-title mb-4">
        レジ
      </h2>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Product Grid */}
        <div className="flex-1">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-3">
            {products.map((p) => {
              const s = getStock(p.id);
              const out = s <= 0;
              const low = s > 0 && s <= (p.threshold || 0);
              const inCart = (cart[p.id]?.qty || 0) > 0;
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={out}
                  className={`ws-card ws-card-interactive ${inCart ? "ws-card-active" : ""} text-left relative w-full`}
                  style={{
                    padding: 18,
                    opacity: out ? 0.3 : 1,
                    filter: out ? "grayscale(1)" : "none",
                    cursor: out ? "not-allowed" : "pointer",
                    borderWidth: "1.5px",
                  }}
                >
                  <span
                    className="ws-badge absolute top-2.5 right-2.5 text-[10px]"
                    style={{
                      background: out ? "var(--ws-dgs)" : low ? "var(--ws-wns)" : "var(--ws-s3)",
                      color: out ? "var(--ws-dg)" : low ? "var(--ws-warn)" : "var(--ws-ts)",
                    }}
                  >
                    {out ? "売切" : "残" + s}
                  </span>
                  <div className="ws-icon-chip mb-2.5" style={{ background: "var(--ws-s2)" }}>{p.emoji}</div>
                  <div
                    className="hos-subtitle leading-tight mb-1 flex items-center gap-1"
                    style={{ fontSize: 13, color: low ? "var(--ws-warn)" : "var(--ws-tx)" }}
                  >
                    {p.name}
                    {low && <AlertTriangle size={11} style={{ color: "var(--ws-warn)", flexShrink: 0 }} />}
                  </div>
                  <div className="font-number text-lg font-extrabold" style={{ color: "var(--ws-ac)" }}>
                    {yen(p.price)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cart Panel */}
        <div className="md:w-[320px]">
          <div className="ws-card p-5 md:sticky md:top-4" style={{ borderWidth: "1.5px" }}>
            <div className="flex items-center mb-4 pb-3.5" style={{ borderBottom: "1.5px solid var(--ws-bd)" }}>
              <Receipt size={15} style={{ color: "var(--ws-or)", marginRight: 8 }} />
              <span className="font-bold text-[13px]" style={{ color: "var(--ws-tx)", fontFamily: "var(--font-heading)" }}>
                カート
              </span>
              <span className="ws-badge ml-auto" style={{ background: "var(--ws-s3)", color: "var(--ws-ts)" }}>
                {cartCount}点
              </span>
            </div>

            {cartItems.length === 0 ? (
              <div className="text-center py-7 text-xs leading-relaxed" style={{ color: "var(--ws-td)" }}>
                商品をタップして追加
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 mb-4 max-h-[280px] overflow-y-auto">
                {cartItems.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 text-xs">
                    <span className="ws-icon-chip-sm" style={{ background: "var(--ws-s2)", fontSize: 13 }}>{it.emoji}</span>
                    <span className="flex-1 font-semibold truncate" style={{ color: "var(--ws-tx)" }}>
                      {it.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => changeQty(it.id, -1)}
                        className="w-6 h-6 flex items-center justify-center rounded-md"
                        style={{ background: "var(--ws-s2)", border: "1.5px solid var(--ws-bd)", color: "var(--ws-tx)", cursor: "pointer" }}
                      >
                        <Minus size={11} />
                      </button>
                      <span className="w-5 text-center font-bold font-number" style={{ color: "var(--ws-tx)" }}>
                        {it.qty}
                      </span>
                      <button
                        onClick={() => changeQty(it.id, 1)}
                        className="w-6 h-6 flex items-center justify-center rounded-md"
                        style={{ background: "var(--ws-s2)", border: "1.5px solid var(--ws-bd)", color: "var(--ws-tx)", cursor: "pointer" }}
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                    <span className="font-number w-[62px] text-right font-bold" style={{ color: "var(--ws-tx)" }}>
                      {yen(it.price * it.qty)}
                    </span>
                    <button onClick={() => removeFromCart(it.id)} style={{ color: "var(--ws-td)", cursor: "pointer", background: "none", border: "none" }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <hr className="ws-sep mb-3.5" />
            <div className="flex justify-between items-end mb-3.5">
              <span className="text-xs font-bold" style={{ color: "var(--ws-ts)" }}>合計</span>
              <span
                className="font-number font-extrabold"
                style={{ fontSize: 36, color: cartCount ? "var(--ws-tx)" : "var(--ws-td)", letterSpacing: "-1px" }}
              >
                {yen(cartTotal)}
              </span>
            </div>
            <button
              onClick={() => setShowCheckout(true)}
              disabled={!cartCount}
              className="w-full flex items-center justify-center gap-1.5 rounded-[10px] font-bold text-sm"
              style={{
                background: "var(--ws-sc)",
                color: "#fff",
                padding: "14px",
                opacity: cartCount ? 1 : 0.4,
                cursor: cartCount ? "pointer" : "not-allowed",
                border: "none",
              }}
            >
              <Coins size={17} />
              会計へ進む
            </button>
          </div>
        </div>
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <CheckoutModal
          cartItems={cartItems}
          cartTotal={cartTotal}
          onConfirm={handleCheckoutConfirm}
          onClose={() => setShowCheckout(false)}
          submitting={createTx.isPending}
        />
      )}
    </div>
  );
}
