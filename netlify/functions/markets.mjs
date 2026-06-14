import { getMarkets, json } from "./_shared/weather-core.mjs";

export default async () => {
  try {
    return json(await getMarkets());
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unknown market source error" }, 500);
  }
};

export const config = {
  path: "/api/markets",
  method: ["GET"],
};
