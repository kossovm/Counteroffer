import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Users. No passwords: the jury signs in through demo-account buttons,
 * visitors who start their own session get an anonymous user.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  displayName: text("display_name").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  demoKey: text("demo_key").unique(),
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

/**
 * Negotiation sessions. `config` holds the hidden limit and never leaves the server
 * until the debrief. `state` is the engine's CoreState after the last turn.
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  seed: text("seed").notNull(),
  quiz: jsonb("quiz").notNull(),
  config: jsonb("config").notNull(),
  state: jsonb("state").notNull(),
  openingText: text("opening_text").notNull(),
  status: text("status").notNull(),
  replayOf: uuid("replay_of"),
  debrief: jsonb("debrief"),
  clientIp: text("client_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const turns = pgTable(
  "turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    turn: integer("turn").notNull(),
    record: jsonb("record").notNull(), // engine TurnRecord
    classifiedBy: text("classified_by").notNull(), // "llm" | "heuristic"
    voicedBy: text("voiced_by").notNull(), // "llm" | "template"
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("turns_session_turn").on(t.sessionId, t.turn)],
);

/** Token usage per LLM call, for the daily spend cap. */
export const llmUsage = pgTable("llm_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  purpose: text("purpose").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  usd: numeric("usd", { precision: 10, scale: 5 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

