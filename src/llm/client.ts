import Anthropic from "@anthropic-ai/sdk";
import { gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Thin wrapper over the Anthropic API with a hard daily spend cap. When the cap is reached, the key
 * is missing, or a call fails, callers fall back to deterministic code, so the product never stops.
 */

export const MODELS = {
  fast: process.env.LLM_MODEL_FAST || "claude-haiku-5-5",
  main: process.env.LLM_MODEL_MAIN || "claude-sonnet-5-5",
  deep: process.env.LLM_MODEL_DEEP || "claude-opus-5-5",
};

/** USD per million tokens [input, output]. Conservative estimates, overridable via env. */
function priceFor(model: string): [number, number] {
  const env = (k: string) => (process.env[k] ? Number(process.env[k]) : undefined);
  if (model.includes("haiku")) return [env("LLM_PRICE_FAST_IN") ?? 1, env("LLM_PRICE_FAST_OUT") ?? 5];
  if (model.includes("opus")) return [env("LLM_PRICE_DEEP_IN") ?? 15, env("LLM_PRICE_DEEP_OUT") ?? 75];
  return [env("LLM_PRICE_MAIN_IN") ?? 3, env("LLM_PRICE_MAIN_OUT") ?? 15];
}

const globalForLlm = globalThis as unknown as { anthropic?: Anthropic };
function client(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  globalForLlm.anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 20_000 });
  return globalForLlm.anthropic;
}

export class LlmUnavailable extends Error {}

async function spentTodayUsd(): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.llmUsage.usd}), 0)` })
    .from(schema.llmUsage)
    .where(gte(schema.llmUsage.createdAt, since));
  return Number(row?.total ?? 0);
}

async function guard(): Promise<Anthropic> {
  const c = client();
  if (!c) throw new LlmUnavailable("no_api_key");
  const budget = Number(process.env.LLM_DAILY_BUDGET_USD ?? 15);
  if ((await spentTodayUsd()) >= budget) throw new LlmUnavailable("daily_budget_reached");
  return c;
}

async function record(purpose: string, model: string, usage: { input_tokens: number; output_tokens: number }) {
  const [pin, pout] = priceFor(model);
  const usd = (usage.input_tokens * pin + usage.output_tokens * pout) / 1_000_000;
  await db.insert(schema.llmUsage).values({
    purpose,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    usd: usd.toFixed(5),
  });
}

interface CallOpts {
  purpose: string;
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens: number;
}

export async function callText(o: CallOpts): Promise<string> {
  const c = await guard();
  const res = await c.messages.create({
    model: o.model,
    max_tokens: o.maxTokens,
    system: o.system,
    messages: o.messages,
  });
  await record(o.purpose, o.model, res.usage);
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Structured output: the model must return JSON matching `schema`. Returns the parsed object (unvalidated). */
export async function callJson(o: CallOpts & { schema: Record<string, unknown> }): Promise<unknown> {
  const c = await guard();
  const res = await c.messages.create({
    model: o.model,
    max_tokens: o.maxTokens,
    system: o.system,
    messages: o.messages,
    output_config: { format: { type: "json_schema", schema: o.schema } },
  });
  await record(o.purpose, o.model, res.usage);
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text);
}
