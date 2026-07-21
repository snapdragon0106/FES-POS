import type { CapacitorConfig } from "@capacitor/cli";

// This app doesn't run a bundled offline copy of the frontend — it points
// the WebView straight at the live Render deployment, the same origin the
// browser version already talks to. That means zero code changes to the
// tRPC client's relative "/api/trpc" URL, and every deploy to Render is
// live in the app immediately with no rebuild/resubmit. The tradeoff: the
// app requires network access on every launch, same as the site does today.
const config: CapacitorConfig = {
  appId: "com.keikousai.fespos",
  appName: "FES POS",
  webDir: "dist/public",
  server: {
    url: "https://fes-pos.onrender.com",
    cleartext: false,
  },
};

export default config;
