import "server-only";
import { ZodError } from "zod";
import { EngineError } from "@/engine";
import { ApiError } from "./sessions";

/** Uniform JSON errors for route handlers. Internal errors are logged, never leaked. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data);
  } catch (e) {
    if (e instanceof ApiError) return Response.json({ error: e.code }, { status: e.status });
    if (e instanceof ZodError) return Response.json({ error: "invalid_input", issues: e.issues }, { status: 400 });
    if (e instanceof EngineError) return Response.json({ error: e.code }, { status: 409 });
    console.error("[api]", e);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "invalid_json");
  }
}
