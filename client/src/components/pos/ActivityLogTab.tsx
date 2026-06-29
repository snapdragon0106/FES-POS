import { AlertTriangle } from "lucide-react";
import { LOG_STYLE, type LogAction } from "@shared/posTypes";

interface Props {
  logs: any[];
}

export default function ActivityLogTab({ logs }: Props) {
  return (
    <div className="ws-fade">
      <h2 className="text-[22px] font-extrabold mb-5" style={{ color: "var(--ws-tx)", fontFamily: "var(--font-heading)" }}>
        操作ログ
      </h2>
      {logs.length === 0 ? (
        <div className="ws-card p-8 text-center text-sm" style={{ color: "var(--ws-td)" }}>
          操作ログがありません
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {logs.map((l: any) => {
            const ls = LOG_STYLE[l.action as LogAction] || { label: l.action, color: "var(--ws-ts)", warn: false };
            return (
              <div
                key={l.id}
                className="ws-card p-3.5"
                style={{
                  borderWidth: "1.5px",
                  borderColor: ls.warn ? "rgba(239,68,68,0.3)" : undefined,
                  background: ls.warn ? "rgba(239,68,68,0.05)" : undefined,
                }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {ls.warn && <AlertTriangle size={14} style={{ color: "var(--ws-dg)" }} />}
                  <span className="font-number text-[11px] font-bold" style={{ color: "var(--ws-ts)" }}>
                    {new Date(l.createdAt).toLocaleString("ja-JP", {
                      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </span>
                  <span className="font-number text-xs font-extrabold" style={{ color: "var(--ws-tx)" }}>
                    {l.operator}
                  </span>
                  {l.operatorName && l.operatorName !== l.operator && (
                    <span className="text-[11px]" style={{ color: "var(--ws-ts)" }}>
                      ({l.operatorName})
                    </span>
                  )}
                  <span
                    className="ws-badge ml-auto"
                    style={{
                      background: ls.color + "22",
                      color: ls.color,
                      border: "1px solid " + ls.color + "44",
                    }}
                  >
                    {ls.warn && "⚠ "}
                    {ls.label}
                  </span>
                </div>
                {l.detail && (
                  <div className="text-xs mt-1.5" style={{ color: "var(--ws-ts)" }}>
                    {l.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
