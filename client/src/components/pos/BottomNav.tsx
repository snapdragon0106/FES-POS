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
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around"
      style={{
        background: "var(--ws-sb)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "8px 4px",
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
      }}
    >
      {visible.map((n) => {
        const Icon = ICONS[n.key];
        const active = tab === n.key;
        return (
          <button
            key={n.key}
            onClick={() => setTab(n.key)}
            className="flex flex-col items-center gap-0.5 px-2 py-1"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: active ? "var(--ws-ac)" : "rgba(255,255,255,0.4)",
            }}
          >
            <Icon size={18} />
            <span className="text-[9px] font-bold">{n.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
