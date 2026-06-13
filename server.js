const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

loadLocalEnv();

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const USER_AGENT = process.env.WEATHER_USER_AGENT || "TREE Hurricane Markets prototype contact@example.com";
const CACHE_MS = 5 * 60 * 1000;

const cache = new Map();

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
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

const seedMarkets = [
  {
    id: "disturbance-named",
    icon: "CY",
    category: "Short term",
    filter: "short",
    title: "Current disturbance becomes named storm",
    question: "Will the current disturbance become a named storm?",
    probability: 58,
    volume: "$18,342",
    trades: "1,846",
    expires: "Expires in 5d 14h",
    resolution: "Resolves Yes if NOAA/NHC names the current disturbance as a tropical cyclone before the listed expiry.",
    points: [44, 46, 47, 50, 53, 48, 45, 46, 49, 51, 52, 55, 58],
    source: "NHC Tropical Weather Outlook",
  },
  {
    id: "next-before-july",
    icon: "D1",
    category: "Short term",
    filter: "short",
    title: "Next Atlantic named storm before July 1",
    question: "Will the next Atlantic named storm form before July 1?",
    probability: 41,
    volume: "$15,221",
    trades: "1,204",
    expires: "Expires Jul 1, 2026",
    resolution: "Resolves Yes if NOAA/NHC names a new Atlantic tropical storm before 11:59 PM ET on July 1, 2026.",
    points: [38, 39, 40, 42, 44, 43, 41, 39, 40, 41, 40, 42, 41],
    source: "NHC Current Storms",
  },
  {
    id: "gulf-hurricane-august",
    icon: "GF",
    category: "Season outlook",
    filter: "season",
    title: "Any Gulf hurricane before August 1",
    question: "Will any Atlantic hurricane enter the Gulf before August 1?",
    probability: 35,
    volume: "$22,118",
    trades: "1,517",
    expires: "Expires Aug 1, 2026",
    resolution: "Resolves Yes if NOAA/NHC reports a Category 1 or stronger Atlantic hurricane entering the Gulf before August 1, 2026.",
    points: [31, 33, 34, 35, 37, 36, 34, 33, 34, 36, 35, 34, 35],
    source: "NHC Advisories",
  },
  {
    id: "named-storms-over-10",
    icon: "10+",
    category: "Season outlook",
    filter: "season",
    title: "Season named storms over 10",
    question: "Will the 2026 Atlantic season have more than 10 named storms?",
    probability: 53,
    volume: "$31,882",
    trades: "2,431",
    expires: "Expires Nov 30, 2026",
    resolution: "Resolves Yes if NOAA's post-season Atlantic cyclone report lists 11 or more named storms for 2026.",
    points: [48, 49, 50, 52, 54, 53, 51, 52, 54, 55, 53, 54, 53],
    source: "NOAA/NHC Season Report",
  },
];

const sources = {
  currentStorms: "https://www.nhc.noaa.gov/CurrentStorms.json",
  atlanticOutlook: "https://www.nhc.noaa.gov/gtwo.xml",
  floridaAlerts: "https://api.weather.gov/alerts/active?area=FL",
  gulfWaterLevel: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8724580&product=water_level&datum=MLLW&time_zone=gmt&units=english&format=json",
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function fetchText(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < CACHE_MS) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/xml, */*" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        const result = {
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          url,
          fetchedAt: new Date().toISOString(),
          body,
        };
        cache.set(url, { ...result, time: Date.now() });
        resolve(result);
      });
    });
    request.setTimeout(10000, () => request.destroy(new Error("NOAA request timed out")));
    request.on("error", reject);
  });
}

function parseJsonSource(source) {
  try {
    return JSON.parse(source.body);
  } catch {
    return null;
  }
}

function summarizeOutlook(xml) {
  const title = (xml.match(/<title>(.*?)<\/title>/i) || [null, "NHC Tropical Weather Outlook"])[1];
  const pubDate = (xml.match(/<pubDate>(.*?)<\/pubDate>/i) || [null, null])[1];
  const descriptions = [...xml.matchAll(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/gi)].map((match) =>
    match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  );
  return { title, pubDate, summaries: descriptions.slice(0, 3) };
}

async function getLiveBundle() {
  const results = await Promise.allSettled(Object.entries(sources).map(async ([key, url]) => [key, await fetchText(url)]));
  const bundle = {
    generatedAt: new Date().toISOString(),
    sources: {},
    currentStorms: [],
    outlook: null,
    alerts: [],
    waterLevel: null,
  };

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const [key, source] = result.value;
    bundle.sources[key] = { ok: source.ok, status: source.status, url: source.url, fetchedAt: source.fetchedAt };
    if (!source.ok) continue;

    if (key === "currentStorms") {
      const data = parseJsonSource(source);
      bundle.currentStorms = data && Array.isArray(data.activeStorms) ? data.activeStorms : [];
    }
    if (key === "atlanticOutlook") bundle.outlook = summarizeOutlook(source.body);
    if (key === "floridaAlerts") {
      const data = parseJsonSource(source);
      bundle.alerts = data && Array.isArray(data.features) ? data.features.slice(0, 5).map((feature) => feature.properties) : [];
    }
    if (key === "gulfWaterLevel") {
      const data = parseJsonSource(source);
      bundle.waterLevel = data && Array.isArray(data.data) ? data.data[0] : null;
    }
  }

  return bundle;
}

async function getMarkets() {
  const live = await getLiveBundle();
  return {
    generatedAt: new Date().toISOString(),
    live,
    markets: seedMarkets.map((market) => ({
      ...market,
      lastUpdated: live.generatedAt,
      sourceStatus: Object.values(live.sources).some((source) => source.ok) ? "live" : "fallback",
      resolutionEvidence: {
        status: "Pending",
        source: market.source,
        sourceUrl: market.id === "disturbance-named" ? sources.atlanticOutlook : sources.currentStorms,
        sourceTimestamp: live.generatedAt,
      },
    })),
  };
}

function serveStatic(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json" };
    res.writeHead(200, { "Content-Type": `${types[ext] || "application/octet-stream"}; charset=utf-8` });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/health") return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
    if (req.url === "/api/weather/live") return sendJson(res, 200, await getLiveBundle());
    if (req.url === "/api/markets") return sendJson(res, 200, await getMarkets());
    return serveStatic(req, res);
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`TREE Hurricane Markets running at http://localhost:${PORT}`);
});
