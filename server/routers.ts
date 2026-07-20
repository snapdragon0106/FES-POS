import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { ADMIN_OPERATOR, ID_MIN, ID_MAX, MEMBERS } from "@shared/posTypes";
import {
  createPosSessionToken,
  verifyPosSession,
  setPosSessionCookie,
  clearPosSessionCookie,
  isAdminOperator,
  hashPin,
  verifyPin,
  isLegacyPlaintextPin,
  type PosSessionPayload,
} from "./posAuth";
import { TRPCError } from "@trpc/server";
import { checkRateLimit, recordFailure, recordSuccess, getClientIp } from "./rateLimiter";
import { timingSafeEqual } from "crypto";

// Requires a valid POS session (PIN-verified login). Throws UNAUTHORIZED
// if the session cookie/header is missing or invalid.
const posAuthenticatedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const session = await verifyPosSession(ctx.req);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "POSセッションが無効です。再ログインしてください。" });
  }
  return next({ ctx: { ...ctx, posOperator: session } });
});

// Requires the authenticated operator to be the admin (ADMIN_OPERATOR).
const posAdminProcedure = posAuthenticatedProcedure.use(({ ctx, next }) => {
  if (!isAdminOperator((ctx as any).posOperator.operatorId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
  }
  return next();
});

export const appRouter = router({
  system: systemRouter,

  // ===== Manus's own (unused) auth scaffold — left in place, harmless =====
  auth: router({
    me: publicProcedure.query((opts) => (opts.ctx as any).user ?? null),
    logout: publicProcedure.mutation(({ ctx }) => {
      // The cookie is set with sameSite/secure/path attributes, and a
      // browser only drops a cookie when those attributes match — so
      // clearCookie(name) alone silently fails to log the user out.
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ===== Access Code (shared class password gate) =====
  accessCode: router({
    verify: publicProcedure
      .input(z.object({ code: z.string() }))
      .mutation(({ input, ctx }) => {
        const rateLimitKey = `accesscode:${getClientIp(ctx.req)}`;
        const limit = checkRateLimit(rateLimitKey);
        if (!limit.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `試行回数が多すぎます。${limit.retryAfterSeconds}秒後に再試行してください`,
          });
        }

        const VALID_CODE = "3年5組文化祭";
        const inputBuf = Buffer.from(input.code);
        const validBuf = Buffer.from(VALID_CODE);
        const matches = inputBuf.length === validBuf.length && timingSafeEqual(inputBuf, validBuf);

        if (matches) {
          recordSuccess(rateLimitKey);
          return { success: true };
        }
        recordFailure(rateLimitKey);
        return { success: false, error: "合言葉が違います" };
      }),
  }),

  // ===== POS Session =====
  posSession: router({
    // PIN verification happens INSIDE login itself, atomically, so a
    // session token can never be issued without either matching an
    // existing PIN or (first login only) registering a brand-new one.
    // operatorName is derived server-side from MEMBERS, never trusted
    // from the client.
    login: publicProcedure
      .input(z.object({
        operatorId: z.string(),
        pin: z.string().regex(/^\d{4}$/, "PINは4桁の数字で入力してください"),
      }))
      .mutation(async ({ input, ctx }) => {
        const num = Number(input.operatorId);
        if (!Number.isInteger(num) || num < ID_MIN || num > ID_MAX) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "不正な個人番号です" });
        }

        // A 4-digit PIN is only 10,000 combinations; without this, nothing
        // stops a script from trying all of them against any operatorId
        // (including the hardcoded admin ID) with no server-side friction.
        const rateLimitKey = `login:${input.operatorId}`;
        const limit = checkRateLimit(rateLimitKey);
        if (!limit.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `試行回数が多すぎます。${limit.retryAfterSeconds}秒後に再試行してください`,
          });
        }

        const operatorName = MEMBERS[num]?.name || "";

        const existing = await db.getMemberPin(input.operatorId);
        let isNewPin = false;
        if (existing) {
          const valid = await verifyPin(input.pin, existing.pin);
          if (!valid) {
            recordFailure(rateLimitKey);
            throw new TRPCError({ code: "UNAUTHORIZED", message: "PINが違います" });
          }
          // Silently migrate a legacy plaintext PIN to a hashed one now
          // that we know it's correct.
          if (isLegacyPlaintextPin(existing.pin)) {
            await db.upsertMemberPin(input.operatorId, await hashPin(input.pin));
          }
        } else {
          // First time this ID has ever logged in — this PIN becomes
          // theirs from now on. Not a brute-force target (any 4-digit PIN
          // succeeds here), so no failure is ever recorded on this branch.
          await db.upsertMemberPin(input.operatorId, await hashPin(input.pin));
          isNewPin = true;
        }

        recordSuccess(rateLimitKey);
        const token = await createPosSessionToken(input.operatorId, operatorName);
        setPosSessionCookie(ctx.res, ctx.req, token);
        // The token lives only in the httpOnly cookie now — it is never
        // returned in the response body, so no JS-readable copy of it ever
        // exists client-side (see posAuth.ts for the rest of this change).
        return { success: true, isNewPin };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearPosSessionCookie(ctx.res, ctx.req);
      return { success: true };
    }),
    me: publicProcedure.query(async ({ ctx }) => {
      return verifyPosSession(ctx.req);
    }),
  }),

  // ===== PIN management =====
  pin: router({
    // Unauthenticated by necessity (the pre-login UI needs to know whether
    // to show "enter PIN" or "set a new PIN" before any session exists),
    // but restricting memberId to the real roster keeps this from
    // answering for arbitrary junk input.
    check: publicProcedure
      .input(z.object({
        memberId: z.string().refine((v) => {
          const n = Number(v);
          return Number.isInteger(n) && n >= ID_MIN && n <= ID_MAX;
        }, "不正な個人番号です"),
      }))
      .query(async ({ input }) => {
        const record = await db.getMemberPin(input.memberId);
        return { exists: !!record };
      }),
    list: posAdminProcedure.query(async () => {
      return db.listMemberPins();
    }),
    reset: posAdminProcedure
      .input(z.object({ memberId: z.string(), pin: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const op = (ctx as any).posOperator as PosSessionPayload;
        await db.upsertMemberPin(input.memberId, await hashPin(input.pin));
        await db.createActivityLog({
          operator: op.operatorId,
          operatorName: MEMBERS[Number(op.operatorId)]?.name || "",
          action: "reset_pin",
          detail: `メンバー${input.memberId}のPINをリセット`,
        });
        return { success: true };
      }),
    delete: posAdminProcedure
      .input(z.object({ memberId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const op = (ctx as any).posOperator as PosSessionPayload;
        await db.deleteMemberPin(input.memberId);
        await db.createActivityLog({
          operator: op.operatorId,
          operatorName: MEMBERS[Number(op.operatorId)]?.name || "",
          action: "delete_pin",
          detail: `メンバー${input.memberId}のPINを削除`,
        });
        return { success: true };
      }),
  }),

  // ===== Products =====
  product: router({
    list: posAuthenticatedProcedure.query(async () => {
      return db.listProducts();
    }),
    create: posAdminProcedure
      .input(z.object({
        name: z.string(),
        emoji: z.string(),
        price: z.number().int().positive(),
        cost: z.number().int().nonnegative(),
        initialStock: z.number().int().nonnegative(),
        threshold: z.number().int().nonnegative(),
        displayOrder: z.number().int(),
      }))
      .mutation(async ({ input }) => {
        const id = await db.createProduct(input);
        return { id };
      }),
    update: posAdminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string(),
        emoji: z.string(),
        price: z.number().int().positive(),
        cost: z.number().int().nonnegative(),
        initialStock: z.number().int().nonnegative(),
        threshold: z.number().int().nonnegative(),
        displayOrder: z.number().int(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateProduct(id, data);
        return { success: true };
      }),
    delete: posAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteProduct(input.id);
        return { success: true };
      }),
  }),

  // ===== Transactions =====
  transaction: router({
    list: posAuthenticatedProcedure.query(async () => {
      return db.listTransactions();
    }),
    create: posAuthenticatedProcedure
      .input(z.object({
        items: z.array(z.object({
          product_id: z.number(),
          name: z.string(),
          emoji: z.string(),
          price: z.number(),
          cost: z.number(),
          qty: z.number(),
        })),
        total: z.number(),
        received: z.number(),
        changeAmount: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const op = (ctx as any).posOperator as PosSessionPayload;

        // Row-lock the involved products for the duration of the checkout
        // (see createTransactionSerialized) so two registers can never both
        // read the same pre-sale stock and both oversell the last unit.
        const productIds = input.items.map((it) => it.product_id);

        const id = await db.createTransactionSerialized(productIds, async (tx) => {
          // Server-side stock validation to prevent overselling across
          // multiple registers. Stock is derived the same way as the
          // client: initialStock - sum(non-voided sales) + sum(restocks).
          const [products, txs, restocks] = await Promise.all([
            tx.listProducts(),
            tx.listTransactions(),
            tx.listRestocks(),
          ]);
          const stock: Record<number, number> = {};
          const productMap: Record<number, (typeof products)[number]> = {};
          for (const p of products) {
            stock[p.id] = p.initialStock || 0;
            productMap[p.id] = p;
          }
          for (const t of txs) {
            if (t.voided) continue;
            const its = (t.items as any[]) || [];
            for (const it of its) {
              if (stock[it.product_id] != null) stock[it.product_id] -= it.qty;
            }
          }
          for (const r of restocks) {
            if (stock[r.productId] != null) stock[r.productId] += r.amount;
          }

          // Recompute authoritative price/cost/total from the product master
          // instead of trusting client-submitted values.
          let serverTotal = 0;
          const verifiedItems = input.items.map((it) => {
            const product = productMap[it.product_id];
            if (!product) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `商品ID ${it.product_id} が見つかりません` });
            }
            if ((stock[it.product_id] ?? 0) < it.qty) {
              throw new TRPCError({ code: "CONFLICT", message: `${product.name}の在庫が不足しています` });
            }
            // Decrement the running balance immediately so a second line
            // item referencing the same product_id (whether from a client
            // bug or a hand-crafted request) is checked against what's
            // actually left, not the pre-checkout snapshot.
            stock[it.product_id] -= it.qty;
            serverTotal += product.price * it.qty;
            return {
              product_id: it.product_id,
              name: product.name,
              emoji: product.emoji,
              price: product.price,
              cost: product.cost,
              qty: it.qty,
            };
          });

          if (input.received < serverTotal) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "預かり金が合計金額に足りません" });
          }

          return {
            operator: op.operatorId,
            items: verifiedItems,
            total: serverTotal,
            received: input.received,
            changeAmount: input.received - serverTotal,
          };
        });

        return { id };
      }),
    // Logs atomically inside the mutation (like deleteMany/accounting.create
    // already did) instead of depending on a second client round-trip —
    // otherwise a dropped connection between the mutation and the client's
    // follow-up activityLog.create call leaves the void with no audit entry.
    void: posAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const op = (ctx as any).posOperator as PosSessionPayload;
        const tx = await db.getTransactionById(input.id);
        if (!tx) {
          throw new TRPCError({ code: "NOT_FOUND", message: "取引が見つかりません" });
        }
        await db.voidTransaction(input.id);
        await db.createActivityLog({
          operator: op.operatorId,
          operatorName: MEMBERS[Number(op.operatorId)]?.name || "",
          action: "void_tx",
          detail: `取引#${input.id} (¥${tx.total.toLocaleString("ja-JP")}) を取消`,
        });
        return { success: true };
      }),
    delete: posAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const op = (ctx as any).posOperator as PosSessionPayload;
        const tx = await db.getTransactionById(input.id);
        if (!tx) {
          throw new TRPCError({ code: "NOT_FOUND", message: "取引が見つかりません" });
        }
        await db.deleteTransaction(input.id);
        await db.createActivityLog({
          operator: op.operatorId,
          operatorName: MEMBERS[Number(op.operatorId)]?.name || "",
          action: "delete_tx",
          detail: `取引#${input.id} (¥${tx.total.toLocaleString("ja-JP")}) を削除`,
        });
        return { success: true };
      }),
    deleteMany: posAdminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1, "1件以上選択してください") }))
      .mutation(async ({ input, ctx }) => {
        const op = (ctx as any).posOperator as PosSessionPayload;
        const deletedCount = await db.deleteTransactionsByIds(input.ids);
        await db.createActivityLog({
          operator: op.operatorId,
          operatorName: MEMBERS[Number(op.operatorId)]?.name || "",
          action: "delete_tx",
          detail: `取引を${deletedCount}件まとめて削除`,
        });
        return { success: true, count: deletedCount };
      }),
  }),

  // ===== Restocks =====
  restock: router({
    list: posAuthenticatedProcedure.query(async () => {
      return db.listRestocks();
    }),
    // Admin-only, matching the UI (InventoryTab only renders the restock
    // buttons when isAdmin). Without this, any logged-in operator could
    // call the endpoint directly and inflate stock past the UI's gate.
    create: posAdminProcedure
      .input(z.object({ productId: z.number(), amount: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const op = (ctx as any).posOperator as PosSessionPayload;
        const id = await db.createRestock({
          productId: input.productId,
          amount: input.amount,
          operator: op.operatorId,
        });
        return { id };
      }),
  }),

  // ===== Activity Logs =====
  activityLog: router({
    list: posAuthenticatedProcedure.query(async () => {
      return db.listActivityLogs();
    }),
    // Requires authentication; operator/operatorName are derived from
    // the verified session, never trusted from client input, so nobody
    // can forge a log entry under someone else's name.
    create: posAuthenticatedProcedure
      .input(z.object({
        action: z.string(),
        detail: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const op = (ctx as any).posOperator as PosSessionPayload;
        await db.createActivityLog({
          operator: op.operatorId,
          operatorName: op.operatorName,
          action: input.action,
          detail: input.detail,
        });
        return { success: true };
      }),
  }),

  // ===== Accounting (purchase expenses / profit deductions / loan repay) =====
  accounting: router({
    list: posAuthenticatedProcedure.query(async () => {
      return db.listAccountingEntries();
    }),
    create: posAuthenticatedProcedure
      .input(z.object({
        category: z.enum(["purchase", "deduction", "loan_repay"]),
        label: z.string().min(1, "項目名を入力してください"),
        amount: z.number().int().positive("金額は1円以上で入力してください"),
        note: z.string().optional(),
        receiptNo: z.string().optional(),
        quantity: z.number().int().positive().optional(),
        unitPrice: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const op = (ctx as any).posOperator as PosSessionPayload;
        const id = await db.createAccountingEntry({
          category: input.category,
          label: input.label,
          amount: input.amount,
          note: input.note,
          receiptNo: input.receiptNo,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          operator: op.operatorId,
        });
        const actionMap = {
          purchase: "add_purchase",
          deduction: "add_deduction",
          loan_repay: "loan_repay",
        } as const;
        await db.createActivityLog({
          operator: op.operatorId,
          operatorName: MEMBERS[Number(op.operatorId)]?.name || "",
          action: actionMap[input.category],
          detail: `${input.label} ${input.amount.toLocaleString("ja-JP")}円`,
        });
        return { id };
      }),
    delete: posAdminProcedure
      .input(z.object({ id: z.number(), category: z.enum(["purchase", "deduction", "loan_repay"]) }))
      .mutation(async ({ input, ctx }) => {
        const op = (ctx as any).posOperator as PosSessionPayload;
        await db.deleteAccountingEntry(input.id);
        const deleteActionMap = {
          purchase: "delete_purchase",
          deduction: "delete_deduction",
          loan_repay: "delete_purchase",
        } as const;
        await db.createActivityLog({
          operator: op.operatorId,
          operatorName: MEMBERS[Number(op.operatorId)]?.name || "",
          action: deleteActionMap[input.category],
          detail: `会計記録#${input.id}を削除`,
        });
        return { success: true };
      }),
  }),

  // ===== Reset All (Admin only) =====
  resetAll: posAdminProcedure.mutation(async () => {
    const defaults = [
      { name: "たこ焼き", emoji: "🐙", price: 400, cost: 150, initialStock: 50, threshold: 10, displayOrder: 1 },
      { name: "焼きそば", emoji: "🍜", price: 400, cost: 160, initialStock: 40, threshold: 10, displayOrder: 2 },
      { name: "フランク", emoji: "🌭", price: 300, cost: 120, initialStock: 60, threshold: 12, displayOrder: 3 },
      { name: "かき氷", emoji: "🍧", price: 250, cost: 80, initialStock: 45, threshold: 10, displayOrder: 4 },
      { name: "チョコバナナ", emoji: "🍌", price: 200, cost: 70, initialStock: 35, threshold: 8, displayOrder: 5 },
      { name: "ポップコーン", emoji: "🍿", price: 250, cost: 90, initialStock: 47, threshold: 10, displayOrder: 6 },
      { name: "ジュース", emoji: "🥤", price: 150, cost: 60, initialStock: 80, threshold: 15, displayOrder: 7 },
      { name: "お茶", emoji: "🍵", price: 120, cost: 50, initialStock: 79, threshold: 15, displayOrder: 8 },
    ];
    // Wrapped in a single DB transaction (db.resetAllData) so a failure
    // partway through can't leave the shop with a half-wiped database.
    await db.resetAllData(defaults);
    return { success: true };
  }),
});

export type AppRouter = typeof appRouter;
