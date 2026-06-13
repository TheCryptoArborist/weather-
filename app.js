const fallbackMarkets = [
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
