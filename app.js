const fallbackMarkets = [
  {
    id: "backend-required",
    icon: "API",
    category: "Short term",
    filter: "short",
    title: "Start backend for live markets",
    question: "Run npm start or npm run netlify:dev to load NOAA/NHC-backed markets.",
    probability: 50,
    volume: "0 SUI",
    trades: "0",
    expires: "Backend required",
    resolution: "Official source evidence is served from backend functions so resolution logic is not exposed in browser-visible code.",
    points: [50, 50, 50, 50, 50, 50, 50],
  },
];

let markets = [...fallbackMarkets];
let selectedMarketId = markets[0].id;
let activeFilter = "all";
let selectedSide = "yes";
let tradeNoticeTimer = null;

const elements = {
  marketItems: document.querySelector("#marketItems"),
  amountInput: document.querySelector("#amountInput"),
  sharesOut: document.querySelector("#sharesOut"),
  feeOut: document.querySelector("#feeOut"),
  totalOut: document.querySelector("#totalOut"),
  buyButton: document.querySelector("#buyButton"),
  sourceStatus: document.querySelector("#sourceStatus"),
  sourceUpdated: document.querySelector("#sourceUpdated"),
  sourceDot: document.querySelector("#sourceDot"),
  sourceEvidence: document.querySelector("#sourceEvidence"),
  activeStorms: document.querySelector("#activeStorms"),
  formationChance: document.querySelector("#formationChance"),
  alertCount: document.querySelector("#alertCount"),
  waterLevel: document.querySelector("#waterLevel"),
};

function currentMarket() {
  return markets.find((market) => market.id === selectedMarketId) || markets[0];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMarkets() {
  const visible = activeFilter === "all" ? markets : markets.filter((market) => market.filter === activeFilter);
  elements.marketItems.innerHTML = visible
    .map(
      (market) => `
        <button class="market-item ${market.id === selectedMarketId ? "active" : ""}" type="button" data-market="${escapeHtml(market.id)}">
          <span class="market-icon">${escapeHtml(market.icon)}</span>
          <span class="market-copy">
            <strong>${escapeHtml(market.title)}</strong>
            <p>${escapeHtml(market.question)}</p>
            <span>${escapeHtml(market.expires)} - ${escapeHtml(market.volume)}</span>
          </span>
          <span class="probability"><strong>${Number(market.probability).toFixed(0)}%</strong><span>YES</span></span>
        </button>
      `,
    )
    .join("");
}

function chartPath(points) {
  const safePoints = points && points.length > 1 ? points : [50, 50];
  const width = 760;
  const height = 220;
  const step = width / (safePoints.length - 1);
  const yFor = (value) => height - (Math.max(0, Math.min(100, value)) / 100) * height;
  const line = safePoints.map((value, index) => `${index === 0 ? "M" : "L"}${index * step} ${yFor(value)}`).join(" ");
  return { line, area: `${line} L${width} ${height} L0 ${height} Z` };
}

function renderDetail() {
  const market = currentMarket();
  document.querySelector("#detailIcon").textContent = market.icon;
  document.querySelector("#detailTitle").textContent = market.title;
  document.querySelector("#detailQuestion").textContent = market.question;
  document.querySelector("#detailCategory").textContent = market.category;
  document.querySelector("#detailExpiry").textContent = market.expires;
  document.querySelector("#detailProbability").textContent = `${Number(market.probability).toFixed(0)}%`;
  document.querySelector("#detailVolume").textContent = market.volume;
  document.querySelector("#chartPrice").textContent = `${Number(market.probability).toFixed(0)}c YES`;
  document.querySelector("#detailResolution").textContent = market.resolution;
  document.querySelector("#yesPrice").textContent = `${Number(market.probability).toFixed(0)}c`;
  document.querySelector("#noPrice").textContent = `${(100 - Number(market.probability)).toFixed(0)}c`;

  const evidence = market.resolutionEvidence;
  elements.sourceEvidence.innerHTML = evidence
    ? `<strong>${escapeHtml(evidence.status)}</strong> - ${escapeHtml(evidence.source)} - <a href="${escapeHtml(evidence.sourceUrl)}" target="_blank" rel="noreferrer">official source</a>`
    : "Pending NOAA/NHC source evidence.";

  const path = chartPath(market.points);
  document.querySelector("#chartLine").setAttribute("d", path.line);
  document.querySelector("#chartArea").setAttribute("d", path.area);
  updateTradeSummary();
}

function renderLiveSummary(live) {
  const maxChance = live?.outlook?.maxFormationChance;
  const water = Array.isArray(live?.waterLevels) ? live.waterLevels.find((level) => level?.value) : null;
  elements.activeStorms.textContent = String(live?.activeStormCount ?? live?.currentStorms?.length ?? 0);
  elements.formationChance.textContent = Number.isFinite(maxChance) ? `${maxChance}%` : "--";
  elements.alertCount.textContent = String(live?.alertCount ?? 0);
  elements.waterLevel.textContent = water?.value ? `${water.value} ft` : "--";
}

async function loadLiveMarkets() {
  if (window.location.protocol === "file:") {
    setSourceState("pending", "Static fallback", "Run npm start for live data");
    return;
  }

  setSourceState("pending", "Loading sources", "Checking NOAA/NHC");
  try {
    const response = await fetch("/api/markets", { cache: "no-store" });
    if (!response.ok) throw new Error(`Backend returned ${response.status}`);
    const payload = await response.json();
    if (Array.isArray(payload.markets) && payload.markets.length) {
      markets = payload.markets;
      selectedMarketId = markets.some((market) => market.id === selectedMarketId) ? selectedMarketId : markets[0].id;
      renderLiveSummary(payload.live);
      renderMarkets();
      renderDetail();
      setSourceState("live", "Live sources", `Updated ${new Date(payload.generatedAt).toLocaleString()}`);
    }
  } catch (error) {
    setSourceState("error", "Source unavailable", "Using safe fallback data");
  }
}

function setSourceState(state, title, subtitle) {
  elements.sourceStatus.textContent = title;
  elements.sourceUpdated.textContent = subtitle;
  elements.sourceDot.className = `dot ${state}`;
}

function updateTradeSummary() {
  const market = currentMarket();
  const amount = Math.max(0, Number(elements.amountInput.value) || 0);
  const yesPrice = Number(market.probability) / 100;
  const noPrice = 1 - yesPrice;
  const price = selectedSide === "yes" ? yesPrice : noPrice;
  const fee = amount * 0.01;
  const shares = price > 0 ? amount / price : 0;
  elements.sharesOut.textContent = shares.toFixed(3);
  elements.feeOut.textContent = `${fee.toFixed(3)} SUI`;
  elements.totalOut.textContent = `${(amount + fee).toFixed(3)} SUI`;
  elements.buyButton.textContent = `Buy ${selectedSide.toUpperCase()}`;
}

function showTradeNotice() {
  window.clearTimeout(tradeNoticeTimer);
  const originalLabel = `Buy ${selectedSide.toUpperCase()}`;
  elements.buyButton.textContent = "Wallet trading pending";
  elements.sourceEvidence.innerHTML =
    "Frontend wallet trading is not connected yet. Mainnet contract testing was completed by Sui CLI; the next build step is wiring wallet approval to the live package.";
  tradeNoticeTimer = window.setTimeout(() => {
    elements.buyButton.textContent = originalLabel;
    renderDetail();
  }, 5000);
}

document.addEventListener("click", (event) => {
  const marketButton = event.target.closest("[data-market]");
  if (marketButton) {
    selectedMarketId = marketButton.dataset.market;
    renderMarkets();
    renderDetail();
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    activeFilter = filterButton.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((button) => button.classList.toggle("active", button === filterButton));
    renderMarkets();
  }

  const outcomeButton = event.target.closest("[data-side]");
  if (outcomeButton) {
    selectedSide = outcomeButton.dataset.side;
    document.querySelectorAll("[data-side]").forEach((button) => button.classList.toggle("selected", button === outcomeButton));
    updateTradeSummary();
  }

  const quickAmount = event.target.closest("[data-amount]");
  if (quickAmount) {
    elements.amountInput.value = quickAmount.dataset.amount;
    updateTradeSummary();
  }

  if (event.target.closest("#refreshButton")) loadLiveMarkets();
  if (event.target.closest("#buyButton")) showTradeNotice();
  if (event.target.closest("#connectWallet")) {
    event.target.textContent = "Wallet pending";
  }
});

elements.amountInput.addEventListener("input", updateTradeSummary);

renderMarkets();
renderDetail();
loadLiveMarkets();
