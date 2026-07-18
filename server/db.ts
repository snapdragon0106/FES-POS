import { eq, desc, asc, sql, inArray } from "drizzle-orm";
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
 * Creates the accounting_entries table if it doesn't exist yet, and
 * ensures the receiptNo/quantity/unitPrice columns (added to match the
 * school's official 仕入帳 ledger format) exist even if the table was
 * created by an earlier version of this app. Runs against whichever
 * DATABASE_URL the app is actually using — same self-healing approach
 * as ensurePinColumnWidth, so no manual database console step is ever
 * required.
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
        receiptNo VARCHAR(50),
        quantity INT,
        unitPrice INT,
        operator VARCHAR(10) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    await db.execute(sql`ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS receiptNo VARCHAR(50)`);
    await db.execute(sql`ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS quantity INT`);
    await db.execute(sql`ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS unitPrice INT`);
    console.log("[Migration] accounting_entries table is ready (with receiptNo/quantity/unitPrice).");
  } catch (error) {
    console.error("[Migration] Failed to ensure accounting_entries table:", error);
  }
}

/**
 * Some legacy tables (created by the original Manus scaffold) may be
 * missing the createdAt/updatedAt timestamp columns that the current
 * schema definition expects — selecting a nonexistent column makes
 * every query on that table fail with a 500 (which is exactly what
 * broke checkout: transaction.create reads restocks for stock
 * validation). Adding the columns is harmless if they already exist
 * (ADD COLUMN IF NOT EXISTS is a no-op then), so this runs on every
 * boot, same self-healing approach as the other ensure functions.
 */
async function ensureTimestampColumns(db: NonNullable<typeof _db>): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE restocks ADD COLUMN IF NOT EXISTS createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL`);
    await db.execute(sql`ALTER TABLE restocks ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL`);
    // The REAL missing column (per Render logs: "Unknown column 'operator'
    // in 'field list'"): the original restocks table was created without
    // an operator column. Existing rows get '' as a harmless default.
    await db.execute(sql`ALTER TABLE restocks ADD COLUMN IF NOT EXISTS operator VARCHAR(10) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL`);
    await db.execute(sql`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL`);
    // Other columns the app's schema expects that older versions of these
    // tables may not have had. All harmless no-ops if already present.
    await db.execute(sql`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS operatorName VARCHAR(50) NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS detail VARCHAR(255)`);
    await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS threshold INT NOT NULL DEFAULT 10`);
    await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS displayOrder INT NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL`);
    await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL`);
    await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL`);
    await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL`);
    await db.execute(sql`ALTER TABLE member_pins ADD COLUMN IF NOT EXISTS createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL`);
    await db.execute(sql`ALTER TABLE member_pins ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL`);
    console.log("[Migration] timestamp columns are ensured on all POS tables.");
  } catch (error) {
    console.error("[Migration] Failed to ensure timestamp columns:", error);
  }
  // Diagnostic: log the ACTUAL structure of the restocks table so we can
  // stop guessing why its select keeps failing. Remove once resolved.
  try {
    const cols = await db.execute(sql`SHOW COLUMNS FROM restocks`);
    console.log("[Diagnostic] restocks columns:", JSON.stringify(cols[0]));
  } catch (error) {
    console.error("[Diagnostic] SHOW COLUMNS FROM restocks failed:", error);
  }
}

/**
 * In-flight initialisation promise. Without this, `_db` was assigned
 * *before* the ensure* migrations had run, so a concurrent request would
 * see a non-null `_db`, skip the wait and query a table whose columns did
 * not exist yet — exactly the "Unknown column 'operator' in 'field list'"
 * burst seen in the Render logs right before the [Migration] lines. Every
 * caller now awaits the same promise, and `_db` is only published once the
 * migrations have finished.
 */
let _dbInit: Promise<ReturnType<typeof drizzle> | null> | null = null;

export async function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) return null;
  if (!_dbInit) {
    _dbInit = (async () => {
      try {
        const db = drizzle(process.env.DATABASE_URL!);
        await ensurePinColumnWidth(db);
        await ensureAccountingTable(db);
        await ensureTimestampColumns(db);
        _db = db;
        return db;
      } catch (error) {
        console.warn("[Database] Failed to connect:", error);
        // Clear the memo so a later request can retry instead of being
        // permanently stuck with a failed connection.
        _dbInit = null;
        return null;
      }
    })();
  }
  return _dbInit;
}

// ===== Users =====
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(users).values(user).onDuplicateKeyUpdate({ set: user });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(users).where(eq(users.openId, openId));
  return rows[0] || null;
}

// ===== Products =====
// Throws (rather than returning []) when the DB is unreachable, matching
// every create*/delete* function below — otherwise a DB outage looked
// identical to "no products exist yet" from the cashier's screen instead of
// a visible error.
export async function listProducts(): Promise<Product[]> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
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
export async function listTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.select().from(transactions).orderBy(desc(transactions.createdAt));
}

export async function createTransaction(data: Omit<InsertTransaction, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(transactions).values(data);
  return result[0].insertId;
}

/**
 * Runs a checkout inside a single DB transaction, row-locking the involved
 * products first (SELECT ... FOR UPDATE, in a stable id order to avoid
 * deadlocks between concurrent checkouts). Without this, two registers
 * reading stock for the same product at the same time could both read the
 * pre-sale count, both pass validation, and both insert — overselling the
 * last unit. `build` re-reads transactions/restocks/products *inside* the
 * transaction (so it sees a consistent snapshot serialized against the
 * lock) and returns the row to insert; MySQL/TiDB holds the row locks until
 * this transaction commits or rolls back, so a concurrent checkout for the
 * same product blocks until this one finishes and then sees the updated
 * stock.
 */
export async function createTransactionSerialized(
  productIds: number[],
  build: (tx: {
    listProducts: () => Promise<Product[]>;
    listTransactions: () => Promise<Transaction[]>;
    listRestocks: () => Promise<Restock[]>;
  }) => Promise<Omit<InsertTransaction, "id" | "createdAt" | "updatedAt">>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async (tx) => {
    const uniqueIds = Array.from(new Set(productIds)).sort((a, b) => a - b);
    if (uniqueIds.length > 0) {
      // Lock just the rows this checkout touches, in a stable order, so
      // concurrent checkouts for disjoint products never block each other
      // and checkouts sharing a product serialize instead of deadlocking.
      await tx.select().from(products).where(inArray(products.id, uniqueIds)).for("update");
    }
    const data = await build({
      listProducts: () => tx.select().from(products).orderBy(asc(products.displayOrder)),
      listTransactions: () => tx.select().from(transactions).orderBy(desc(transactions.createdAt)),
      listRestocks: () => tx.select().from(restocks).orderBy(desc(restocks.createdAt)),
    });
    const result = await tx.insert(transactions).values(data);
    return result[0].insertId;
  });
}

export async function getTransactionById(id: number): Promise<Transaction | undefined> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(transactions).where(eq(transactions.id, id));
  return rows[0];
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

export async function deleteTransactionsByIds(ids: number[]): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return 0;
  const result = await db.delete(transactions).where(inArray(transactions.id, ids));
  return result[0].affectedRows;
}

export async function deleteAllTransactions() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(transactions);
}

// ===== Restocks =====
export async function listRestocks(): Promise<Restock[]> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  try {
    return await db.select().from(restocks).orderBy(desc(restocks.createdAt));
  } catch (error) {
    // Surface the REAL database error (e.g. which column is unknown) in
    // the server logs instead of only tRPC's generic "Failed query".
    console.error("[Diagnostic] listRestocks raw DB error:", error);
    throw error;
  }
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
export async function listActivityLogs(): Promise<ActivityLog[]> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
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
export async function getMemberPin(memberId: string): Promise<MemberPin | undefined> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(memberPins).where(eq(memberPins.memberId, memberId));
  return rows[0];
}

export async function listMemberPins(): Promise<MemberPin[]> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.select().from(memberPins);
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
  if (!db) throw new Error("DB not available");
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

/**
 * Wipes transactions/restocks/activity logs/products/accounting entries and
 * reseeds the default product list, all inside one DB transaction. The five
 * deletes plus the reseed loop used to be separate unguarded awaits — if any
 * one of them failed partway through (e.g. a transient connection blip), the
 * shop was left in a half-wiped, half-reseeded state with no way back.
 * Wrapping it in a transaction means it either fully succeeds or fully rolls
 * back to what was there before.
 */
export async function resetAllData(defaults: Omit<InsertProduct, "id" | "createdAt" | "updatedAt">[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.transaction(async (tx) => {
    await tx.delete(transactions);
    await tx.delete(restocks);
    await tx.delete(activityLogs);
    await tx.delete(products);
    await tx.delete(accountingEntries);
    for (const p of defaults) {
      await tx.insert(products).values(p);
    }
  });
}
