import { useState } from "react";
import { KeyRound, Trash2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MEMBERS, ID_MIN, ID_MAX } from "@shared/posTypes";

interface Props {
  addLog: (action: string, detail?: string) => void;
  operator: string;
}

export default function PinManagerTab({ addLog, operator }: Props) {
  const pinsQuery = trpc.pin.list.useQuery();
  const resetPin = trpc.pin.reset.useMutation();
  const deletePin = trpc.pin.delete.useMutation();
  const utils = trpc.useUtils();

  const [resetId, setResetId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");

  const pins = pinsQuery.data || [];
  const pinMap = new Map(pins.map((p: any) => [p.memberId, p.pin]));

  const members = Array.from({ length: ID_MAX - ID_MIN + 1 }, (_, i) => {
    const id = String(ID_MIN + i);
    return {
      id,
      name: MEMBERS[ID_MIN + i]?.name || "",
      hasPin: pinMap.has(id),
    };
  });

  const handleReset = async (memberId: string) => {
    if (newPin.length !== 4) {
      toast.error("4桁のPINを入力してください");
      return;
    }
    try {
      await resetPin.mutateAsync({ memberId, pin: newPin });
      toast.success("PINをリセットしました");
      setResetId(null);
      setNewPin("");
      utils.pin.list.invalidate();
    } catch {
      toast.error("リセットに失敗しました");
    }
  };

  const handleDelete = async (memberId: string) => {
    if (!confirm(`メンバー${memberId}のPINを削除しますか？`)) return;
    try {
      await deletePin.mutateAsync({ memberId });
      toast.success("PINを削除しました");
      utils.pin.list.invalidate();
    } catch {
      toast.error("削除に失敗しました");
    }
  };

  return (
    <div className="ws-fade">
      <h2 className="hos-title mb-5">PIN管理</h2>

      <div className="grid md:grid-cols-2 gap-2">
        {members.map((m, i) => (
          <div key={m.id} className={`ws-card ws-fade ws-stagger-${Math.min(i % 8 + 1, 8)} p-3 flex items-center gap-2.5`}>
            <div className="ws-icon-chip-sm font-number font-extrabold" style={{ background: "var(--ws-s2)", color: "var(--ws-tx)", fontSize: 12 }}>
              {m.id.slice(-2)}
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm truncate" style={{ color: "var(--ws-tx)" }}>
                {m.name}
              </span>
              <span
                className="ws-badge text-[10px]"
                style={{
                  background: m.hasPin ? "var(--ws-scg)" : "var(--ws-s3)",
                  color: m.hasPin ? "var(--ws-sc)" : "var(--ws-td)",
                }}
              >
                <span className="ws-dot" style={{ width: 5, height: 5, background: m.hasPin ? "var(--ws-sc)" : "var(--ws-td)" }} />
                {m.hasPin ? "設定済" : "未設定"}
              </span>
            </div>

            {resetId === m.id ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="新PIN"
                  className="ws-input font-number w-20 text-center text-sm"
                  style={{ padding: "4px 8px" }}
                  autoFocus
                />
                <button
                  onClick={() => handleReset(m.id)}
                  className="p-1.5 text-[11px] font-bold"
                  style={{ background: "var(--ws-ac)", color: "#fff", border: "none", cursor: "pointer" }}
                >
                  確定
                </button>
                <button
                  onClick={() => { setResetId(null); setNewPin(""); }}
                  className="p-1.5 text-[11px]"
                  style={{ background: "var(--ws-s2)", border: "1px solid var(--ws-bd)", color: "var(--ws-ts)", cursor: "pointer" }}
                >
                  取消
                </button>
              </div>
            ) : (
              m.hasPin && (
                <div className="flex gap-1">
                  <button
                    onClick={() => { setResetId(m.id); setNewPin(""); }}
                    className="ws-icon-chip-sm"
                    style={{ width: 28, height: 28, background: "var(--ws-s2)", color: "var(--ws-ts)", border: "none", cursor: "pointer" }}
                    title="PINリセット"
                  >
                    <RefreshCw size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="ws-icon-chip-sm"
                    style={{ width: 28, height: 28, background: "var(--ws-dgs)", color: "var(--ws-dg)", border: "none", cursor: "pointer" }}
                    title="PIN削除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
