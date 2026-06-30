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
    login: publicProcedure
      .input(z.object({ operatorId: z.string(), operatorName: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const token = await createPosSessionToken(input.operatorId, input.operatorName);
        setPosSessionCookie(ctx.res, ctx.req, token);
        // Return the token so the client can store it and send it via the
        // x-pos-session header. This keeps auth working in cross-site iframe
        // previews where the Set-Cookie is dropped.
        return { success: true, token };
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
    verify: publicProcedure
      .input(z.object({ memberId: z.string(), pin: z.string() }))
      .mutation(async ({ input }) => {
        const record = await db.getMemberPin(input.memberId);
        if (!record) return { success: false, error: "PIN未設定" };
        if (record.pin !== input.pin) return { success: false, error: "PINが違います" };
        return { success: true };
      }),
    setup: publicProcedure
      .input(z.object({ memberId: z.string(), pin: z.string() }))
      .mutation(async ({ input }) => {
        // Block overwriting an existing PIN via direct API calls (account hijack).
        // Normal first-time login only reaches here when no PIN exists yet.
        const existing = await db.getMemberPin(input.memberId);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "既にPINが設定されています" });
        }
        await db.upsertMemberPin(input.memberId, input.pin);
        return { success: true };
      }),
    list: posAdminProcedure.query(async () => {
      return db.listMemberPins();
    }),
    reset: posAdminProcedure
      .input(z.object({ memberId: z.string(), pin: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const op = (ctx as any).posOperator as PosSessionPayload;
        await db.upsertMemberPin(input.memberId, input.pin);
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
    list: publicProcedure.query(async () => {
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
    list: publicProcedure.query(async () => {
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
        for (const p of products) stock[p.id] = p.initialStock || 0;
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
        for (const it of input.items) {
          if ((stock[it.product_id] ?? 0) < it.qty) {
            throw new TRPCError({ code: "CONFLICT", message: `${it.name}の在庫が不足しています` });
          }
        }

        const id = await db.createTransaction({
          operator: op.operatorId,
          items: input.items,
          total: input.total,
          received: input.received,
          changeAmount: input.changeAmount,
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
    list: publicProcedure.query(async () => {
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
    list: publicProcedure.query(async () => {
      return db.listActivityLogs();
    }),
    create: publicProcedure
      .input(z.object({
        operator: z.string(),
        operatorName: z.string().default(""),
        action: z.string(),
        detail: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.createActivityLog(input);
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
