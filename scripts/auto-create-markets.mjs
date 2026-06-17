import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMarkets } from "../netlify/functions/_shared/weather-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv();

const execute = process.argv.includes("--execute");
const packageId = requiredEnv("SUI_PACKAGE_ID");
const registryId = requiredEnv("SUI_REGISTRY_ID");
const adminCapId = requiredEnv("SUI_ADMIN_CAP_ID");
const clockId = process.env.SUI_CLOCK_ID || "0x6";
const gasBudget = process.env.MARKET_CREATE_GAS_BUDGET || "20000000";
const suiCli = process.env.SUI_CLI || "sui";
const manifestPath = path.resolve(ROOT, process.env.MARKET_AUTOCREATE_MANIFEST || "data/auto-created-markets.json");

const manifest = readManifest(manifestPath);
const payload = await getMarkets();
const plan = payload.markets
  .map((market) => toPlanItem(market, payload.generatedAt))
  .filter((item) => item.expiryMs > Date.now());

if (!plan.length) {
  console.log("No active market templates are currently eligible for creation.");
  process.exit(0);
}

let createdCount = 0;
for (const item of plan) {
  const existing = manifest.markets[item.createKey];
  if (existing?.marketId) {
    console.log(`SKIP ${item.createKey} -> ${existing.marketId}`);
    continue;
  }

  const args = buildSuiArgs(item);
  console.log(`${execute ? "CREATE" : "PLAN"} ${item.createKey}`);
  console.log(formatCommand(args));

  if (!execute) continue;

  const result = await run(suiCli, args);
  if (result.code !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.code || 1);
  }

  const marketId = parseMarketId(result.stdout);
  manifest.markets[item.createKey] = {
    marketId,
    createdAt: new Date().toISOString(),
    sourceGeneratedAt: payload.generatedAt,
    title: item.title,
    question: item.question,
    category: item.category,
    resolutionSource: item.resolutionSource,
    expiryMs: item.expiryMs,
  };
  writeManifest(manifestPath, manifest);
  createdCount += 1;
  console.log(`SAVED ${item.createKey}${marketId ? ` -> ${marketId}` : ""}`);
}

if (!execute) {
  console.log("");
  console.log("Dry run only. Re-run with --execute to submit the planned market creates.");
} else {
  console.log(`Done. Created ${createdCount} new market(s).`);
}

function toPlanItem(market, generatedAt) {
  return {
    createKey: stableCreateKey(market, generatedAt),
    title: market.title,
    question: market.question,
    category: market.category || "Hurricane",
    resolutionSource: market.resolutionEvidence?.sourceUrl || "https://www.nhc.noaa.gov/",
    expiryMs: Number(market.expiryMs),
  };
}

function stableCreateKey(market, generatedAt) {
  const generated = new Date(generatedAt);
  const day = Number.isFinite(generated.getTime()) ? generated.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  if (market.id === "disturbance-named-7d") return `${market.id}:${day}`;
  return `${market.id}:${new Date(Number(market.expiryMs)).toISOString().slice(0, 10)}`;
}

function buildSuiArgs(item) {
  return [
    "client",
    "call",
    "--package",
    packageId,
    "--module",
    "prediction_market",
    "--function",
    "create_market",
    "--args",
    adminCapId,
    registryId,
    item.question,
    item.category,
    item.resolutionSource,
    String(item.expiryMs),
    clockId,
    "--gas-budget",
    gasBudget,
  ];
}

function parseMarketId(output) {
  const parsedJson = tryParseJson(output);
  const events = parsedJson?.events || parsedJson?.effects?.events || [];
  for (const event of events) {
    const marketId = event.parsedJson?.market_id || event.parsedJSON?.market_id;
    if (typeof marketId === "string" && marketId.startsWith("0x")) return marketId;
  }
  const match = output.match(/market_id[\s\S]{0,80}?(0x[a-fA-F0-9]{64})/);
  return match ? match[1] : null;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function formatCommand(args) {
  return `${suiCli} ${args.map(quotePowerShell).join(" ")}`;
}

function quotePowerShell(value) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `"${String(value).replace(/"/g, '`"')}"`;
}

function loadLocalEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill in the Sui deployment values.`);
    process.exit(1);
  }
  return value;
}

function readManifest(filePath) {
  if (!fs.existsSync(filePath)) return { markets: {} };
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return parsed && typeof parsed === "object" && parsed.markets ? parsed : { markets: {} };
}

function writeManifest(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
