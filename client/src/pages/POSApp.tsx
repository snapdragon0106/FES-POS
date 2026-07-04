import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { ADMIN_OPERATOR, MEMBERS, NAV_ITEMS, type NavKey } from "@shared/posTypes";
import POSLogin from "@/components/pos/POSLogin";
import Sidebar from "@/components/pos/Sidebar";
import BottomNav from "@/components/pos/BottomNav";
import POSRegister from "@/components/pos/POSRegister";
import Dashboard from "@/components/pos/Dashboard";
import InventoryTab from "@/components/pos/InventoryTab";
import ProductsTab from "@/components/pos/ProductsTab";
import HistoryTab from "@/components/pos/HistoryTab";
import ActivityLogTab from "@/components/pos/ActivityLogTab";
import PinManagerTab from "@/components/pos/PinManagerTab";
import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon } from "lucide-react";
import { toast } from "sonner";

export default function POSApp() {
  const [operator, setOperator] = useState<string | null>(() => {
    return localStorage.getItem("pos_operator");
  });
  const [tab, setTab] = useState<NavKey>("pos");
  const [syncing, setSyncing] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const isAdmin = operator === ADMIN_OPERATOR;
  const operatorName = operator ? MEMBERS[Number(operator)]?.name || "" : "";
  const { theme, toggleTheme } = useTheme();

  // Restore server session on page reload / tab reopen if operator is in localStorage
  const posLoginRestore = trpc.posSession.login.useMutation();
  useEffect(() => {
    if (operator) {
      const name = MEMBERS[Number(operator)]?.name || "";
      posLoginRestore.mutateAsync({ operatorId: operator, operatorName: name })
        .then((res) => {
          if (res?.token) localStorage.setItem("pos_token", res.token);
          setSessionReady(true);
        })
        .catch(() => {
          // Session restore failed, clear local state
          localStorage.removeItem("pos_operator");
          localStorage.removeItem("pos_token");
          setOperator(null);
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Data queries - only enabled when session is ready.
  // refetchInterval makes every device pull the latest sales/stock automatically
  // (near real-time across all registers). refetchOnWindowFocus refreshes when a
  // phone wakes from sleep. Increase POLL_MS if you have many devices or want to
  // be gentle on the TiDB free quota.
  const POLL_MS = 8000;
  const productsQuery = trpc.product.list.useQuery(undefined, { enabled: sessionReady || !operator, refetchInterval: POLL_MS, refetchOnWindowFocus: true });
  const transactionsQuery = trpc.transaction.list.useQuery(undefined, { enabled: sessionReady || !operator, refetchInterval: POLL_MS, refetchOnWindowFocus: true });
  const restocksQuery = trpc.restock.list.useQuery(undefined, { enabled: sessionReady || !operator, refetchInterval: POLL_MS, refetchOnWindowFocus: true });
  const logsQuery = trpc.activityLog.list.useQuery(undefined, { enabled: sessionReady || !operator, refetchInterval: POLL_MS, refetchOnWindowFocus: true });

  const products = productsQuery.data || [];
  const transactions = transactionsQuery.data || [];
  const restocksList = restocksQuery.data || [];
  const activityLogs = logsQuery.data || [];
  const loading = productsQuery.isLoading || transactionsQuery.isLoading;

  // Stock calculation
  const { stockMap, initialMap } = useMemo(() => {
    const sMap: Record<number, number> = {};
    const iMap: Record<number, number> = {};
    products.forEach((p) => {
      sMap[p.id] = p.initialStock || 0;
      iMap[p.id] = p.initialStock || 0;
    });
    transactions.forEach((t) => {
      if (!t.voided) {
        const items = t.items as any[];
        items?.forEach((it) => {
          if (sMap[it.product_id] != null) sMap[it.product_id] -= it.qty;
        });
      }
    });
    restocksList.forEach((r) => {
      if (sMap[r.productId] != null) {
        sMap[r.productId] += r.amount;
        iMap[r.productId] += r.amount;
      }
    });
    return { stockMap: sMap, initialMap: iMap };
  }, [products, transactions, restocksList]);

  const getStock = useCallback((id: number) => stockMap[id] ?? 0, [stockMap]);

  // Mutations
  const createLog = trpc.activityLog.create.useMutation();
  const posLogin = trpc.posSession.login.useMutation();
  const posLogout = trpc.posSession.logout.useMutation();
  const utils = trpc.useUtils();

  const addLog = useCallback(
    (action: string, detail?: string) => {
      if (!operator) return;
      createLog.mutate({
        operator,
        operatorName,
        action,
        detail,
      });
    },
    [operator, operatorName, createLog]
  );

  const handleLogin = async (id: string) => {
    const name = MEMBERS[Number(id)]?.name || "";
    const res = await posLogin.mutateAsync({ operatorId: id, operatorName: name });
    if (res?.token) localStorage.setItem("pos_token", res.token);
    localStorage.setItem("pos_operator", id);
    setOperator(id);
    setSessionReady(true);
    // Log will be created from login component
  };

  const handleLogout = async () => {
    addLog("logout");
    await posLogout.mutateAsync();
    // Clear the cached PIN-existence result so that logging in again always
    // re-checks against the server. Without this, a stale {exists:false}
    // (cached before the PIN was set) forces the first-time PIN setup screen
    // on re-login even though a PIN already exists.
    await utils.pin.check.reset();
    localStorage.removeItem("pos_operator");
    localStorage.removeItem("pos_token");
    setOperator(null);
    setSessionReady(false);
    setTab("pos");
  };

  const handleSync = async () => {
    setSyncing(true);
    await Promise.all([
      utils.product.list.invalidate(),
      utils.transaction.list.invalidate(),
      utils.restock.list.invalidate(),
      utils.activityLog.list.invalidate(),
    ]);
    setSyncing(false);
    toast.success("同期完了");
  };

  if (!operator) {
    return <POSLogin onLogin={handleLogin} />;
  }

  // Show loading while restoring server session
  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ws-bg)" }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: "var(--ws-ac)", borderTopColor: "transparent" }} />
          <p className="text-sm" style={{ color: "var(--ws-ts)" }}>セッション復元中...</p>
        </div>
      </div>
    );
  }

  const visibleNavItems = NAV_ITEMS.filter((n) => !n.admin || isAdmin);

  return (
    <div className="min-h-screen" style={{ background: "var(--ws-bg)", fontFamily: "var(--font-body)" }}>
      {/* PC Sidebar */}
      <Sidebar
        tab={tab}
        setTab={setTab}
        isAdmin={isAdmin}
        operator={operator}
        operatorName={operatorName}
        onSync={handleSync}
        syncing={syncing}
        onLogout={handleLogout}
      />

      {/* Main content */}
      <main className="md:ml-[15rem] pb-20 md:pb-6 p-4 md:p-6">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "var(--ws-secc)" }}
            >
              <span className="text-sm">🏪</span>
            </div>
            <span className="font-bold text-sm" style={{ color: "var(--ws-tx)" }}>
              FES POS
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleTheme?.()}
              aria-label="テーマ切替"
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "var(--ws-s2)", color: "var(--ws-ts)", border: "none", cursor: "pointer" }}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <span className="font-number text-xs font-bold" style={{ color: "var(--ws-ts)" }}>
              {operator}
            </span>
            {isAdmin && (
              <span className="ws-badge" style={{ background: "var(--ws-org)", color: "var(--ws-or)" }}>
                管理者
              </span>
            )}
          </div>
        </div>

        {/* Tab content */}
        {tab === "pos" && (
          <POSRegister
            products={products}
            getStock={getStock}
            operator={operator}
            operatorName={operatorName}
            addLog={addLog}
            onSync={handleSync}
          />
        )}
        {tab === "dashboard" && (
          <Dashboard products={products} transactions={transactions} />
        )}
        {tab === "inventory" && (
          <InventoryTab
            products={products}
            getStock={getStock}
            initialMap={initialMap}
            isAdmin={isAdmin}
            addLog={addLog}
            operator={operator}
            operatorName={operatorName}
          />
        )}
        {tab === "products" && isAdmin && (
          <ProductsTab
            products={products}
            addLog={addLog}
            operator={operator}
            operatorName={operatorName}
          />
        )}
        {tab === "history" && (
          <HistoryTab
            transactions={transactions}
            isAdmin={isAdmin}
            addLog={addLog}
            operator={operator}
          />
        )}
        {tab === "actlog" && isAdmin && (
          <ActivityLogTab logs={activityLogs} />
        )}
        {tab === "pinmgr" && isAdmin && (
          <PinManagerTab addLog={addLog} operator={operator} />
        )}
      </main>

      {/* Mobile bottom nav */}
      <BottomNav tab={tab} setTab={setTab} isAdmin={isAdmin} />
    </div>
  );
}
