import { useState } from "react";
import { X, Check } from "lucide-react";

const yen = (n: number) => "¥" + Math.round(n || 0).toLocaleString("ja-JP");

interface CartItem {
  id: number;
  name: string;
  emoji: string;
  price: number;
  qty: number;
}

interface Props {
  cartItems: CartItem[];
  cartTotal: number;
  onConfirm: (received: number) => void;
  onClose: () => void;
  submitting?: boolean;
  origin?: { x: number; y: number };
}

export default function CheckoutModal({ cartItems, cartTotal, onConfirm, onClose, submitting, origin }: Props) {
  const [received, setReceived] = useState("");
  const rec = Number(received) || 0;
  const enough = rec >= cartTotal;
  const changeAmt = rec - cartTotal;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center items-end md:items-center"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
    >
      <div
        className="ws-sheet-pop ws-glass-sheet w-full md:max-w-[30rem] max-h-[92vh] overflow-y-auto rounded-t-[28px] md:rounded-[28px] p-6"
        style={{
          transformOrigin: origin ? `${origin.x}px ${origin.y}px` : "center",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold" style={{ color: "var(--ws-tx)", fontFamily: "var(--font-heading)" }}>
            お会計
          </h3>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-lg p-[7px]"
            style={{ border: "1.5px solid var(--ws-bd)", background: "transparent", color: "var(--ws-ts)", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Items */}
        <div className="rounded-[10px] p-3.5 mb-4" style={{ background: "var(--ws-s2)", border: "1.5px solid var(--ws-bd)" }}>
          {cartItems.map((it) => (
            <div key={it.id} className="flex justify-between text-[13px] py-0.5">
              <span style={{ color: "var(--ws-ts)" }}>
                {it.emoji} {it.name} ×{it.qty}
              </span>
              <span className="font-number font-bold" style={{ color: "var(--ws-tx)" }}>
                {yen(it.price * it.qty)}
              </span>
            </div>
          ))}
        </div>

        {/* Total & Input */}
        <div className="rounded-xl p-4 mb-4" style={{ background: "var(--ws-s2)", border: "1.5px solid var(--ws-bd)" }}>
          <div className="flex justify-between items-end mb-3.5">
            <span className="text-xs font-bold" style={{ color: "var(--ws-ts)" }}>合計</span>
            <span className="font-number" style={{ fontSize: 40, fontWeight: 800, color: "var(--ws-tx)", letterSpacing: "-1.5px" }}>
              {yen(cartTotal)}
            </span>
          </div>
          <label className="text-xs font-bold" style={{ color: "var(--ws-ts)" }}>預かり金額</label>
          <input
            type="number"
            inputMode="numeric"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            placeholder="0"
            className="ws-input font-number mt-2"
            style={{ fontSize: 30, fontWeight: 800, textAlign: "right", padding: "13px 16px" }}
            autoFocus
          />
          {/* Quick amounts */}
          <div className="grid grid-cols-4 gap-[7px] mt-2.5">
            <button
              onClick={() => setReceived(String(cartTotal))}
              className="flex items-center justify-center rounded-lg py-2 text-[11px] font-bold"
              style={{ background: "var(--ws-sc)", color: "#fff", border: "none", cursor: "pointer" }}
            >
              ちょうど
            </button>
            {[1000, 5000, 10000].map((v) => (
              <button
                key={v}
                onClick={() => setReceived(String(v))}
                className="flex items-center justify-center rounded-lg py-2 text-[11px] font-bold font-number"
                style={{ background: "var(--ws-s3)", border: "1.5px solid var(--ws-bd)", color: "var(--ws-ts)", cursor: "pointer" }}
              >
                {yen(v)}
              </button>
            ))}
          </div>
        </div>

        {/* Change */}
        <div className="flex justify-between items-end mb-4">
          <span className="text-xs font-bold" style={{ color: "var(--ws-ts)" }}>お釣り</span>
          {enough ? (
            <span className="font-number" style={{ fontSize: 42, fontWeight: 800, color: "var(--ws-sc)", letterSpacing: "-1.5px" }}>
              {yen(changeAmt)}
            </span>
          ) : (
            <span className="font-number text-base font-bold" style={{ color: "var(--ws-dg)" }}>
              不足 {yen(cartTotal - rec)}
            </span>
          )}
        </div>

        <button
          onClick={() => enough && !submitting && onConfirm(rec)}
          disabled={!enough || submitting}
          className="w-full flex items-center justify-center gap-1.5 rounded-[10px] font-bold text-[15px]"
          style={{
            background: "var(--ws-sc)",
            color: "#fff",
            padding: 15,
            opacity: enough && !submitting ? 1 : 0.4,
            cursor: enough && !submitting ? "pointer" : "not-allowed",
            border: "none",
          }}
        >
          <Check size={18} />
          {submitting ? "処理中..." : "会計を確定する"}
        </button>
      </div>
    </div>
  );
}
