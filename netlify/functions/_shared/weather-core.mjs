const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

const sources = {
  currentStorms: "https://www.nhc.noaa.gov/CurrentStorms.json",
  atlanticOutlook: "https://www.nhc.noaa.gov/gtwo.xml",
  alerts: {
    FL: "https://api.weather.gov/alerts/active?area=FL",
    TX: "https://api.weather.gov/alerts/active?area=TX",
    LA: "https://api.weather.gov/alerts/active?area=LA",
    MS: "https://api.weather.gov/alerts/active?area=MS",
    AL: "https://api.weather.gov/alerts/active?area=AL",
  },
  waterLevels: {
    keyWest: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8724580&product=water_level&datum=MLLW&time_zone=gmt&units=english&format=json",
    grandIsle: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8761724&product=water_level&datum=MLLW&time_zone=gmt&units=english&format=json",
    galveston: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8771450&product=water_level&datum=MLLW&time_zone=gmt&units=english&format=json",
  },
};

function clamp(value, min = 1, max = 99) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function userAgent() {
  if (globalThis.Netlify?.env?.get) return globalThis.Netlify.env.get("WEATHER_USER_AGENT") || "TREE Hurricane Markets testing contact@example.com";
  return process.env.WEATHER_USER_AGENT || "TREE Hurricane Markets testing contact@example.com";
}

async function fetchText(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent(),
        Accept: "application/json, text/xml, */*",
      },
      signal: controller.signal,
    });
    const result = {
      ok: response.ok,
      status: response.status,
      url,
      fetchedAt: new Date().toISOString(),
      body: await response.text(),
      time: Date.now(),
    };
    cache.set(url, result);
    return result;
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      fetchedAt: new Date().toISOString(),
      body: "",
      error: error instanceof Error ? error.message : "Fetch failed",
      time: Date.now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(source) {
  try {
    return JSON.parse(source.body);
  } catch {
    return null;
  }
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOutlook(xml) {
  const title = stripHtml((xml.match(/<title>(.*?)<\/title>/i) || [null, "NHC Tropical Weather Outlook"])[1]);
  const pubDate = stripHtml((xml.match(/<pubDate>(.*?)<\/pubDate>/i) || [null, ""])[1]);
  const descriptions = [...xml.matchAll(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
  const joined = descriptions.join(" ");
  const chances = [...joined.matchAll(/(\d{1,3})\s*percent/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  return {
    title,
    pubDate,
    summaries: descriptions.slice(0, 4),
    maxFormationChance: chances.length ? Math.max(...chances) : 0,
  };
}

function parseStorms(data) {
  if (!data) return [];
  const candidates = data.activeStorms || data.storms || data.features || [];
  if (!Array.isArray(candidates)) return [];
  return candidates.map((storm) => ({
    id: storm.id || storm.binNumber || storm.name || "storm",
    name: storm.name || storm.stormName || storm.id || "Active storm",
    classification: storm.classification || storm.type || storm.status || "Tracked system",
    intensity: storm.intensity || storm.windSpeed || storm.maxWind || null,
  }));
}

function parseAlerts(data) {
  if (!data || !Array.isArray(data.features)) return [];
  return data.features.map((feature) => ({
    id: feature.id,
    event: feature.properties?.event || "Weather alert",
    severity: feature.properties?.severity || "Unknown",
    area: feature.properties?.areaDesc || "",
    updated: feature.properties?.updated || null,
  }));
}

function parseWaterLevel(data, station) {
  const latest = data && Array.isArray(data.data) ? data.data[0] : null;
  return {
    station,
    value: latest?.v || null,
    time: latest?.t || null,
  };
}

function daysUntil(monthIndex, day) {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), monthIndex, day, 23, 59, 59));
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function easternDeadlineMs(monthIndex, day) {
  const year = new Date().getUTCFullYear();
  const utcHour = monthIndex >= 2 && monthIndex <= 9 ? 3 : 4;
  return Date.UTC(year, monthIndex, day + 1, utcHour, 59, 59, 999);
}

function rollingExpiryMs(days) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

function buildPoints(probability, variation = 6) {
  const points = [];
  for (let index = 0; index < 13; index += 1) {
    const wave = Math.sin(index / 1.7) * variation;
    const drift = (index - 6) * 0.6;
    points.push(clamp(probability + wave + drift, 1, 99));
  }
  points[points.length - 1] = probability;
  return points;
}

function buildMarkets(live) {
  const maxFormationChance = live.outlook.maxFormationChance || 0;
  const stormCount = live.activeStormCount;
  const alertPressure = Math.min(20, live.alertCount * 2);
  const julyDays = Math.max(0, daysUntil(6, 1));
  const augustDays = Math.max(0, daysUntil(7, 1));
  const seasonProgress = Math.max(0, Math.min(1, (Date.now() - Date.UTC(new Date().getUTCFullYear(), 5, 1)) / (Date.UTC(new Date().getUTCFullYear(), 10, 30) - Date.UTC(new Date().getUTCFullYear(), 5, 1))));

  const disturbanceNamed = clamp(maxFormationChance ? maxFormationChance + 8 : 18 + stormCount * 18 + alertPressure);
  const nextBeforeJuly = clamp(28 + Math.max(0, 24 - julyDays) * 1.2 + maxFormationChance * 0.35 + stormCount * 12);
  const gulfBeforeAugust = clamp(22 + Math.max(0, 45 - augustDays) * 0.45 + maxFormationChance * 0.28 + alertPressure);
  const seasonOverTen = clamp(46 + seasonProgress * 18 + stormCount * 4 + maxFormationChance * 0.12);

  return [
    {
      id: "disturbance-named-7d",
      icon: "7D",
      category: "Short term",
      filter: "short",
      title: "Current Atlantic disturbance becomes named",
      question: "Will an active Atlantic disturbance become a named storm in the next 7 days?",
      probability: disturbanceNamed,
      volume: `${(260 + disturbanceNamed * 8).toFixed(0)} SUI`,
      trades: String(70 + disturbanceNamed * 4),
      expires: "7-day window",
      expiryMs: rollingExpiryMs(7),
      resolution: "Resolves YES if NOAA/NHC names a new Atlantic tropical cyclone within the stated 7-day window.",
      source: "NHC Tropical Weather Outlook",
      points: buildPoints(disturbanceNamed),
      resolutionEvidence: {
        status: "Pending",
        source: "NHC Tropical Weather Outlook",
        sourceUrl: sources.atlanticOutlook,
        sourceTimestamp: live.generatedAt,
      },
    },
    {
      id: "next-named-before-july",
      icon: "JUL",
      category: "Short term",
      filter: "short",
      title: "Next Atlantic named storm before July 1",
      question: "Will the next Atlantic named storm form before July 1?",
      probability: nextBeforeJuly,
      volume: `${(310 + nextBeforeJuly * 7).toFixed(0)} SUI`,
      trades: String(90 + nextBeforeJuly * 3),
      expires: "July 1",
      expiryMs: easternDeadlineMs(6, 1),
      resolution: "Resolves YES if NOAA/NHC lists a new Atlantic named storm before 11:59 PM ET on July 1.",
      source: "NHC CurrentStorms",
      points: buildPoints(nextBeforeJuly, 5),
      resolutionEvidence: {
        status: "Pending",
        source: "NHC CurrentStorms",
        sourceUrl: sources.currentStorms,
        sourceTimestamp: live.generatedAt,
      },
    },
    {
      id: "gulf-hurricane-before-august",
      icon: "GULF",
      category: "Season",
      filter: "season",
      title: "Gulf hurricane before August 1",
      question: "Will any Atlantic hurricane enter the Gulf before August 1?",
      probability: gulfBeforeAugust,
      volume: `${(410 + gulfBeforeAugust * 9).toFixed(0)} SUI`,
      trades: String(120 + gulfBeforeAugust * 4),
      expires: "August 1",
      expiryMs: easternDeadlineMs(7, 1),
      resolution: "Resolves YES if NOAA/NHC reports a Category 1 or stronger Atlantic hurricane entering the Gulf before August 1.",
      source: "NHC advisories",
      points: buildPoints(gulfBeforeAugust, 4),
      resolutionEvidence: {
        status: "Pending",
        source: "NHC advisories and best track",
        sourceUrl: sources.currentStorms,
        sourceTimestamp: live.generatedAt,
      },
    },
    {
      id: "season-named-storms-over-10",
      icon: "10+",
      category: "Season",
      filter: "season",
      title: "Atlantic season over 10 named storms",
      question: "Will the Atlantic hurricane season finish with more than 10 named storms?",
      probability: seasonOverTen,
      volume: `${(520 + seasonOverTen * 10).toFixed(0)} SUI`,
      trades: String(160 + seasonOverTen * 4),
      expires: "November 30",
      expiryMs: easternDeadlineMs(10, 30),
      resolution: "Resolves YES if NOAA's post-season Atlantic tropical cyclone report lists 11 or more named storms.",
      source: "NOAA/NHC season report",
      points: buildPoints(seasonOverTen, 3),
      resolutionEvidence: {
        status: "Pending",
        source: "NOAA/NHC post-season report",
        sourceUrl: "https://www.nhc.noaa.gov/data/tcr/",
        sourceTimestamp: live.generatedAt,
      },
    },
  ];
}

export async function getLiveBundle() {
  const sourceList = [
    ["currentStorms", sources.currentStorms],
    ["atlanticOutlook", sources.atlanticOutlook],
    ...Object.entries(sources.alerts).map(([state, url]) => [`alert:${state}`, url]),
    ...Object.entries(sources.waterLevels).map(([station, url]) => [`water:${station}`, url]),
  ];
  const results = await Promise.all(sourceList.map(async ([key, url]) => [key, await fetchText(url)]));

  const live = {
    generatedAt: new Date().toISOString(),
    sources: {},
    currentStorms: [],
    activeStormCount: 0,
    outlook: { title: "NHC Tropical Weather Outlook", pubDate: "", summaries: [], maxFormationChance: 0 },
    alerts: [],
    alertCount: 0,
    waterLevels: [],
  };

  for (const [key, source] of results) {
    live.sources[key] = { ok: source.ok, status: source.status, url: source.url, fetchedAt: source.fetchedAt, error: source.error || null };
    if (!source.ok) continue;

    if (key === "currentStorms") {
      live.currentStorms = parseStorms(parseJson(source));
      live.activeStormCount = live.currentStorms.length;
    } else if (key === "atlanticOutlook") {
      live.outlook = parseOutlook(source.body);
    } else if (key.startsWith("alert:")) {
      live.alerts.push(...parseAlerts(parseJson(source)));
    } else if (key.startsWith("water:")) {
      live.waterLevels.push(parseWaterLevel(parseJson(source), key.replace("water:", "")));
    }
  }

  live.alertCount = live.alerts.length;
  return live;
}

export async function getMarkets() {
  const live = await getLiveBundle();
  return {
    generatedAt: new Date().toISOString(),
    live,
    markets: buildMarkets(live).map((market) => ({
      ...market,
      lastUpdated: live.generatedAt,
      sourceStatus: Object.values(live.sources).some((source) => source.ok) ? "live" : "fallback",
    })),
  };
}

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
