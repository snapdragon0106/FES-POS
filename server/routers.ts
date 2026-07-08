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

/**
 * Middleware that extracts the POS operator from the signed session cookie.
 * Attaches posOperator to the context for downstream use.
 */
const posAuthenticatedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const session = await verifyPosSession(ctx.req);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "POSセッションが無効です。再ログインしてください。" });
  }
  return next({ ctx: { ...ctx, posOperator: session } });
});

const posAdminProcedure = posAuthenticatedProcedure.use(({ ctx, next }) => {
  if (!isAdminOperator((ctx as any).posOperator.operatorId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
  }
  return next();
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ===== Access Code =====
  accessCode: router({
    verify: publicProcedure
      .input(z.object({ code: z.string() }))
      .mutation(({ input }) => {
        const VALID_CODE = "3年5組文化祭";
        if (input.code === VALID_CODE) {
          return { success: true };
        }
        return { success: false, error: "合言葉が違います" };
      }),
  }),

  // ===== POS Session =====
  posSession: router({
    // PIN verification now happens INSIDE login itself, atomically, so a
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
        const operatorName = MEMBERS[num]?.name || "";

        const existing = await db.getMemberPin(input.operatorId);
        let isNewPin = false;
        if (existing) {
          const valid = await verifyPin(input.pin, existing.pin);
          if (!valid) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "PINが違います" });
          }
          // Silently migrate a legacy plaintext PIN to a hashed one now
          // that we know it's correct, so it never needs to be touched
          // again in plaintext after this.
          if (isLegacyPlaintextPin(existing.pin)) {
            await db.upsertMemberPin(input.operatorId, await hashPin(input.pin));
          }
        } else {
          // First time this ID has ever logged in — this PIN becomes
          // theirs from now on (same self-service semantics as before,
          // just enforced atomically instead of via a separate,
          // independently-callable pin.setup step).
          await db.upsertMemberPin(input.operatorId, await hashPin(input.pin));
          isNewPin = true;
        }

        const token = await createPosSessionToken(input.operatorId, operatorName);
        setPosSessionCookie(ctx.res, ctx.req, token);
        // Return the token so the client can store it and send it via the
        // x-pos-session header. This keeps auth working in cross-site iframe
        // previews where the Set-Cookie is dropped.
        return { success: true, token, isNewPin };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearPosSessionCookie(ctx.res, ctx.req);
      return { success: true };
    }),
    me: publicProcedure.query(async ({ ctx }) => {
      const session = await verifyPosSession(ctx.req);
      return session;
    }),
  }),

  // ===== PIN Auth =====
  pin: router({
    check: publicProcedure
      .input(z.object({ memberId: z.string() }))
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
          operatorName: op.operatorName,
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
          operatorName: op.operatorName,
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
        emoji: z.string().default("📦"),
        price: z.number(),
        cost: z.number().default(0),
        initialStock: z.number().default(0),
        threshold: z.number().default(10),
        displayOrder: z.number().default(0),
      }))
      .mutation(async ({ input }) => {
        const id = await db.createProduct(input);
        return { id };
      }),
    update: posAdminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        emoji: z.string().optional(),
        price: z.number().optional(),
        cost: z.number().optional(),
        initialStock: z.number().optional(),
        threshold: z.number().optional(),
        displayOrder: z.number().optional(),
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

        // Server-side stock validation to prevent overselling across multiple
        // registers. Stock is derived the same way as the client:
        // initialStock - sum(non-voided sales) + sum(restocks).
        const [products, txs, restocks] = await Promise.all([
          db.listProducts(),
          db.listTransactions(),
          db.listRestocks(),
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
        // instead of trusting client-submitted values. Without this, a
        // forged request could "pay" any price it likes for an item as
        // long as stock was available — only stock was being checked.
        let serverTotal = 0;
        const verifiedItems = input.items.map((it) => {
          const product = productMap[it.product_id];
          if (!product) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `商品ID ${it.product_id} が見つかりません` });
          }
          if ((stock[it.product_id] ?? 0) < it.qty) {
            throw new TRPCError({ code: "CONFLICT", message: `${product.name}の在庫が不足しています` });
          }
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
        const serverChange = input.received - serverTotal;

        const id = await db.createTransaction({
          operator: op.operatorId,
          items: verifiedItems,
          total: serverTotal,
          received: input.received,
          changeAmount: serverChange,
        });
        return { id };
      }),
    void: posAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.voidTransaction(input.id);
        return { success: true };
      }),
    delete: posAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteTransaction(input.id);
        return { success: true };
      }),
  }),

  // ===== Restocks =====
  restock: router({
    list: posAuthenticatedProcedure.query(async () => {
      return db.listRestocks();
    }),
    create: posAdminProcedure
      .input(z.object({
        productId: z.number(),
        amount: z.number(),
      }))
      .mutation(async ({ input }) => {
        const id = await db.createRestock(input);
        return { id };
      }),
  }),

  // ===== Activity Logs =====
  activityLog: router({
    list: posAuthenticatedProcedure.query(async () => {
      return db.listActivityLogs();
    }),
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

  // ===== Reset All (Admin only) =====
  resetAll: posAdminProcedure.mutation(async () => {
    await db.deleteAllTransactions();
    await db.deleteAllRestocks();
    await db.deleteAllActivityLogs();
    await db.deleteAllProducts();
    const defaults = [
      { name: "たこ焼き", emoji: "🐙", price: 400, cost: 150, initialStock: 50, threshold: 10, displayOrder: 1 },
      { name: "焼きそば", emoji: "🍜", price: 400, cost: 160, initialStock: 40, threshold: 10, displayOrder: 2 },
      { name: "フランク", emoji: "🌭", price: 300, cost: 120, initialStock: 60, threshold: 12, displayOrder: 3 },
      { name: "かき氷", emoji: "🍧", price: 250, cost: 80, initialStock: 45, threshold: 10, displayOrder: 4 },
      { name: "チョコバナナ", emoji: "🍌", price: 200, cost: 70, initialStock: 35, threshold: 8, displayOrder: 5 },
      { name: "ポップコーン", emoji: "🍿", price: 250, cost: 90, initialStock: 50, threshold: 10, displayOrder: 6 },
      { name: "ジュース", emoji: "🥤", price: 150, cost: 60, initialStock: 80, threshold: 15, displayOrder: 7 },
      { name: "お茶", emoji: "🍵", price: 120, cost: 40, initialStock: 80, threshold: 15, displayOrder: 8 },
    ];
    for (const p of defaults) {
      await db.createProduct(p);
    }
    return { success: true };
  }),
});

export type AppRouter = typeof appRouter;
