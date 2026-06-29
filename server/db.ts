import { eq, desc, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  products, InsertProduct, Product,
  transactions, InsertTransaction, Transaction,
  restocks, InsertRestock, Restock,
  activityLogs, InsertActivityLog, ActivityLog,
  memberPins, InsertMemberPin, MemberPin,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ===== Users =====
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ===== Products =====
export async function listProducts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products).orderBy(asc(products.displayOrder));
}

export async function createProduct(data: Omit<InsertProduct, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(products).values(data);
  return result[0].insertId;
}

export async function updateProduct(id: number, data: Partial<Omit<InsertProduct, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(products).where(eq(products.id, id));
}

export async function deleteAllProducts() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(products);
}

// ===== Transactions =====
export async function listTransactions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(transactions).orderBy(desc(transactions.createdAt));
}

export async function createTransaction(data: Omit<InsertTransaction, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(transactions).values(data);
  return result[0].insertId;
}

export async function voidTransaction(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(transactions).set({ voided: true }).where(eq(transactions.id, id));
}

export async function deleteTransaction(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(transactions).where(eq(transactions.id, id));
}

export async function deleteAllTransactions() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(transactions);
}

// ===== Restocks =====
export async function listRestocks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(restocks).orderBy(desc(restocks.createdAt));
}

export async function createRestock(data: Omit<InsertRestock, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(restocks).values(data);
  return result[0].insertId;
}

export async function deleteAllRestocks() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(restocks);
}

// ===== Activity Logs =====
export async function listActivityLogs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt));
}

export async function createActivityLog(data: Omit<InsertActivityLog, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(activityLogs).values(data);
}

export async function deleteAllActivityLogs() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(activityLogs);
}

// ===== Member PINs =====
export async function listMemberPins() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(memberPins);
}

export async function getMemberPin(memberId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(memberPins).where(eq(memberPins.memberId, memberId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertMemberPin(memberId: string, pin: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getMemberPin(memberId);
  if (existing) {
    await db.update(memberPins).set({ pin }).where(eq(memberPins.memberId, memberId));
  } else {
    await db.insert(memberPins).values({ memberId, pin });
  }
}

export async function deleteMemberPin(memberId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(memberPins).where(eq(memberPins.memberId, memberId));
}

export async function deleteAllMemberPins() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(memberPins);
}
