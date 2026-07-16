import { mysqlTable, int, varchar, timestamp, boolean, json, text, mysqlEnum } from "drizzle-orm/mysql-core";

/**
 * Users table (original scaffold — unrelated to the custom POS auth,
 * used only by Manus's own unused OAuth system).
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Products table
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  emoji: varchar("emoji", { length: 10 }).notNull(),
  price: int("price").notNull(),
  cost: int("cost").notNull(),
  initialStock: int("initialStock").notNull(),
  threshold: int("threshold").notNull(),
  displayOrder: int("displayOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * Transactions table
 */
export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  operator: varchar("operator", { length: 10 }).notNull(),
  items: json("items").notNull(), // [{product_id, name, emoji, price, cost, qty}]
  total: int("total").notNull(),
  received: int("received").notNull(),
  changeAmount: int("changeAmount").notNull(),
  voided: boolean("voided").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Restocks table
 */
export const restocks = mysqlTable("restocks", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  amount: int("amount").notNull(),
  operator: varchar("operator", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Restock = typeof restocks.$inferSelect;
export type InsertRestock = typeof restocks.$inferInsert;

/**
 * Activity logs table
 */
export const activityLogs = mysqlTable("activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  operator: varchar("operator", { length: 10 }).notNull(),
  operatorName: varchar("operatorName", { length: 50 }).notNull().default(""),
  action: varchar("action", { length: 30 }).notNull(),
  detail: varchar("detail", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;

/**
 * Member PINs table — pin column widened to VARCHAR(255) to hold a
 * salted hash ("salt:hash", ~160 chars) instead of a bare 4-digit PIN.
 */
export const memberPins = mysqlTable("member_pins", {
  id: int("id").autoincrement().primaryKey(),
  memberId: varchar("memberId", { length: 10 }).notNull().unique(),
  pin: varchar("pin", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MemberPin = typeof memberPins.$inferSelect;
export type InsertMemberPin = typeof memberPins.$inferInsert;

/**
 * Accounting entries table — tracks money the POS system itself never
 * otherwise sees: ingredient/goods purchase expenses (matching the
 * school's 仕入帳 ledger format, with optional receipt number/quantity/
 * unit price), items deductible from profit before returning it to the
 * student council (health test fee, money collected from students,
 * exchange fees, etc.), and repayments of the 40,000-yen advance loan.
 */
export const accountingEntries = mysqlTable("accounting_entries", {
  id: int("id").autoincrement().primaryKey(),
  category: varchar("category", { length: 20 }).notNull(), // "purchase" | "deduction" | "loan_repay"
  label: varchar("label", { length: 100 }).notNull(),
  amount: int("amount").notNull(),
  note: varchar("note", { length: 255 }),
  receiptNo: varchar("receiptNo", { length: 50 }),
  quantity: int("quantity"),
  unitPrice: int("unitPrice"),
  operator: varchar("operator", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccountingEntry = typeof accountingEntries.$inferSelect;
export type InsertAccountingEntry = typeof accountingEntries.$inferInsert;
