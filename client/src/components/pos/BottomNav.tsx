import {
  ShoppingCart, LayoutDashboard, Package, Settings2, History, ScrollText, KeyRound, Calculator,
} from "lucide-react";
import { NAV_ITEMS, type NavKey } from "@shared/posTypes";

const ICONS: Record<string, any> = {
  pos: ShoppingCart,
  dashboard: LayoutDashboard,
  inventory: Package,
  products: Settings2,
  history: History,
  accounting: Calculator,
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
    // Admin users see up to 8 tabs. Rather than letting the row overflow
    // the screen (as a fixed icon/label size did), every item shrinks
    // together via flex: 1 1 0 + min-width: 0, and the row itself can
    // scroll horizontally as a last-resort safety net on very narrow
    // screens or very long localized labels.
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch"
      style={{
        background: "var(--ws-sb)",
        borderTop: "1px solid var(--ws-bd)",
        padding: "8px 2px 6px",
        paddingBottom: "max(6px, env(safe-area-inset-bottom))",
        overflowX: "auto",
      }}
    >
      {visible.map((n) => {
        const Icon = ICONS[n.key];
        const active = tab === n.key;
        return (
          <button
            key={n.key}
            onClick={() => setTab(n.key)}
            className="flex flex-col items-center gap-0.5 px-0.5 py-0.5"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              flex: "1 1 0%",
              minWidth: 0,
              color: active ? "var(--ws-ac)" : "var(--ws-ts)",
            }}
          >
            <Icon size={17} strokeWidth={active ? 2.4 : 2} style={{ flexShrink: 0 }} />
            <span
              className="text-[9px]"
              style={{
                fontWeight: active ? 700 : 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {n.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
