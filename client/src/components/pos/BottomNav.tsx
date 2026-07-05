import {
  ShoppingCart, LayoutDashboard, Package, Settings2, History, ScrollText, KeyRound,
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
}

export default function BottomNav({ tab, setTab, isAdmin }: Props) {
  const visible = NAV_ITEMS.filter((n) => !n.admin || isAdmin);

  return (
    // Floating glass pill inset from the screen edges (not edge-to-edge),
    // echoing the rounded, "nests inside device curves" language of
    // Liquid Glass's own navigation bars.
    <nav
      className="ws-tile-panel md:hidden fixed z-30 flex items-stretch justify-around"
      style={{
        left: 12,
        right: 12,
        bottom: 12,
        borderRadius: 26,
        padding: "9px 6px",
        paddingBottom: "max(9px, env(safe-area-inset-bottom))",
      }}
    >
      {visible.map((n) => {
        const Icon = ICONS[n.key];
        const active = tab === n.key;
        return (
          <button
            key={n.key}
            onClick={() => setTab(n.key)}
            className="flex flex-col items-center gap-1 px-1"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              flex: 1,
            }}
          >
            <span
              className="flex items-center justify-center transition-all"
              style={{
                width: 40,
                height: 26,
                borderRadius: 999,
                background: active ? "var(--ws-secc)" : "transparent",
                color: active ? "var(--ws-onsecc)" : "var(--ws-ts)",
              }}
            >
              <Icon size={18} />
            </span>
            <span
              className="text-[10px] font-medium"
              style={{ color: active ? "var(--ws-tx)" : "var(--ws-ts)" }}
            >
              {n.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
