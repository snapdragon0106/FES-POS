import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock posAuth module.
//
// Only the JWT/cookie side is faked. hashPin/verifyPin/isLegacyPlaintextPin
// and isAdminOperator are pure functions over Node's crypto and the MEMBERS
// roster, so the real implementations are kept: hand-written stand-ins for
// them are what silently drifted away from the module before and left
// posSession.login untested.
vi.mock("./posAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./posAuth")>();
  return {
    ...actual,
    createPosSessionToken: vi.fn().mockResolvedValue("mock-token"),
    verifyPosSession: vi.fn(),
    setPosSessionCookie: vi.fn(),
    clearPosSessionCookie: vi.fn(),
  };
});

// Mock db module. Every function routers.ts calls must appear here — a
// missing one surfaces as "db.x is not a function" rather than a useful
// failure, which is how resetAll's test broke when accounting was added.
vi.mock("./db", () => ({
  getMemberPin: vi.fn(),
  upsertMemberPin: vi.fn(),
  listMemberPins: vi.fn().mockResolvedValue([]),
  deleteMemberPin: vi.fn(),
  listProducts: vi.fn().mockResolvedValue([
    { id: 1, name: "たこ焼き", emoji: "🐙", price: 400, cost: 150, initialStock: 50, threshold: 10, displayOrder: 1 },
  ]),
  createProduct: vi.fn().mockResolvedValue(2),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  deleteAllProducts: vi.fn(),
  listTransactions: vi.fn().mockResolvedValue([]),
  createTransaction: vi.fn().mockResolvedValue(1),
  voidTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  deleteTransactionsByIds: vi.fn(),
  deleteAllTransactions: vi.fn(),
  listRestocks: vi.fn().mockResolvedValue([]),
  createRestock: vi.fn().mockResolvedValue(1),
  deleteAllRestocks: vi.fn(),
  listActivityLogs: vi.fn().mockResolvedValue([]),
  createActivityLog: vi.fn(),
  deleteAllActivityLogs: vi.fn(),
  listAccountingEntries: vi.fn().mockResolvedValue([]),
  createAccountingEntry: vi.fn().mockResolvedValue(1),
  deleteAccountingEntry: vi.fn(),
  deleteAllAccountingEntries: vi.fn(),
}));

function createTestContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: { cookie: "pos_session=mock-token" } } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const ADMIN = "3509";
const NON_ADMIN = "3501";

describe("POS System API", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let posAuth: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    posAuth = await import("./posAuth");
    caller = appRouter.createCaller(createTestContext());
  });

  describe("pin.check", () => {
    it("returns exists: false when no PIN is set", async () => {
      const db = await import("./db");
      (db.getMemberPin as any).mockResolvedValue(undefined);
      const result = await caller.pin.check({ memberId: "3501" });
      expect(result).toEqual({ exists: false });
    });

    it("returns exists: true when PIN is set", async () => {
      const db = await import("./db");
      (db.getMemberPin as any).mockResolvedValue({ memberId: "3501", pin: "1234" });
      const result = await caller.pin.check({ memberId: "3501" });
      expect(result).toEqual({ exists: true });
    });
  });

  describe("pin.reset (admin only)", () => {
    it("allows admin to reset PIN", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: ADMIN, operatorName: "岡田 好平" });
      const result = await caller.pin.reset({ memberId: "3501", pin: "9999" });
      expect(result).toEqual({ success: true });
    });

    it("rejects non-admin", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: NON_ADMIN, operatorName: "青山 琉生" });
      await expect(
        caller.pin.reset({ memberId: "3501", pin: "9999" })
      ).rejects.toThrow("管理者権限が必要です");
    });

    it("rejects unauthenticated", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue(null);
      await expect(
        caller.pin.reset({ memberId: "3501", pin: "9999" })
      ).rejects.toThrow("POSセッションが無効です");
    });
  });

  describe("pin.delete (admin only)", () => {
    it("allows admin to delete PIN", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: ADMIN, operatorName: "岡田 好平" });
      const result = await caller.pin.delete({ memberId: "3501" });
      expect(result).toEqual({ success: true });
    });

    it("rejects non-admin", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: NON_ADMIN, operatorName: "青山 琉生" });
      await expect(
        caller.pin.delete({ memberId: "3501" })
      ).rejects.toThrow("管理者権限が必要です");
    });
  });

  describe("product.list", () => {
    it("returns products list", async () => {
      const result = await caller.product.list();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("たこ焼き");
    });
  });

  describe("product.create (admin only)", () => {
    it("allows admin to create a product", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: ADMIN, operatorName: "岡田 好平" });
      const result = await caller.product.create({
        name: "焼きそば",
        emoji: "🍜",
        price: 400,
        cost: 160,
        initialStock: 40,
        threshold: 10,
        displayOrder: 2,
      });
      expect(result).toEqual({ id: 2 });
    });

    it("rejects non-admin", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: NON_ADMIN, operatorName: "青山 琉生" });
      await expect(
        caller.product.create({
          name: "焼きそば",
          emoji: "🍜",
          price: 400,
          cost: 160,
          initialStock: 40,
          threshold: 10,
          displayOrder: 2,
        })
      ).rejects.toThrow("管理者権限が必要です");
    });
  });

  describe("transaction.create (authenticated)", () => {
    it("creates a transaction for authenticated operator", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: "3509", operatorName: "岡田 好平" });
      const result = await caller.transaction.create({
        items: [{ product_id: 1, name: "たこ焼き", emoji: "🐙", price: 400, cost: 150, qty: 2 }],
        total: 800,
        received: 1000,
        changeAmount: 200,
      });
      expect(result).toEqual({ id: 1 });
    });

    it("rejects unauthenticated", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue(null);
      await expect(
        caller.transaction.create({
          items: [{ product_id: 1, name: "たこ焼き", emoji: "🐙", price: 400, cost: 150, qty: 2 }],
          total: 800,
          received: 1000,
          changeAmount: 200,
        })
      ).rejects.toThrow("POSセッションが無効です");
    });
  });

  describe("transaction.void (admin only)", () => {
    it("allows admin to void a transaction", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: ADMIN, operatorName: "岡田 好平" });
      const result = await caller.transaction.void({ id: 1 });
      expect(result).toEqual({ success: true });
    });

    it("rejects non-admin", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: NON_ADMIN, operatorName: "青山 琉生" });
      await expect(
        caller.transaction.void({ id: 1 })
      ).rejects.toThrow("管理者権限が必要です");
    });
  });

  describe("transaction.delete (admin only)", () => {
    it("allows admin to delete a transaction", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: ADMIN, operatorName: "岡田 好平" });
      const result = await caller.transaction.delete({ id: 1 });
      expect(result).toEqual({ success: true });
    });

    it("rejects non-admin", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: NON_ADMIN, operatorName: "青山 琉生" });
      await expect(
        caller.transaction.delete({ id: 1 })
      ).rejects.toThrow("管理者権限が必要です");
    });
  });

  describe("restock.create (admin only)", () => {
    it("allows admin to create a restock entry", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: ADMIN, operatorName: "岡田 好平" });
      const result = await caller.restock.create({ productId: 1, amount: 10 });
      expect(result).toEqual({ id: 1 });
    });

    it("rejects non-admin", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: NON_ADMIN, operatorName: "青山 琉生" });
      await expect(
        caller.restock.create({ productId: 1, amount: 10 })
      ).rejects.toThrow("管理者権限が必要です");
    });
  });

  describe("activityLog.create", () => {
    it("creates an activity log entry", async () => {
      const result = await caller.activityLog.create({
        operator: "3509",
        operatorName: "岡田 好平",
        action: "login",
        detail: "岡田 好平がログイン",
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe("resetAll (admin only)", () => {
    it("allows admin to reset all data", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: ADMIN, operatorName: "岡田 好平" });
      const result = await caller.resetAll();
      expect(result).toEqual({ success: true });
    });

    it("rejects non-admin", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: NON_ADMIN, operatorName: "青山 琉生" });
      await expect(caller.resetAll()).rejects.toThrow("管理者権限が必要です");
    });

    it("rejects unauthenticated", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue(null);
      await expect(caller.resetAll()).rejects.toThrow("POSセッションが無効です");
    });
  });

  // PIN verification lives inside posSession.login (it used to be a separate
  // pin.verify / pin.setup pair), so the login tests carry that coverage:
  // a session token must never be issued without either matching an existing
  // PIN or registering a brand-new one on first login.
  describe("posSession.login", () => {
    it("issues a session when the PIN matches the stored hash", async () => {
      const db = await import("./db");
      const stored = await posAuth.hashPin("1234");
      (db.getMemberPin as any).mockResolvedValue({ memberId: "3509", pin: stored });

      const result = await caller.posSession.login({ operatorId: "3509", pin: "1234" });

      expect(result).toEqual({ success: true, token: "mock-token", isNewPin: false });
      expect(posAuth.setPosSessionCookie).toHaveBeenCalled();
      // operatorName is derived from MEMBERS server-side, never from input.
      expect(posAuth.createPosSessionToken).toHaveBeenCalledWith("3509", "岡田 好平");
    });

    it("rejects a wrong PIN and issues no session", async () => {
      const db = await import("./db");
      const stored = await posAuth.hashPin("1234");
      (db.getMemberPin as any).mockResolvedValue({ memberId: "3509", pin: stored });

      await expect(
        caller.posSession.login({ operatorId: "3509", pin: "9999" })
      ).rejects.toThrow("PINが違います");
      expect(posAuth.createPosSessionToken).not.toHaveBeenCalled();
      expect(posAuth.setPosSessionCookie).not.toHaveBeenCalled();
    });

    it("registers the PIN on first login and reports isNewPin", async () => {
      const db = await import("./db");
      (db.getMemberPin as any).mockResolvedValue(undefined);

      const result = await caller.posSession.login({ operatorId: "3501", pin: "5678" });

      expect(result).toEqual({ success: true, token: "mock-token", isNewPin: true });
      // The PIN must be stored hashed, never in plaintext.
      const [memberId, storedPin] = (db.upsertMemberPin as any).mock.calls[0];
      expect(memberId).toBe("3501");
      expect(storedPin).not.toBe("5678");
      await expect(posAuth.verifyPin("5678", storedPin)).resolves.toBe(true);
    });

    it("accepts a legacy plaintext PIN and migrates it to a hash", async () => {
      const db = await import("./db");
      (db.getMemberPin as any).mockResolvedValue({ memberId: "3501", pin: "1234" });

      const result = await caller.posSession.login({ operatorId: "3501", pin: "1234" });

      expect(result.success).toBe(true);
      const [, storedPin] = (db.upsertMemberPin as any).mock.calls[0];
      expect(storedPin).not.toBe("1234");
      await expect(posAuth.verifyPin("1234", storedPin)).resolves.toBe(true);
    });

    it("rejects an operator ID outside the class roster", async () => {
      await expect(
        caller.posSession.login({ operatorId: "9999", pin: "1234" })
      ).rejects.toThrow("不正な個人番号です");
    });

    it("rejects a PIN that is not 4 digits", async () => {
      await expect(
        caller.posSession.login({ operatorId: "3501", pin: "abc" })
      ).rejects.toThrow();
    });
  });

  describe("posSession", () => {

    it("logout clears session", async () => {
      const result = await caller.posSession.logout();
      expect(result).toEqual({ success: true });
      expect(posAuth.clearPosSessionCookie).toHaveBeenCalled();
    });

    it("me returns session info", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue({ operatorId: "3509", operatorName: "岡田 好平" });
      const result = await caller.posSession.me();
      expect(result).toEqual({ operatorId: "3509", operatorName: "岡田 好平" });
    });

    it("me returns null when no session", async () => {
      (posAuth.verifyPosSession as any).mockResolvedValue(null);
      const result = await caller.posSession.me();
      expect(result).toBeNull();
    });
  });

  describe("accessCode", () => {
    it("verify returns success with correct code", async () => {
      const result = await caller.accessCode.verify({ code: "3年5組文化祭" });
      expect(result).toEqual({ success: true });
    });

    it("verify returns error with incorrect code", async () => {
      const result = await caller.accessCode.verify({ code: "間違い" });
      expect(result).toEqual({ success: false, error: "合言葉が違います" });
    });

    it("verify returns error with empty code", async () => {
      const result = await caller.accessCode.verify({ code: "" });
      expect(result).toEqual({ success: false, error: "合言葉が違います" });
    });
  });
});
