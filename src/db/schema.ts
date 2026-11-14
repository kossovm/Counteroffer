import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";

/**
 * Users. No passwords: the jury signs in through demo-account buttons,
 * real users get an account at checkout. Engine tables are added next.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  displayName: text("display_name").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Subscription state mirrored from Polar webhooks. */
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  polarSubscriptionId: text("polar_subscription_id").unique(),
  plan: text("plan").notNull(), // "weekly" | "four_weeks" | "annual"
  status: text("status").notNull(), // "active" | "canceled" | "past_due" ...
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
