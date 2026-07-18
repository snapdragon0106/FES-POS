/**
 * POS Session Authentication
 * 
 * Uses a signed JWT cookie (pos_session) to track the authenticated POS operator.
 * The operator ID is embedded in the token and verified server-side.
 */
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";
import type { Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { getSessionCookieOptions } from "./_core/cookies";
import { ADMIN_OPERATOR, ID_MIN, ID_MAX, MEMBERS } from "@shared/posTypes";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const PIN_KEY_LENGTH = 64;

/**
 * PIN hashing (scrypt via Node's built-in crypto — no extra dependency).
 * Stored format is "salt:hashHex". A bare 4-digit string is treated as a
 * legacy plaintext PIN from before this fix; verifyPin() still accepts
 * those and the caller re-saves the hashed form on a successful match, so
 * existing PINs keep working and migrate silently the next time someone
 * logs in.
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(pin, salt, PIN_KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export function isLegacyPlaintextPin(stored: string): boolean {
  return /^\d{4}$/.test(stored);
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (isLegacyPlaintextPin(stored)) {
    return stored === pin;
  }
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derivedKey = (await scrypt(pin, salt, PIN_KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(hashHex, "hex");
  if (storedKey.length !== derivedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}

const POS_COOKIE_NAME = "pos_session";
// Custom header used to carry the POS session token. This works even when
// the app runs inside a cross-site iframe (e.g. the webdev preview), where
// third-party cookies are blocked by the browser or stripped by the proxy.
const POS_HEADER_NAME = "x-pos-session";
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

export type PosSessionPayload = {
  operatorId: string;
  operatorName: string;
};

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret + "_pos");
}

export async function createPosSessionToken(operatorId: string, operatorName: string): Promise<string> {
  const secret = getSecret();
  const expirationSeconds = Math.floor((Date.now() + ONE_DAY_MS) / 1000);
  return new SignJWT({ operatorId, operatorName })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secret);
}

/**
 * Extracts the POS session token from the request.
 * Priority:
 *   1. The "x-pos-session" header (survives cross-site iframe / proxy where
 *      third-party cookies are unavailable).
 *   2. The "pos_session" cookie (first-party / same-site fallback).
 */
function extractPosToken(req: Request): string | null {
  const headerVal = req.headers[POS_HEADER_NAME];
  if (typeof headerVal === "string" && headerVal) return headerVal;
  if (Array.isArray(headerVal) && headerVal[0]) return headerVal[0];

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies[POS_COOKIE_NAME];
    if (token) return token;
  }
  return null;
}

export async function verifyPosSession(req: Request): Promise<PosSessionPayload | null> {
  const token = extractPosToken(req);
  if (!token) return null;
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const { operatorId, operatorName } = payload as Record<string, unknown>;
    if (typeof operatorId !== "string" || !operatorId) return null;
    // Defense in depth: a valid signature alone shouldn't be enough to act
    // as an operator who was never actually validated against the roster.
    // The ID_MIN/ID_MAX + MEMBERS check normally only runs once, client-side
    // input, at login time (posSession.login) — re-checking it here on
    // every request means a compromised/leaked signing key isn't by itself
    // sufficient to mint a session for an operatorId outside the real
    // 40-person roster.
    const num = Number(operatorId);
    if (!Number.isInteger(num) || num < ID_MIN || num > ID_MAX || !MEMBERS[num]) return null;
    return { operatorId, operatorName: (operatorName as string) || "" };
  } catch {
    return null;
  }
}

export function setPosSessionCookie(res: Response, req: Request, token: string) {
  const opts = getSessionCookieOptions(req);
  // Force secure=true for cross-origin iframe compatibility.
  // The client always connects via HTTPS proxy, so SameSite=None requires Secure.
  res.cookie(POS_COOKIE_NAME, token, {
    ...opts,
    secure: true,
    sameSite: "none",
    maxAge: ONE_DAY_MS,
  });
}

export function clearPosSessionCookie(res: Response, req: Request) {
  const opts = getSessionCookieOptions(req);
  res.clearCookie(POS_COOKIE_NAME, { ...opts, secure: true, sameSite: "none", maxAge: -1 });
}

export function isAdminOperator(operatorId: string): boolean {
  return operatorId === ADMIN_OPERATOR;
}

export { POS_COOKIE_NAME, POS_HEADER_NAME };
