// JWT_SECRET signs every POS session token (server/posAuth.ts getSecret()).
// If it were ever unset, the signing key would silently collapse to a
// short fixed string that's plainly visible in this public repository —
// letting anyone forge a valid admin session offline with no PIN at all.
// Failing loudly at boot is far better than an app that "works" on a
// guessable key: this is confirmed set in the Render deployment already,
// so this check should never actually fire there.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET is missing or too short (must be at least 32 characters). " +
    "It signs every POS session token — refusing to start with a weak or " +
    "absent value rather than silently falling back to an insecure default."
  );
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET,
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
