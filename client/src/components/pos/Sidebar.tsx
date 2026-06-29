import {
  ShoppingCart, LayoutDashboard, Package, Settings2, History,
  LogOut, RefreshCw, ShieldCheck, User, Store, ScrollText, KeyRound,
} from "lucide-react";
import { NAV_ITEMS, type NavKey } from "@shared/posTypes";

const ICONS: Record<string, any> = {
  pos: ShoppingCart,
  dashboard: LayoutDashboard,
  inventory: Package,
  products: Settings2,
  history: History,
  actlog: ScrollText,
  pinmgr: KeyRound,
};

interface Props {
  tab: NavKey;
  setTab: (t: NavKey) => void;
  isAdmin: boolean;
  operator: string;
  operatorName: string;
  onSync: () => void;
  syncing: boolean;
  onLogout: () => void;
}

export default function Sidebar({ tab, setTab, isAdmin, operator, operatorName, onSync, syncing, onLogout }: Props) {
  const visible = NAV_ITEMS.filter((n) => !n.admin || isAdmin);

  return (
    <aside
      className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 z-20"
      style={{ width: "15rem", background: "var(--ws-sb)", padding: "20px 10px" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-7 px-1.5">
        <div
          className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center"
          style={{ background: "rgba(59,130,246,0.15)" }}
        >
          <Store size={17} style={{ color: "var(--ws-ac)" }} />
        </div>
        <div>
          <div className="text-sm font-extrabold text-white" style={{ fontFamily: "var(--font-heading)" }}>
            FES POS
          </div>
          <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            物販管理
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {visible.map((n) => {
          const Icon = ICONS[n.key];
          const active = tab === n.key;
          return (
            <button
              key={n.key}
              onClick={() => setTab(n.key)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all w-full text-left"
              style={{
                background: active ? "rgba(59,130,246,0.15)" : "transparent",
                color: active ? "var(--ws-ac)" : "rgba(255,255,255,0.55)",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-heading)",
              }}
            >
              <Icon size={15} />
              {n.label}
            </button>
          );
        })}
      </nav>

      {/* User info */}
      <div className="flex flex-col gap-2 mt-5">
        <div
          className="rounded-[10px] p-2.5 px-3"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="text-[10px] mb-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            ログイン中
          </div>
          <div className="flex items-center gap-2">
            <span className="font-number text-lg font-extrabold text-white">{operator}</span>
            <span
              className="ws-badge text-[11px]"
              style={{
                background: isAdmin ? "var(--ws-org)" : "var(--ws-scg)",
                color: isAdmin ? "var(--ws-or)" : "var(--ws-sc)",
              }}
            >
              {isAdmin ? <ShieldCheck size={11} /> : <User size={11} />}
              {isAdmin ? "管理者" : "一般"}
            </span>
          </div>
          {operatorName && (
            <div className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
              {operatorName}
            </div>
          )}
        </div>
        <button
          onClick={onSync}
          className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold"
          style={{
            color: "rgba(255,255,255,0.55)",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} className={syncing ? "ws-spin" : ""} />
          今すぐ同期
        </button>
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold"
          style={{
            color: "rgba(255,255,255,0.45)",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <LogOut size={12} />
          退室する
        </button>
      </div>
    </aside>
  );
}
