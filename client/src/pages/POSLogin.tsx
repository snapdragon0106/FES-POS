import { useState, useEffect } from "react";
import { Lock, ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ID_MIN, ID_MAX, MEMBERS } from "@shared/posTypes";

interface Props {
  onLogin: (id: string, token: string, isNewPin: boolean) => void;
}

// 4-box PIN display: a transparent input captures keystrokes exactly as
// before, while four rounded boxes show fill progress — the same pattern
// used by native phone lock screens, replacing the plain masked textbox.
function PinBoxes({ value, onChange, onEnter, autoFocus }: { value: string; onChange: (v: string) => void; onEnter?: () => void; autoFocus?: boolean }) {
  return (
    <div className="relative" style={{ height: 54 }}>
      <input
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => e.key === "Enter" && onEnter && onEnter()}
        autoFocus={autoFocus}
        className="absolute inset-0 w-full opacity-0"
        style={{ cursor: "default" }}
      />
      <div className="flex gap-2.5 justify-center pointer-events-none">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`ws-pin-box ${i < value.length ? "ws-pin-box-filled" : ""}`}>
            {i < value.length && <div className="ws-pin-box-dot" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function POSLogin({ onLogin }: Props) {
  // Flow steps: "id" → "checking" → "pin" or "pin_set"
  const [step, setStep] = useState<"id" | "checking" | "pin" | "pin_set">("id");
  const [idInput, setIdInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [memberNum, setMemberNum] = useState<number | null>(null);

  // React Query: pin.check — only enabled when step === "checking"
  // staleTime:0, gcTime:0, refetchOnMount:'always' ensures we ALWAYS hit the server
  const pinCheckQuery = trpc.pin.check.useQuery(
    { memberId: String(memberNum ?? 0) },
    {
      enabled: step === "checking" && memberNum !== null,
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
      retry: 1,
    }
  );

  const posLogin = trpc.posSession.login.useMutation();

  // Effect: once pin.check resolves (isSuccess && !isFetching), decide the next step
  useEffect(() => {
    if (step !== "checking") return;
    if (pinCheckQuery.isFetching) return;
    if (!pinCheckQuery.isSuccess) {
      // If query errored out, show error and go back to id step
      if (pinCheckQuery.isError) {
        setError("通信エラーが発生しました");
        setStep("id");
      }
      return;
    }
    // Server responded with the truth
    const exists = pinCheckQuery.data?.exists;
    if (exists) {
      setPinInput("");
      setStep("pin");
    } else {
      setPinInput("");
      setPinConfirm("");
      setStep("pin_set");
    }
  }, [step, pinCheckQuery.isFetching, pinCheckQuery.isSuccess, pinCheckQuery.isError, pinCheckQuery.data]);

  const handleSubmitId = () => {
    const n = Number(idInput);
    if (!Number.isInteger(n) || n < ID_MIN || n > ID_MAX) {
      setError("3501〜3540の番号を入力してください");
      return;
    }
    setError("");
    setMemberNum(n);
    // Transition to "checking" step — this enables the query
    setStep("checking");
  };

  const doPinSubmit = async () => {
    if (pinInput.length < 4) {
      setError("4桁のPINを入力してください");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await posLogin.mutateAsync({
        operatorId: String(memberNum),
        pin: pinInput,
      });
      onLogin(String(memberNum), result.token, result.isNewPin);
    } catch (e: any) {
      // The server rejects with "PINが違います" on a real mismatch; fall
      // back to a generic message for anything else (network errors etc).
      setError(e?.message || "PINが違います");
      setPinInput("");
    }
    setLoading(false);
  };

  const doPinSetSubmit = async () => {
    if (pinInput.length < 4) {
      setError("4桁のPINを入力してください");
      return;
    }
    if (pinInput !== pinConfirm) {
      setError("PINが一致しません");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await posLogin.mutateAsync({
        operatorId: String(memberNum),
        pin: pinInput,
      });
      onLogin(String(memberNum), result.token, result.isNewPin);
    } catch (e: any) {
      setError(e?.message || "通信エラーが発生しました");
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
          {/* Step 1: ID Input */}
          {step === "id" && (
            <>
              <label className="flex items-center gap-1.5 hos-caption mb-2">
                <Lock size={13} />
                個人番号
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmitId()}
                placeholder="例：3501"
                className="ws-input font-number text-center"
                style={{ fontSize: 32, fontWeight: 800, padding: "14px 16px" }}
                autoFocus
              />
              <button
                onClick={handleSubmitId}
                disabled={loading}
                className="w-full flex items-center justify-center mt-3.5 font-bold text-[15px]"
                style={{
                  background: loading ? "var(--ws-td)" : "var(--ws-ac)",
                  color: "#fff",
                  padding: 14,
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                次へ
              </button>
              <p className="hos-caption text-center mt-2.5">
                3501〜3540 の番号で入室してください
              </p>
            </>
          )}

          {/* Checking step: spinner while server is queried */}
          {step === "checking" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="animate-spin mb-3" size={28} style={{ color: "var(--ws-ac)" }} />
              <p className="hos-subtitle" style={{ fontSize: 14 }}>確認中...</p>
            </div>
          )}

          {/* Step 2: PIN Input (existing user) — 4-box entry */}
          {step === "pin" && (
            <>
              <button
                onClick={() => { setStep("id"); setError(""); setPinInput(""); }}
                className="flex items-center gap-1 text-xs mb-4"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ws-ts)" }}
              >
                <ArrowLeft size={13} />
                番号を変更
              </button>
              <div className="text-center mb-5">
                <div className="hos-subtitle" style={{ fontSize: 13 }}>
                  {memberNum} - {MEMBERS[memberNum!]?.name}
                </div>
              </div>
              <label className="flex items-center justify-center gap-1.5 hos-caption mb-3">
                <KeyRound size={13} />
                PINコード
              </label>
              <PinBoxes value={pinInput} onChange={setPinInput} onEnter={doPinSubmit} autoFocus />
              <button
                onClick={doPinSubmit}
                disabled={loading}
                className="w-full flex items-center justify-center mt-5 font-bold text-[15px]"
                style={{
                  background: loading ? "var(--ws-td)" : "var(--ws-ac)",
                  color: "#fff",
                  padding: 14,
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "確認中..." : "入室する"}
              </button>
            </>
          )}

          {/* Step 3: PIN Setup (first time) — 4-box entry ×2 */}
          {step === "pin_set" && (
            <>
              <button
                onClick={() => { setStep("id"); setError(""); setPinInput(""); setPinConfirm(""); }}
                className="flex items-center gap-1 text-xs mb-4"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ws-ts)" }}
              >
                <ArrowLeft size={13} />
                番号を変更
              </button>
              <div className="text-center mb-5">
                <div className="hos-subtitle" style={{ fontSize: 13 }}>
                  {memberNum} - {MEMBERS[memberNum!]?.name}
                </div>
                <div className="text-[11px] mt-1 font-bold" style={{ color: "var(--ws-ac)" }}>
                  初回ログイン — 使用するPINを設定してください
                </div>
              </div>
              <label className="flex items-center justify-center gap-1.5 hos-caption mb-3">
                <KeyRound size={13} />
                新しいPIN（4桁）
              </label>
              <PinBoxes value={pinInput} onChange={setPinInput} />
              <label className="flex items-center justify-center gap-1.5 hos-caption mb-3 mt-5">
                <KeyRound size={13} />
                PINの確認
              </label>
              <PinBoxes value={pinConfirm} onChange={setPinConfirm} onEnter={doPinSetSubmit} />
              <button
                onClick={doPinSetSubmit}
                disabled={loading}
                className="w-full flex items-center justify-center mt-5 font-bold text-[15px]"
                style={{
                  background: loading ? "var(--ws-td)" : "var(--ws-ac)",
                  color: "#fff",
                  padding: 14,
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "設定中..." : "PINを設定して入室"}
              </button>
            </>
          )}

          {error && (
            <p className="text-xs text-center mt-3 font-bold" style={{ color: "var(--ws-dg)" }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
