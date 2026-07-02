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
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch justify-around"
      style={{
        background: "var(--ws-sb)",
        borderTop: "1px solid var(--ws-bd)",
        padding: "8px 4px 5px",
        paddingBottom: "max(5px, env(safe-area-inset-bottom))",
      }}
    >
      {visible.map((n) => {
        const Icon = ICONS[n.key];
        const active = tab === n.key;
        return (
          <button
            key={n.key}
            onClick={() => setTab(n.key)}
            className="flex flex-col items-center gap-[3px] px-1 py-0.5"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              flex: 1,
              color: active ? "var(--ws-tx)" : "var(--ws-ts)",
            }}
          >
            <Icon size={19} strokeWidth={2} />
            <span className="text-[10px]" style={{ fontWeight: active ? 600 : 500 }}>
              {n.label}
            </span>
            {/* Taskbar-style active indicator */}
            <span
              aria-hidden
              style={{
                width: 14,
                height: 3,
                borderRadius: 999,
                background: active ? "var(--ws-ac)" : "transparent",
                transition: "background 0.15s",
              }}
            />
          </button>
        );
      })}
    </nav>
  );
}
