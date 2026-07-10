import { eq, desc, asc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  products, InsertProduct, Product,
  transactions, InsertTransaction, Transaction,
  restocks, InsertRestock, Restock,
  activityLogs, InsertActivityLog, ActivityLog,
  memberPins, InsertMemberPin, MemberPin,
  accountingEntries, InsertAccountingEntry, AccountingEntry,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * One-time-per-boot schema fix: the `member_pins.pin` column was
 * originally sized for a plain 4-digit PIN (varchar(4)). PINs are now
 * stored as a salted hash (~160 characters), so the column needs to be
 * wider. This runs against whatever DATABASE_URL the server is actually
 * using — the exact connection the running app already trusts — so
 * there's no risk of it landing on the wrong database via a database
 * console. Safe to leave in permanently: widening an already-wide
 * column is a harmless no-op.
 */
async function ensurePinColumnWidth(db: NonNullable<typeof _db>): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE member_pins MODIFY COLUMN pin VARCHAR(255) NOT NULL`);
    console.log("[Migration] member_pins.pin column is VARCHAR(255) or wider.");
  } catch (error) {
    console.error("[Migration] Failed to widen member_pins.pin column:", error);
  }
}

/**
 * Creates the accounting_entries table if it doesn't exist yet. Runs
 * against whichever DATABASE_URL the app is actually using — same
 * self-healing approach as ensurePinColumnWidth, so no manual database
 * console step is ever required.
 */
async function ensureAccountingTable(db: NonNullable<typeof _db>): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS accounting_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(20) NOT NULL,
        label VARCHAR(100) NOT NULL,
        amount INT NOT NULL,
        note VARCHAR(255),
        operator VARCHAR(10) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    console.log("[Migration] accounting_entries table is ready.");
  } catch (error) {
    console.error("[Migration] Failed to ensure accounting_entries table:", error);
  }
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
      await ensurePinColumnWidth(_db);
      await ensureAccountingTable(_db);
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

// ===== Accounting Entries (purchases / deductions / loan repayments) =====
export async function listAccountingEntries(): Promise<AccountingEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accountingEntries).orderBy(desc(accountingEntries.createdAt));
}

export async function createAccountingEntry(entry: InsertAccountingEntry): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(accountingEntries).values(entry);
  return result[0].insertId;
}

export async function deleteAccountingEntry(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(accountingEntries).where(eq(accountingEntries.id, id));
}

export async function deleteAllAccountingEntries() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(accountingEntries);
}
