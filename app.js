const fallbackMarkets = [
  {
    id: "backend-required",
    icon: "API",
    category: "Short term",
    filter: "short",
    title: "Start backend for live markets",
    question: "Run npm start or npm run netlify:dev to load NOAA/NHC-backed markets.",
    probability: 50,
    volume: "$0",
    trades: "0",
    expires: "Backend required",
    resolution: "Market resolution evidence is served from the backend so prediction logic is not exposed in browser-visible code.",
    points: [50, 50, 50, 50, 50, 50, 50],
  },
];

let markets = [...fallbackMarkets];

let selectedMarketId = markets[0].id;
let activeFilter = "all";
let selectedSide = "yes";

const marketItems = document.querySelector("#marketItems");
const amountInput = document.querySelector("#amountInput");
const sharesOut = document.querySelector("#sharesOut");
const totalOut = document.querySelector("#totalOut");
const buyButton = document.querySelector("#buyButton");
const sourceStatus = document.querySelector("#sourceStatus");
const sourceUpdated = document.querySelector("#sourceUpdated");
const sourceEvidence = document.querySelector("#sourceEvidence");

function currentMarket() {
  return markets.find((market) => market.id === selectedMarketId) || markets[0];
}

function renderMarkets() {
  const visible = activeFilter === "all" ? markets : markets.filter((market) => market.filter === activeFilter);
  marketItems.innerHTML = visible
    .map(
      (market) => `
        <button class="market-item ${market.id === selectedMarketId ? "active" : ""}" type="button" data-market="${market.id}">
          <span class="market-icon">${market.icon}</span>
          <span class="market-copy">
            <strong>${market.title}</strong>
            <p>${market.question}</p>
            <span class="market-meta">
              <span>${market.volume} Vol.</span>
              <span>${market.expires}</span>
            </span>
          </span>
          <span class="market-prob">${market.probability}%<span>Yes</span></span>
        </button>
      `,
    )
    .join("");
}

function chartPath(points) {
  const width = 760;
  const height = 220;
  const step = width / (points.length - 1);
  const yFor = (value) => height - (value / 100) * height;
  const line = points.map((value, index) => `${index === 0 ? "M" : "L"}${index * step} ${yFor(value)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return { line, area };
}

function renderDetail() {
  const market = currentMarket();
  document.querySelector("#detailIcon").textContent = market.icon;
  document.querySelector("#detailTitle").textContent = market.title;
  document.querySelector("#detailQuestion").textContent = market.question;
  document.querySelector("#detailCategory").textContent = market.category;
  document.querySelector("#detailExpiry").textContent = market.expires;
  document.querySelector("#detailProbability").textContent = `${market.probability}% Yes`;
  document.querySelector("#detailVolume").textContent = market.volume;
  document.querySelector("#tradeCount").textContent = market.trades;
  document.querySelector("#detailResolution").textContent = market.resolution;
  if (sourceEvidence) {
    const evidence = market.resolutionEvidence;
    sourceEvidence.innerHTML = evidence
      ? `<strong>${evidence.status}</strong><span>${evidence.source}</span><a href="${evidence.sourceUrl}" target="_blank" rel="noreferrer">Source</a>`
      : `<strong>Pending</strong><span>NOAA/NHC source evidence will appear here.</span>`;
  }
  document.querySelector("#yesPrice").textContent = `${market.probability}c`;
  document.querySelector("#noPrice").textContent = `${100 - market.probability}c`;
  const path = chartPath(market.points);
  document.querySelector("#chartLine").setAttribute("d", path.line);
  document.querySelector("#chartArea").setAttribute("d", path.area);
  updateTradeSummary();
}

async function loadLiveMarkets() {
  if (window.location.protocol === "file:") {
    if (sourceStatus) sourceStatus.textContent = "Static fallback";
    if (sourceUpdated) sourceUpdated.textContent = "Run backend for live NOAA/NHC data";
    return;
  }

  try {
    const response = await fetch("/api/markets", { cache: "no-store" });
    if (!response.ok) throw new Error(`Backend returned ${response.status}`);
    const payload = await response.json();
    if (Array.isArray(payload.markets) && payload.markets.length) {
      markets = payload.markets;
      renderMarkets();
      renderDetail();
      if (sourceStatus) sourceStatus.textContent = "Live sources";
      if (sourceUpdated) sourceUpdated.textContent = `Updated ${new Date(payload.generatedAt).toLocaleString()}`;
    }
  } catch (error) {
    if (sourceStatus) sourceStatus.textContent = "Source unavailable";
    if (sourceUpdated) sourceUpdated.textContent = "Using fallback market data";
  }
}

function updateTradeSummary() {
  const market = currentMarket();
  const amount = Number(amountInput.value) || 0;
  const price = selectedSide === "yes" ? market.probability / 100 : (100 - market.probability) / 100;
  const fee = 0.035;
  const shares = price > 0 ? amount / price : 0;
  sharesOut.textContent = shares.toFixed(3);
  totalOut.textContent = `${(amount + fee).toFixed(3)} TREE`;
  buyButton.textContent = `Buy ${selectedSide === "yes" ? "Yes" : "No"}`;
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
    const balance = 12450;
    amountInput.value = Math.round((balance * Number(quickAmount.dataset.amount)) / 100);
    updateTradeSummary();
  }
});

amountInput.addEventListener("input", updateTradeSummary);

renderMarkets();
renderDetail();
loadLiveMarkets();
