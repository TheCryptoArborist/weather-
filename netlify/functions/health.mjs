import { json } from "./_shared/weather-core.mjs";

export default async () => json({ ok: true, service: "tree-hurricane-markets", time: new Date().toISOString() });

export const config = {
  path: "/api/health",
  method: ["GET"],
};
