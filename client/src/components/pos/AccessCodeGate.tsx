import { useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface Props {
  onVerified: () => void;
}

export default function AccessCodeGate({ onVerified }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const verifyMutation = trpc.accessCode.verify.useMutation();

  const handleSubmit = async () => {
    if (!code.trim()) {
      setError("合言葉を入力してください");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await verifyMutation.mutateAsync({ code: code.trim() });
      if (result.success) {
        localStorage.setItem("pos_access_verified", "1");
        onVerified();
      } else {
        setError(result.error || "合言葉が違います");
        setCode("");
      }
    } catch {
      setError("通信エラーが発生しました");
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--ws-bg)", fontFamily: "var(--font-body)" }}
    >
      <div className="w-full max-w-[380px] ws-fade">
        {/* Logo */}
        <div className="text-center mb-7">
          <div className="ws-icon-chip mx-auto mb-3" style={{ background: "radial-gradient(circle at 32% 28%, var(--ws-secc) 0%, var(--ws-secc-deep) 100%)", color: "var(--ws-onsecc)", width: 56, height: 56, fontSize: 26 }}>
            🏪
          </div>
          <h1 className="hos-title" style={{ fontSize: 20 }}>FES POS</h1>
          <p className="hos-caption mt-1">文化祭 物販管理システム</p>
        </div>

        <div className="ws-card p-7">
          <label className="flex items-center gap-1.5 hos-caption mb-2">
            <Shield size={13} />
            合言葉
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="合言葉を入力"
            className="ws-input text-center"
            style={{ fontSize: 20, fontWeight: 700, padding: "14px 16px" }}
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 mt-3.5 font-bold text-[15px]"
            style={{
              background: loading ? "var(--ws-td)" : "var(--ws-ac)",
              color: "#fff",
              padding: 14,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "確認中..." : "入場する"}
          </button>

          {error && (
            <p className="text-xs text-center mt-3 font-bold" style={{ color: "var(--ws-dg)" }}>
              {error}
            </p>
          )}

          <p className="hos-caption text-center mt-4">
            クラスメンバーに共有された合言葉を入力してください
          </p>
        </div>
      </div>
    </div>
  );
}
