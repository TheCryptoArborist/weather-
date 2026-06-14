import { getLiveBundle, json } from "./_shared/weather-core.mjs";

export default async () => {
  try {
    return json(await getLiveBundle());
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unknown weather source error" }, 500);
  }
};

export const config = {
  path: "/api/weather/live",
  method: ["GET"],
};
