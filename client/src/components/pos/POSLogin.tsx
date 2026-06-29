import { useState, useEffect } from "react";
import { Lock, ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ID_MIN, ID_MAX, MEMBERS } from "@shared/posTypes";

interface Props {
  onLogin: (id: string) => void;
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

  const pinVerify = trpc.pin.verify.useMutation();
  const pinSetup = trpc.pin.setup.useMutation();
  const createLog = trpc.activityLog.create.useMutation();

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
      const result = await pinVerify.mutateAsync({
        memberId: String(memberNum),
        pin: pinInput,
      });
      if (result.success) {
        const name = MEMBERS[memberNum!]?.name || "";
        createLog.mutate({
          operator: String(memberNum),
          operatorName: name,
          action: "login",
          detail: `${name}がログイン`,
        });
        onLogin(String(memberNum));
      } else {
        setError(result.error || "PINが違います");
        setPinInput("");
      }
    } catch {
      setError("通信エラーが発生しました");
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
    try {
      await pinSetup.mutateAsync({
        memberId: String(memberNum),
        pin: pinInput,
      });
      const name = MEMBERS[memberNum!]?.name || "";
      createLog.mutate({
        operator: String(memberNum),
        operatorName: name,
        action: "login",
        detail: `${name}が初回ログイン（PIN設定）`,
      });
      onLogin(String(memberNum));
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
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
            style={{ background: "var(--ws-sb)" }}
          >
            <span className="text-2xl">🏪</span>
          </div>
          <h1 className="text-xl font-bold" style={{ color: "var(--ws-tx)" }}>
            FES POS
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--ws-ts)" }}>
            文化祭 物販管理システム
          </p>
        </div>

        <div className="ws-card p-7">
          {/* Step 1: ID Input */}
          {step === "id" && (
            <>
              <label
                className="flex items-center gap-1.5 text-xs font-bold mb-2"
                style={{ color: "var(--ws-ts)" }}
              >
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
                className="w-full flex items-center justify-center rounded-lg mt-3.5 font-bold text-[15px]"
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
              <p className="text-[11px] text-center mt-2.5" style={{ color: "var(--ws-td)" }}>
                3501〜3540 の番号で入室してください
              </p>
            </>
          )}

          {/* Checking step: spinner while server is queried */}
          {step === "checking" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="animate-spin mb-3" size={28} style={{ color: "var(--ws-ac)" }} />
              <p className="text-sm font-bold" style={{ color: "var(--ws-ts)" }}>
                確認中...
              </p>
            </div>
          )}

          {/* Step 2: PIN Input (existing user) */}
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
              <div className="text-center mb-4">
                <div className="text-[13px] font-bold" style={{ color: "var(--ws-tx)" }}>
                  {memberNum} - {MEMBERS[memberNum!]?.name}
                </div>
              </div>
              <label
                className="flex items-center gap-1.5 text-xs font-bold mb-2"
                style={{ color: "var(--ws-ts)" }}
              >
                <KeyRound size={13} />
                PINコード
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => e.key === "Enter" && doPinSubmit()}
                placeholder="••••"
                className="ws-input font-number text-center"
                style={{ fontSize: 32, fontWeight: 800, padding: "14px 16px", letterSpacing: "0.3em" }}
                autoFocus
              />
              <button
                onClick={doPinSubmit}
                disabled={loading}
                className="w-full flex items-center justify-center rounded-lg mt-3.5 font-bold text-[15px]"
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

          {/* Step 3: PIN Setup (first time) */}
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
              <div className="text-center mb-4">
                <div className="text-[13px] font-bold" style={{ color: "var(--ws-tx)" }}>
                  {memberNum} - {MEMBERS[memberNum!]?.name}
                </div>
                <div className="text-[11px] mt-1 font-bold" style={{ color: "var(--ws-ac)" }}>
                  初回ログイン — 使用するPINを設定してください
                </div>
              </div>
              <label
                className="flex items-center gap-1.5 text-xs font-bold mb-2"
                style={{ color: "var(--ws-ts)" }}
              >
                <KeyRound size={13} />
                新しいPIN（4桁）
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                className="ws-input font-number text-center"
                style={{ fontSize: 32, fontWeight: 800, padding: "14px 16px", letterSpacing: "0.3em" }}
                autoFocus
              />
              <label
                className="flex items-center gap-1.5 text-xs font-bold mb-2 mt-3"
                style={{ color: "var(--ws-ts)" }}
              >
                <KeyRound size={13} />
                PINの確認
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => e.key === "Enter" && doPinSetSubmit()}
                placeholder="••••"
                className="ws-input font-number text-center"
                style={{ fontSize: 32, fontWeight: 800, padding: "14px 16px", letterSpacing: "0.3em" }}
              />
              <button
                onClick={doPinSetSubmit}
                disabled={loading}
                className="w-full flex items-center justify-center rounded-lg mt-3.5 font-bold text-[15px]"
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
