import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  // Two separate auth systems live in this codebase: Manus's own (unused)
  // OAuth portal, and our POS PIN session. They fail differently and need
  // different recovery — sending a POS session-expiry to Manus's portal
  // would send the user to a broken, unconfigured page instead of our
  // own login screen.
  const isManusUnauthorized = error.message === UNAUTHED_ERR_MSG;
  const posErrorCode = (error.data as { code?: string } | undefined)?.code;
  const isPosUnauthorized = posErrorCode === "UNAUTHORIZED";

  if (isManusUnauthorized) {
    window.location.href = getLoginUrl();
    return;
  }
  if (isPosUnauthorized) {
    // The POS session (JWT, held only in the httpOnly cookie) has expired
    // or is otherwise invalid. Clear the stale local operator id and
    // reload — POSApp renders its own PIN login screen whenever there's no
    // operator in localStorage, so this is all that's needed to recover
    // cleanly.
    localStorage.removeItem("pos_operator");
    window.location.reload();
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

// This app no longer runs inside a cross-site iframe (it used to, under
// Manus's preview), so the POS session token now lives only in the
// httpOnly "pos_session" cookie sent automatically via credentials:
// "include" below. It is never read into JS or copied to localStorage —
// a leftover copy from before this change would have made the cookie's
// httpOnly protection pointless against XSS. Clear that stale copy once
// on load for anyone who was already logged in.
if (typeof window !== "undefined") {
  window.localStorage.removeItem("pos_token");
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
