import type { Config, Context } from "@netlify/functions";
import { json } from "./_shared/weather";

export default async (_req: Request, context: Context) => {
  return json({ ok: true, requestId: context.requestId, time: new Date().toISOString() });
};

export const config: Config = {
  path: "/api/health",
  method: ["GET"],
};
