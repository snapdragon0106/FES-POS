import {
  ShoppingCart, LayoutDashboard, Package, Settings2, History,
  LogOut, RefreshCw, ShieldCheck, User, Store, ScrollText, KeyRound,
  Sun, Moon,
} from "lucide-react";
import { NAV_ITEMS, type NavKey } from "@shared/posTypes";
import { useTheme } from "../../contexts/ThemeContext";

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
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <aside
      className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 z-20"
      style={{
        width: "15rem",
        background: "var(--ws-sb)",
        borderRight: "1px solid var(--ws-bd)",
        padding: "20px 12px",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-6 px-1.5">
        <div
          className="w-[40px] h-[40px] rounded-full flex items-center justify-center"
          style={{ background: "var(--ws-secc)" }}
        >
          <Store size={19} style={{ color: "var(--ws-onsecc)" }} />
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: "var(--ws-tx)", fontFamily: "var(--font-heading)" }}>
            FES POS
          </div>
          <div className="text-[11px]" style={{ color: "var(--ws-ts)" }}>
            物販管理
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 flex-1">
        {visible.map((n) => {
          const Icon = ICONS[n.key];
          const active = tab === n.key;
          return (
            <button
              key={n.key}
              onClick={() => setTab(n.key)}
              className="flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-all w-full text-left"
              style={{
                background: active ? "var(--ws-secc)" : "transparent",
                color: active ? "var(--ws-onsecc)" : "var(--ws-ts)",
                border: "none",
                borderRadius: 999,
                cursor: "pointer",
                fontFamily: "var(--font-heading)",
              }}
            >
              <Icon size={18} />
              {n.label}
            </button>
          );
        })}
      </nav>

      {/* User info + actions */}
      <div className="flex flex-col gap-2 mt-4">
        <div className="rounded-xl p-3" style={{ background: "var(--ws-s2)" }}>
          <div className="text-[11px] mb-0.5" style={{ color: "var(--ws-ts)" }}>
            ログイン中
          </div>
          <div className="flex items-center gap-2">
            <span className="font-number text-lg font-bold" style={{ color: "var(--ws-tx)" }}>{operator}</span>
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
            <div className="text-[12px] mt-1" style={{ color: "var(--ws-ts)" }}>
              {operatorName}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => toggleTheme?.()}
          className="flex items-center justify-center gap-2 py-2.5 text-xs font-semibold"
          style={{
            color: "var(--ws-onsecc)",
            background: "var(--ws-secc)",
            border: "none",
            borderRadius: 999,
            cursor: "pointer",
          }}
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
          {isDark ? "ライトモード" : "ダークモード"}
        </button>

        <button
          onClick={onSync}
          className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold"
          style={{
            color: "var(--ws-ts)",
            border: "1px solid var(--ws-bd)",
            background: "transparent",
            borderRadius: 999,
            cursor: "pointer",
          }}
        >
          <RefreshCw size={13} className={syncing ? "ws-spin" : ""} />
          今すぐ同期
        </button>
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold"
          style={{
            color: "var(--ws-dg)",
            border: "none",
            background: "transparent",
            borderRadius: 999,
            cursor: "pointer",
          }}
        >
          <LogOut size={13} />
          退室する
        </button>
      </div>
    </aside>
  );
}
