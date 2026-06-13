import type { Config } from "@netlify/functions";
import { getLiveBundle, json } from "./_shared/weather";

export default async () => {
  try {
    return json(await getLiveBundle());
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unknown weather source error" }, 500);
  }
};

export const config: Config = {
  path: "/api/weather/live",
  method: ["GET"],
};
