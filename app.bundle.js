// packages/core/categories.js
var CATEGORIES = [
  { id: "apparel", name: "\u30A2\u30D1\u30EC\u30EB\u30FB\u8863\u985E", fvf: 13.6 },
  { id: "shoes", name: "\u9774\u30FB\u30B9\u30CB\u30FC\u30AB\u30FC", fvf: 13.6 },
  { id: "bags", name: "\u30D0\u30C3\u30B0\u30FB\u8CA1\u5E03", fvf: 13.6 },
  { id: "watches", name: "\u6642\u8A08", fvf: 15 },
  { id: "cameras", name: "\u30AB\u30E1\u30E9\u30FB\u30EC\u30F3\u30BA", fvf: 13.6 },
  { id: "games", name: "\u30B2\u30FC\u30E0\u6A5F\u30FB\u30BD\u30D5\u30C8", fvf: 13.6 },
  { id: "figures", name: "\u30D5\u30A3\u30AE\u30E5\u30A2\u30FB\u73A9\u5177", fvf: 13.6 },
  { id: "instruments", name: "\u697D\u5668", fvf: 6.7 },
  { id: "auto_parts", name: "\u81EA\u52D5\u8ECA\u30D1\u30FC\u30C4", fvf: 13.6 },
  { id: "pottery", name: "\u9676\u5668\u30FB\u30A2\u30F3\u30C6\u30A3\u30FC\u30AF\u98DF\u5668", fvf: 13.6 },
  { id: "electronics", name: "\u96FB\u5B50\u6A5F\u5668", fvf: 13.6 },
  { id: "records", name: "\u30EC\u30B3\u30FC\u30C9\u30FBCD", fvf: 15.3 },
  { id: "jewelry", name: "\u30A2\u30AF\u30BB\u30B5\u30EA\u30FC\u30FB\u30B8\u30E5\u30A8\u30EA\u30FC", fvf: 15 },
  { id: "books", name: "\u66F8\u7C4D\u30FB\u96D1\u8A8C", fvf: 15.3 },
  { id: "other", name: "\u305D\u306E\u4ED6", fvf: 13.6 }
];
function getFvfRate(categoryId) {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  return cat ? cat.fvf : 13.6;
}

// packages/core/tariff.js
function getTariffRates(categoryId, tariffData, now = /* @__PURE__ */ new Date()) {
  const item = tariffData.tariff_rates.find((t) => t.category_id === categoryId);
  const base = item ? item.us_duty_rate : 5;
  let additional = 0;
  const at = tariffData.additional_tariff;
  if (at) {
    const exempt = item && item.exempt_additional;
    const expired = at.expires && now > new Date(at.expires);
    additional = exempt || expired ? 0 : at.rate || 0;
  }
  return { base, additional };
}

// packages/core/shipping.js
function computeBillingWeight({ l = 0, w = 0, h = 0, actualKg = 0 }) {
  const volumetric = l > 0 && w > 0 && h > 0 ? l * w * h / 5e3 : 0;
  if (volumetric <= 0 && actualKg <= 0) return 0;
  if (volumetric > 0 && actualKg > 0) return Math.max(volumetric, actualKg);
  return volumetric > 0 ? volumetric : actualKg;
}
function computeShipping(billingWeightKg, table) {
  if (billingWeightKg <= 0) return 0;
  const rateEntries = Object.entries(table.rates).map(([k, v]) => [Number(k), v]);
  if (rateEntries.length === 0) return null;
  rateEntries.sort((a, b) => a[0] - b[0]);
  const rateMap = new Map(rateEntries);
  const keys = rateEntries.map(([k]) => k);
  const maxKey = keys[keys.length - 1];
  if (billingWeightKg > maxKey) return null;
  const exactEntry = rateEntries.find(([k]) => Math.abs(k - billingWeightKg) < 1e-9);
  if (exactEntry !== void 0) return exactEntry[1];
  let lower = null, upper = null;
  for (const k of keys) {
    if (k <= billingWeightKg) lower = k;
    if (k >= billingWeightKg && upper === null) upper = k;
  }
  if (lower === null) return rateMap.get(upper);
  const lRate = rateMap.get(lower);
  const uRate = rateMap.get(upper);
  return Math.round(lRate + (uRate - lRate) * (billingWeightKg - lower) / (upper - lower));
}

// packages/core/calc.js
function computeProfit(input) {
  const {
    exchangeRate,
    currency: currency2,
    itemPrice,
    buyerShipping,
    costPrice,
    fvfRate,
    baseTariffRate,
    additionalTariffRate,
    shippingCostJPY = 0,
    extraFeeJPY = 0
  } = input;
  const required = { exchangeRate, itemPrice, buyerShipping, costPrice, fvfRate, baseTariffRate, additionalTariffRate, shippingCostJPY, extraFeeJPY };
  for (const [k, v] of Object.entries(required)) {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`computeProfit: ${k} must be a finite number, got ${v}`);
  }
  if (exchangeRate <= 0) throw new Error(`computeProfit: exchangeRate must be > 0, got ${exchangeRate}`);
  const itemPriceUSD = currency2 === "USD" ? itemPrice : itemPrice / exchangeRate;
  const buyerShippingUSD = currency2 === "USD" ? buyerShipping : buyerShipping / exchangeRate;
  const totalSaleUSD = itemPriceUSD + buyerShippingUSD;
  const fvfFee = totalSaleUSD * (fvfRate / 100);
  const perOrderFee = totalSaleUSD <= 10 ? 0.3 : 0.4;
  const intlFee = totalSaleUSD * 0.0135;
  const ebayFeesUSD = fvfFee + perOrderFee + intlFee;
  const ebayFeesJPY = ebayFeesUSD * exchangeRate;
  const ebayFeeTaxJPY = ebayFeesJPY * 0.1;
  const payoneerFeeJPY = Math.max(0, totalSaleUSD - ebayFeesUSD) * 0.02 * exchangeRate;
  const baseTariffJPY = itemPriceUSD * (baseTariffRate / 100) * exchangeRate;
  const additionalTariffJPY = itemPriceUSD * (additionalTariffRate / 100) * exchangeRate;
  const tariffJPY = baseTariffJPY + additionalTariffJPY;
  const revenueJPY = totalSaleUSD * exchangeRate;
  const fixedExpense = ebayFeesJPY + ebayFeeTaxJPY + payoneerFeeJPY + shippingCostJPY + tariffJPY + extraFeeJPY;
  const profit = revenueJPY - fixedExpense - costPrice;
  const profitRate = revenueJPY > 0 ? profit / revenueJPY * 100 : 0;
  const purchaseTaxRefund = costPrice * 10 / 110;
  const totalRefund = purchaseTaxRefund + ebayFeeTaxJPY;
  const profitWithRefund = profit + totalRefund;
  const profitRefundRate = revenueJPY > 0 ? profitWithRefund / revenueJPY * 100 : 0;
  return {
    totalSaleUSD,
    revenueJPY,
    fixedExpense,
    profit,
    profitRate,
    profitWithRefund,
    profitRefundRate,
    totalRefund,
    breakdown: {
      fvfJPY: fvfFee * exchangeRate,
      perOrderJPY: perOrderFee * exchangeRate,
      intlJPY: intlFee * exchangeRate,
      ebayFeeTaxJPY,
      payoneerFeeJPY,
      shippingCostJPY,
      baseTariffJPY,
      additionalTariffJPY,
      costPrice,
      extraFeeJPY
    }
  };
}

// packages/core/reverse.js
function maxCost(input, targetPct, basis = "normal") {
  if (basis !== "normal" && basis !== "refund") throw new Error(`unknown basis: ${basis}`);
  const probe = computeProfit({ ...input, costPrice: 0 });
  const { revenueJPY, fixedExpense } = probe;
  const ebayFeeTaxJPY = probe.breakdown.ebayFeeTaxJPY;
  const T = targetPct / 100;
  if (basis === "refund") {
    return 110 / 100 * (revenueJPY * (1 - T) - fixedExpense + ebayFeeTaxJPY);
  }
  return revenueJPY * (1 - T) - fixedExpense;
}
function maxBid(input, targetPct, basis, domesticShippingJPY = 0) {
  return maxCost(input, targetPct, basis) - domesticShippingJPY;
}
function ceilings(input, basis = "normal", domesticShippingJPY = 0, margins = [20, 15, 10]) {
  return margins.map((m) => ({
    margin: m,
    maxCost: maxCost(input, m, basis),
    maxBid: maxBid(input, m, basis, domesticShippingJPY)
  }));
}

// packages/core/data/shipping-rates.json
var shipping_rates_default = {
  service: "SpeedPAK Economy",
  destination: "US48",
  currency: "JPY",
  source: "\u53C2\u8003\u7528\u6599\u91D1\u6BD4\u8F03\u88682026.5\u300C\u6599\u91D1\u6BD4\u8F03\u8868\u300DI\u5217(20\u884C\u76EE\u4EE5\u964D)",
  last_updated: "2026-05",
  max_weight_kg: 25,
  note: "\u914D\u9001\u6599+\u71C3\u6599\u30B5\u30FC\u30C1\u30E3\u30FC\u30B8+\u30DC\u30EA\u30E5\u30FC\u30E0\u30C7\u30A3\u30B9\u30AB\u30A6\u30F3\u30C8\u8FBC\u307F\u3002\u30C7\u30DE\u30F3\u30C9\u30B5\u30FC\u30C1\u30E3\u30FC\u30B8\u306F\u5225\u9014\u3002\u6B63\u5F0F\u6599\u91D1\u306FOrange Connex\u8ACB\u6C42\u66F8\u3002",
  rates: {
    "0.5": 2205,
    "1.0": 3232,
    "1.5": 4085,
    "2.0": 5615,
    "2.5": 5975,
    "3.0": 6779,
    "3.5": 7448,
    "4.0": 8247,
    "4.5": 9778,
    "5.0": 12559,
    "5.5": 13381,
    "6.0": 14274,
    "6.5": 15157,
    "7.0": 16280,
    "7.5": 17188,
    "8.0": 18083,
    "8.5": 18799,
    "9.0": 19430,
    "9.5": 20452,
    "10.0": 21022,
    "10.5": 21703,
    "11.0": 22333,
    "11.5": 23084,
    "12.0": 23762,
    "12.5": 24499,
    "13.0": 25119,
    "13.5": 25747,
    "14.0": 26620,
    "14.5": 26974,
    "15.0": 27818,
    "15.5": 28533,
    "16.0": 30131,
    "16.5": 30802,
    "17.0": 31572,
    "17.5": 32323,
    "18.0": 33078,
    "18.5": 33695,
    "19.0": 34472,
    "19.5": 35255,
    "20.0": 36338,
    "21.0": 37920,
    "22.0": 39455,
    "23.0": 41229,
    "24.0": 42473,
    "25.0": 43839
  }
};

// packages/core/data/tariff-rates.json
var tariff_rates_default = {
  last_updated: "2026-04-04",
  source: "Orange Connex\u516C\u5F0F\u30C7\u30FC\u30BF\uFF08eBay Japan DDP\u60C5\u5831\u30DA\u30FC\u30B8\u63D0\u4F9B\uFF09",
  additional_tariff: {
    name: "Reciprocal Duty\uFF08\u76F8\u4E92\u95A2\u7A0E\uFF09",
    rate: 10,
    expires: "2026-07-24",
    note: "\u76F8\u4E92\u95A2\u7A0E10%\u3002\u6642\u9650\u63AA\u7F6E\u3002\u66F8\u7C4D(Ch.49)\u306F\u514D\u9664\u3002"
  },
  tariff_rates: [
    { category_id: "apparel", us_duty_rate: 10.1, note: "\u7D20\u6750\u306B\u3088\u308A0-32%\u3002\u5E73\u574710.1%" },
    { category_id: "shoes", us_duty_rate: 12.5, note: "\u7D20\u6750\u306B\u3088\u308A0-48%\u3002\u5E73\u574712.5%" },
    { category_id: "bags", us_duty_rate: 9.9, note: "\u9769\u88FD\u542B\u3080\u5E73\u57479.9%" },
    { category_id: "watches", us_duty_rate: 0.5, note: "\u5927\u534A\u304C\u4F4E\u7387\u3002\u5E73\u57470.5%" },
    { category_id: "cameras", us_duty_rate: 0.8, note: "\u672C\u4F53\u306F\u7121\u7A0E\u304C\u591A\u3044\u3002\u5E73\u57470.8%" },
    { category_id: "games", us_duty_rate: 0, note: "\u30B2\u30FC\u30E0\u6A5F\u30FB\u30BD\u30D5\u30C8\u306F\u7121\u7A0E" },
    { category_id: "figures", us_duty_rate: 0, note: "\u73A9\u5177\u30FB\u30D5\u30A3\u30AE\u30E5\u30A2\u306F\u7121\u7A0E" },
    { category_id: "instruments", us_duty_rate: 1.6, note: "0-8.7%\u3002\u5E73\u57471.6%" },
    { category_id: "auto_parts", us_duty_rate: 3.3, note: "0-25%\u3002\u5E73\u57473.3%" },
    { category_id: "pottery", us_duty_rate: 6.8, note: "0-28%\u3002\u5E73\u57476.8%" },
    { category_id: "electronics", us_duty_rate: 1.3, note: "\u591A\u304F\u304C\u4F4E\u7387\u3002\u5E73\u57471.3%" },
    { category_id: "records", us_duty_rate: 0, note: "\u60C5\u5831\u8CC7\u6750\u3068\u3057\u3066\u7121\u7A0E" },
    { category_id: "jewelry", us_duty_rate: 2.6, note: "0-13.5%\u3002\u5E73\u57472.6%" },
    { category_id: "books", us_duty_rate: 0, note: "\u66F8\u7C4D\u306F\u514D\u7A0E\u3002\u8FFD\u52A0\u95A2\u7A0E\u3082\u514D\u9664", exempt_additional: true },
    { category_id: "other", us_duty_rate: 5, note: "\u6C4E\u7528\u30C7\u30D5\u30A9\u30EB\u30C8\u5024" }
  ]
};

// packages/core/data/product-specs.json
var product_specs_default = {
  dscw170: {
    model: "DSC-W170",
    maker: "sony",
    categoryId: "cameras",
    dimensions_mm: { w: 93.7, h: 58, d: 24 },
    weight_g: 142,
    source_url: "https://www.sony.jp/cyber-shot/products/DSC-W170/spec.html",
    scraped_at: "2026-06-21",
    verified: true
  }
};

// packages/desktop/renderer/format.js
function fmtYen(n) {
  return Math.round(n).toLocaleString("en-US") + "\u5186";
}
function profitColorClass(rate, profit) {
  if (profit < 0) return "profit-negative";
  if (rate < 10) return "profit-warning";
  return "profit-positive";
}
function okBadge(currentPrice, maxBid2) {
  if (currentPrice > 0 && maxBid2 > 0 && currentPrice <= maxBid2) {
    return { label: "\u5165\u672DOK", cls: "ok" };
  }
  if (currentPrice > 0 && currentPrice > maxBid2) {
    return { label: "NG", cls: "ng" };
  }
  return { label: "\u2014", cls: "muted" };
}

// packages/core/specdb.js
function normalizeModel(text) {
  if (!text) return "";
  const half = String(text).replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248));
  return half.toUpperCase().replace(/[^A-Z0-9]/g, "").toLowerCase();
}
function lookup(text, db) {
  const key = normalizeModel(text);
  return key && db[key] ? db[key] : null;
}

// packages/core/boxes.js
var BOXES = [
  { size: 60, inner: [25, 20, 15], tareKg: 0.2 },
  { size: 80, inner: [33, 25, 22], tareKg: 0.3 },
  { size: 100, inner: [40, 33, 27], tareKg: 0.5 },
  { size: 120, inner: [45, 38, 37], tareKg: 0.7 },
  { size: 140, inner: [53, 42, 45], tareKg: 1 },
  { size: 160, inner: [58, 48, 54], tareKg: 1.3 }
];
var PADDING_CM = 4;
function selectBox(dims_mm, weightG, padding = PADDING_CM) {
  const { w, h, d } = dims_mm || {};
  if (![w, h, d].every((v) => typeof v === "number" && Number.isFinite(v) && v > 0)) return null;
  const need = [w, h, d].map((mm) => mm / 10 + padding).sort((a, b) => a - b);
  for (const box of BOXES) {
    const inner = [...box.inner].sort((a, b) => a - b);
    if (need[0] <= inner[0] && need[1] <= inner[1] && need[2] <= inner[2]) {
      const [l, w2, h2] = box.inner;
      return {
        size: box.size,
        l,
        w: w2,
        h: h2,
        packedWeightKg: weightG / 1e3 + box.tareKg
      };
    }
  }
  return null;
}

// packages/desktop/renderer/model-fill.js
function computeAutofill(modelText, PRODUCT_SPECS) {
  const rec = lookup(modelText, PRODUCT_SPECS);
  if (!rec) return null;
  const box = selectBox(rec.dimensions_mm, rec.weight_g);
  return {
    categoryId: rec.categoryId || null,
    source_url: rec.source_url || null,
    size: box ? { l: box.l, w: box.w, h: box.h } : null,
    actualWeightKg: box ? box.packedWeightKg : null,
    boxSize: box ? box.size : null
  };
}

// packages/core/text.js
function toHalfWidth(s) {
  return String(s == null ? "" : s).replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248)).replace(/[．。]/g, ".").replace(/[，、]/g, ",").replace(/[－ー]/g, "-").replace(/　/g, " ");
}
function parseNum(s) {
  return parseFloat(toHalfWidth(s).replace(/,/g, "")) || 0;
}

// packages/core/category-detect.js
var CAMERA_SIGNAL = /(cyber-?shot|サイバーショット|exilim|finepix|coolpix|powershot|lumix|handycam|ハンディカム|α[0-9]|eos\b|speedlite)/i;
var CAMERA_TOKEN = /^(dsc|ilce|ilme|nex|slt|eos|ixy|kiss|coolpix|hx[0-9]+v?|rx[0-9]+|wx[0-9]+|tx[0-9]+|zv[0-9]*|a7[a-z0-9]*|a9[a-z0-9]*|d[3-9][0-9]{2,3}|z[0-9]+|gr[0-9]?)$/;
function detectCategory(text, keywords) {
  if (!text) return null;
  const t = toHalfWidth(String(text)).toLowerCase();
  if (CAMERA_SIGNAL.test(t)) return "cameras";
  const tokens = t.split(/[^a-z0-9]+/).filter(Boolean);
  const tokenSet = new Set(tokens);
  for (const tok of tokens) if (CAMERA_TOKEN.test(tok)) return "cameras";
  let best = null, bestCount = 0;
  for (const [cat, kws] of Object.entries(keywords)) {
    let count = 0;
    for (const kw of kws) {
      const k = String(kw).toLowerCase();
      const isAscii = /^[a-z0-9][a-z0-9'.\- ]*$/.test(k);
      if (isAscii) {
        if (k.includes(" ") || k.includes("-")) {
          if (t.includes(k)) count++;
        } else if (tokenSet.has(k)) count++;
      } else {
        if (t.includes(k)) count++;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      best = cat;
    }
  }
  return bestCount > 0 ? best : null;
}

// packages/web/app.js
var $ = (id) => document.getElementById(id);
var num = (id) => {
  const el = $(id);
  return el ? parseNum(el.value) : 0;
};
var APP_VERSION = true ? "v0.2.0" : "dev";
var currency = "USD";
var translatedText = "";
var modelLocked = false;
var CATEGORY_KEYWORDS = {
  apparel: ["\u30B7\u30E3\u30C4", "T\u30B7\u30E3\u30C4", "\u30B8\u30E3\u30B1\u30C3\u30C8", "\u30B3\u30FC\u30C8", "\u30D1\u30F3\u30C4", "\u30BA\u30DC\u30F3", "\u30EF\u30F3\u30D4\u30FC\u30B9", "\u30B9\u30AB\u30FC\u30C8", "\u30BB\u30FC\u30BF\u30FC", "\u30CB\u30C3\u30C8", "\u30D1\u30FC\u30AB\u30FC", "\u30D9\u30B9\u30C8", "\u30C7\u30CB\u30E0", "\u30B8\u30FC\u30F3\u30BA", "\u30A2\u30A6\u30BF\u30FC", "\u30C0\u30A6\u30F3", "\u9769\u30B8\u30E3\u30F3", "\u30EC\u30B6\u30FC\u30B8\u30E3\u30B1\u30C3\u30C8", "\u30B9\u30FC\u30C4", "\u30E6\u30CB\u30D5\u30A9\u30FC\u30E0", "\u30B8\u30E3\u30FC\u30B8", "\u30C8\u30EC\u30FC\u30CA\u30FC", "\u30AB\u30FC\u30C7\u30A3\u30AC\u30F3", "\u30D6\u30EB\u30BE\u30F3", "\u30B9\u30A6\u30A7\u30C3\u30C8", "\u30DD\u30ED\u30B7\u30E3\u30C4", "\u7740\u7269", "\u6D74\u8863", "\u88B4", "\u5E2F", "\u7FBD\u7E54", "\u751A\u5E73", "\u6CD5\u88AB", "\u534A\u7E8F", "Supreme", "\u30B7\u30E5\u30D7\u30EA\u30FC\u30E0", "BAPE", "\u30D9\u30A4\u30D7", "\u30B3\u30E0\u30C7\u30AE\u30E3\u30EB\u30BD\u30F3", "\u30E8\u30A6\u30B8\u30E4\u30DE\u30E2\u30C8", "\u30A4\u30C3\u30BB\u30A4\u30DF\u30E4\u30B1", "\u30B1\u30F3\u30BE\u30FC", "\u30A2\u30F3\u30C0\u30FC\u30AB\u30D0\u30FC", "\u30CD\u30A4\u30D0\u30FC\u30D5\u30C3\u30C9", "WTAPS", "\u30D2\u30E5\u30FC\u30DE\u30F3\u30E1\u30A4\u30C9", "\u30B5\u30AB\u30A4", "\u30D3\u30BA\u30D3\u30E0", "visvim", "\u30A8\u30F4\u30A3\u30B9", "\u30A8\u30D3\u30B9\u30B8\u30FC\u30F3\u30BA", "\u30B9\u30C6\u30E5\u30FC\u30B7\u30FC", "\u30CE\u30FC\u30B9\u30D5\u30A7\u30A4\u30B9", "\u53E4\u7740", "\u30F4\u30A3\u30F3\u30C6\u30FC\u30B8", "\u30B9\u30C8\u30EA\u30FC\u30C8", "\u30DF\u30EA\u30BF\u30EA\u30FC"],
  shoes: ["\u30B9\u30CB\u30FC\u30AB\u30FC", "\u9774", "\u30D6\u30FC\u30C4", "\u30B5\u30F3\u30C0\u30EB", "\u30D1\u30F3\u30D7\u30B9", "\u30ED\u30FC\u30D5\u30A1\u30FC", "\u30B7\u30E5\u30FC\u30BA", "\u30B9\u30EA\u30C3\u30DD\u30F3", "\u30E9\u30F3\u30CB\u30F3\u30B0\u30B7\u30E5\u30FC\u30BA", "\u30CA\u30A4\u30AD", "\u30A2\u30C7\u30A3\u30C0\u30B9", "\u30CB\u30E5\u30FC\u30D0\u30E9\u30F3\u30B9", "\u30B3\u30F3\u30D0\u30FC\u30B9", "\u30B8\u30E7\u30FC\u30C0\u30F3", "\u30A8\u30A2\u30B8\u30E7\u30FC\u30C0\u30F3", "\u30A8\u30A2\u30DE\u30C3\u30AF\u30B9", "\u30A4\u30FC\u30B8\u30FC", "\u30C0\u30F3\u30AF", "\u30A2\u30B7\u30C3\u30AF\u30B9", "\u30AA\u30CB\u30C4\u30AB\u30BF\u30A4\u30AC\u30FC", "\u30DF\u30BA\u30CE", "\u30D7\u30FC\u30DE", "\u30D0\u30F3\u30BA", "\u30EA\u30FC\u30DC\u30C3\u30AF", "\u30C9\u30AF\u30BF\u30FC\u30DE\u30FC\u30C1\u30F3", "\u30B3\u30E9\u30DC\u30B9\u30CB\u30FC\u30AB\u30FC", "\u9650\u5B9A\u30B9\u30CB\u30FC\u30AB\u30FC", "\u30EC\u30A2\u30B9\u30CB\u30FC\u30AB\u30FC"],
  bags: ["\u30D0\u30C3\u30B0", "\u8CA1\u5E03", "\u30EA\u30E5\u30C3\u30AF", "\u30DD\u30FC\u30C1", "\u30C8\u30FC\u30C8", "\u30B7\u30E7\u30EB\u30C0\u30FC", "\u30AF\u30E9\u30C3\u30C1", "\u30A6\u30A9\u30EC\u30C3\u30C8", "\u30DC\u30C7\u30A3\u30D0\u30C3\u30B0", "\u30E9\u30F3\u30C9\u30BB\u30EB", "\u30CF\u30F3\u30C9\u30D0\u30C3\u30B0", "\u30DC\u30B9\u30C8\u30F3\u30D0\u30C3\u30B0", "\u30BB\u30AB\u30F3\u30C9\u30D0\u30C3\u30B0", "\u9577\u8CA1\u5E03", "\u4E8C\u3064\u6298\u308A\u8CA1\u5E03", "\u30EB\u30A4\u30F4\u30A3\u30C8\u30F3", "\u30F4\u30A3\u30C8\u30F3", "\u30B0\u30C3\u30C1", "\u30B7\u30E3\u30CD\u30EB", "\u30A8\u30EB\u30E1\u30B9", "\u30D7\u30E9\u30C0", "\u30B3\u30FC\u30C1", "\u30D0\u30EC\u30F3\u30B7\u30A2\u30AC", "\u30BB\u30EA\u30FC\u30CC", "\u30ED\u30A8\u30D9", "\u30DC\u30C3\u30C6\u30AC", "\u30D5\u30A7\u30F3\u30C7\u30A3", "\u30C7\u30A3\u30AA\u30FC\u30EB", "\u30D0\u30FC\u30D0\u30EA\u30FC", "\u30B4\u30E4\u30FC\u30EB", "\u30DD\u30FC\u30BF\u30FC", "\u5409\u7530\u30AB\u30D0\u30F3"],
  watches: ["\u6642\u8A08", "\u30A6\u30A9\u30C3\u30C1", "\u8155\u6642\u8A08", "\u61D0\u4E2D\u6642\u8A08", "\u30AF\u30ED\u30CE\u30B0\u30E9\u30D5", "\u30C0\u30A4\u30D0\u30FC\u30BA", "\u6A5F\u68B0\u5F0F", "\u81EA\u52D5\u5DFB\u304D", "\u30AF\u30A9\u30FC\u30C4", "\u30ED\u30EC\u30C3\u30AF\u30B9", "\u30AA\u30E1\u30AC", "\u30BB\u30A4\u30B3\u30FC", "\u30AB\u30B7\u30AA", "G\u30B7\u30E7\u30C3\u30AF", "G-SHOCK", "\u30B7\u30C1\u30BA\u30F3", "\u30BF\u30B0\u30DB\u30A4\u30E4\u30FC", "\u30D1\u30C6\u30C3\u30AF", "\u30D6\u30E9\u30A4\u30C8\u30EA\u30F3\u30B0", "IWC", "\u30B0\u30E9\u30F3\u30C9\u30BB\u30A4\u30B3\u30FC", "\u30C1\u30E5\u30FC\u30C0\u30FC", "\u30D1\u30CD\u30E9\u30A4", "\u30AB\u30EB\u30C6\u30A3\u30A8", "\u30CF\u30DF\u30EB\u30C8\u30F3", "\u30AA\u30EA\u30A8\u30F3\u30C8", "\u30D6\u30EB\u30AC\u30EA", "\u30A6\u30D6\u30ED", "\u30D5\u30E9\u30F3\u30AF\u30DF\u30E5\u30E9\u30FC", "\u30B9\u30D4\u30FC\u30C9\u30DE\u30B9\u30BF\u30FC", "\u30B5\u30D6\u30DE\u30EA\u30FC\u30CA", "\u30C7\u30A4\u30C8\u30CA", "\u30D7\u30ED\u30B9\u30DA\u30C3\u30AF\u30B9", "\u30AA\u30AF\u30BF\u30B4\u30F3", "\u30AB\u30EC\u30E9"],
  cameras: ["\u30AB\u30E1\u30E9", "\u30EC\u30F3\u30BA", "\u4E00\u773C", "\u30DF\u30E9\u30FC\u30EC\u30B9", "\u30D5\u30A3\u30EB\u30E0\u30AB\u30E1\u30E9", "\u30C7\u30B8\u30AB\u30E1", "\u30B3\u30F3\u30D1\u30AF\u30C8\u30AB\u30E1\u30E9", "\u4E2D\u5224\u30AB\u30E1\u30E9", "\u30EC\u30F3\u30B8\u30D5\u30A1\u30A4\u30F3\u30C0\u30FC", "\u4E09\u811A", "\u30B9\u30C8\u30ED\u30DC", "\u30D5\u30E9\u30C3\u30B7\u30E5", "\u30AD\u30E4\u30CE\u30F3", "Canon", "\u30CB\u30B3\u30F3", "Nikon", "\u30BD\u30CB\u30FC", "Sony", "\u30D5\u30B8\u30D5\u30A4\u30EB\u30E0", "\u5BCC\u58EB\u30D5\u30A4\u30EB\u30E0", "\u30AA\u30EA\u30F3\u30D1\u30B9", "\u30E9\u30A4\u30AB", "\u30DA\u30F3\u30BF\u30C3\u30AF\u30B9", "\u30D1\u30CA\u30BD\u30CB\u30C3\u30AF", "Lumix", "\u30EA\u30B3\u30FC", "\u30B7\u30B0\u30DE", "\u30BF\u30E0\u30ED\u30F3", "\u30DF\u30CE\u30EB\u30BF", "\u30B3\u30CB\u30AB", "\u30DE\u30DF\u30E4", "AE-1", "F3", "FM2", "\u03B17"],
  games: ["\u30B2\u30FC\u30E0", "\u30B2\u30FC\u30E0\u30BD\u30D5\u30C8", "\u30B2\u30FC\u30E0\u6A5F", "\u30B3\u30F3\u30C8\u30ED\u30FC\u30E9\u30FC", "\u30D7\u30EC\u30B9\u30C6", "PS5", "PS4", "PS3", "PS2", "PS1", "Nintendo", "\u4EFB\u5929\u5802", "\u30B9\u30A4\u30C3\u30C1", "Switch", "\u30D5\u30A1\u30DF\u30B3\u30F3", "\u30B9\u30FC\u30D5\u30A1\u30DF", "\u30B9\u30FC\u30D1\u30FC\u30D5\u30A1\u30DF\u30B3\u30F3", "\u30B2\u30FC\u30E0\u30DC\u30FC\u30A4", "DS", "3DS", "Wii", "WiiU", "Xbox", "\u30BB\u30AC", "\u30E1\u30AC\u30C9\u30E9\u30A4\u30D6", "\u30B5\u30BF\u30FC\u30F3", "\u30C9\u30EA\u30FC\u30E0\u30AD\u30E3\u30B9\u30C8", "\u30CD\u30AA\u30B8\u30AA", "PC\u30A8\u30F3\u30B8\u30F3", "NINTENDO64", "N64", "\u30B2\u30FC\u30E0\u30AD\u30E5\u30FC\u30D6", "GBA", "PSP", "Vita", "\u30DE\u30EA\u30AA", "\u30BC\u30EB\u30C0", "\u30C9\u30E9\u30AF\u30A8", "\u30D5\u30A1\u30A4\u30CA\u30EB\u30D5\u30A1\u30F3\u30BF\u30B8\u30FC", "FF", "\u30E1\u30BF\u30EB\u30AE\u30A2", "\u30B9\u30C8\u30EA\u30FC\u30C8\u30D5\u30A1\u30A4\u30BF\u30FC", "\u9244\u62F3", "\u30D0\u30A4\u30AA\u30CF\u30B6\u30FC\u30C9"],
  figures: ["\u30D5\u30A3\u30AE\u30E5\u30A2", "\u306C\u3044\u3050\u308B\u307F", "\u30D7\u30E9\u30E2\u30C7\u30EB", "\u30D7\u30E9\u30E2", "\u30AC\u30F3\u30D7\u30E9", "\u8D85\u5408\u91D1", "\u30BD\u30D5\u30D3", "\u30DF\u30CB\u30AB\u30FC", "\u30C9\u30FC\u30EB", "\u4EBA\u5F62", "\u30A2\u30AF\u30B7\u30E7\u30F3\u30D5\u30A3\u30AE\u30E5\u30A2", "\u4E00\u756A\u304F\u3058", "\u30AC\u30C1\u30E3", "\u98DF\u73A9", "\u6A21\u578B", "\u30B8\u30AA\u30E9\u30DE", "\u30DD\u30B1\u30E2\u30F3", "\u30DD\u30B1\u30AB", "\u30DD\u30B1\u30E2\u30F3\u30AB\u30FC\u30C9", "\u30C8\u30EC\u30AB", "\u30C8\u30EC\u30FC\u30C7\u30A3\u30F3\u30B0\u30AB\u30FC\u30C9", "\u904A\u622F\u738B", "MTG", "\u30C7\u30E5\u30A8\u30DE", "\u30C7\u30E5\u30A8\u30EB\u30DE\u30B9\u30BF\u30FC\u30BA", "\u30EF\u30F3\u30D4\u30FC\u30B9\u30AB\u30FC\u30C9", "\u30F4\u30A1\u30F3\u30AC\u30FC\u30C9", "\u30B7\u30E3\u30C9\u30A6\u30D0\u30FC\u30B9", "PSA", "BGS", "\u30AB\u30FC\u30C9", "\u30C8\u30DF\u30AB", "\u30DB\u30C3\u30C8\u30A6\u30A3\u30FC\u30EB", "\u30EC\u30B4", "LEGO", "\u30D9\u30A2\u30D6\u30EA\u30C3\u30AF", "\u30E1\u30C7\u30A3\u30B3\u30E0\u30C8\u30A4", "\u30B0\u30C3\u30C9\u30B9\u30DE\u30A4\u30EB\u30AB\u30F3\u30D1\u30CB\u30FC", "\u306D\u3093\u3069\u308D\u3044\u3069", "figma", "\u30D0\u30F3\u30C0\u30A4", "\u30BF\u30AB\u30E9\u30C8\u30DF\u30FC", "\u6D77\u6D0B\u5802", "\u30E1\u30AC\u30CF\u30A6\u30B9", "\u30B3\u30C8\u30D6\u30AD\u30E4", "\u30EA\u30DC\u30EB\u30C6\u30C3\u30AF", "S.H.\u30D5\u30A3\u30AE\u30E5\u30A2\u30FC\u30C4", "\u30B5\u30F3\u30EA\u30AA", "\u30C9\u30E9\u30B4\u30F3\u30DC\u30FC\u30EB", "\u30EF\u30F3\u30D4\u30FC\u30B9", "\u30CA\u30EB\u30C8", "\u9B3C\u6EC5\u306E\u5203", "\u546A\u8853\u5EFB\u6226", "\u30A8\u30F4\u30A1\u30F3\u30B2\u30EA\u30AA\u30F3", "\u30AC\u30F3\u30C0\u30E0", "\u30BB\u30FC\u30E9\u30FC\u30E0\u30FC\u30F3", "\u9032\u6483\u306E\u5DE8\u4EBA", "\u30B8\u30E7\u30B8\u30E7", "\u30B4\u30B8\u30E9", "\u30A6\u30EB\u30C8\u30E9\u30DE\u30F3", "\u4EEE\u9762\u30E9\u30A4\u30C0\u30FC", "\u30B9\u30BF\u30FC\u30A6\u30A9\u30FC\u30BA", "\u30C8\u30E9\u30F3\u30B9\u30D5\u30A9\u30FC\u30DE\u30FC", "\u521D\u97F3\u30DF\u30AF", "\u30EA\u30E9\u30C3\u30AF\u30DE", "\u305F\u307E\u3054\u3063\u3061"],
  instruments: ["\u30AE\u30BF\u30FC", "\u30D9\u30FC\u30B9", "\u30D4\u30A2\u30CE", "\u30AD\u30FC\u30DC\u30FC\u30C9", "\u30C9\u30E9\u30E0", "\u30D0\u30A4\u30AA\u30EA\u30F3", "\u30B5\u30C3\u30AF\u30B9", "\u30C8\u30E9\u30F3\u30DA\u30C3\u30C8", "\u30D5\u30EB\u30FC\u30C8", "\u30A6\u30AF\u30EC\u30EC", "\u697D\u5668", "\u30B7\u30F3\u30BB\u30B5\u30A4\u30B6\u30FC", "\u30A8\u30D5\u30A7\u30AF\u30BF\u30FC", "\u30A2\u30F3\u30D7", "\u30CF\u30FC\u30E2\u30CB\u30AB", "\u30A2\u30B3\u30FC\u30C7\u30A3\u30AA\u30F3", "\u30C1\u30A7\u30ED", "\u30AF\u30E9\u30EA\u30CD\u30C3\u30C8", "\u30AA\u30FC\u30DC\u30A8", "\u4E09\u5473\u7DDA", "\u7434", "\u5C3A\u516B", "\u592A\u9F13", "\u7BE0\u7B1B", "\u30D5\u30A7\u30F3\u30C0\u30FC", "Fender", "\u30AE\u30D6\u30BD\u30F3", "Gibson", "\u30E4\u30DE\u30CF", "YAMAHA", "\u30ED\u30FC\u30E9\u30F3\u30C9", "Roland", "\u30B3\u30EB\u30B0", "KORG", "\u30DC\u30B9", "BOSS", "\u30DE\u30FC\u30B7\u30E3\u30EB", "Marshall", "\u30A2\u30A4\u30D0\u30CB\u30FC\u30BA", "Ibanez", "ESP", "\u30A8\u30D4\u30D5\u30A9\u30F3", "\u30C6\u30B9\u30B3", "\u30B0\u30EC\u30B3", "\u30C8\u30FC\u30AB\u30A4", "\u30D5\u30B8\u30B2\u30F3", "\u30D5\u30A7\u30EB\u30CA\u30F3\u30C7\u30B9"],
  auto_parts: ["\u30D1\u30FC\u30C4", "\u30DE\u30D5\u30E9\u30FC", "\u30DB\u30A4\u30FC\u30EB", "\u30D8\u30C3\u30C9\u30E9\u30A4\u30C8", "\u30C6\u30FC\u30EB\u30E9\u30F3\u30D7", "\u30D0\u30F3\u30D1\u30FC", "\u30B9\u30C6\u30A2\u30EA\u30F3\u30B0", "\u30E1\u30FC\u30BF\u30FC", "\u30AB\u30FC\u30CA\u30D3", "\u30C9\u30E9\u30EC\u30B3", "\u30D6\u30EC\u30FC\u30AD", "\u30B5\u30B9\u30DA\u30F3\u30B7\u30E7\u30F3", "\u30BF\u30A4\u30E4", "\u30DF\u30E9\u30FC", "\u30B0\u30EA\u30EB", "\u30B9\u30DD\u30A4\u30E9\u30FC", "\u30A8\u30A2\u30ED", "\u30BF\u30FC\u30DC", "\u30A4\u30F3\u30BF\u30FC\u30AF\u30FC\u30E9\u30FC", "\u30E9\u30B8\u30A8\u30FC\u30BF\u30FC", "\u30C8\u30E8\u30BF", "\u30DB\u30F3\u30C0", "\u30CB\u30C3\u30B5\u30F3", "\u65E5\u7523", "\u30DE\u30C4\u30C0", "\u30B9\u30D0\u30EB", "\u4E09\u83F1", "\u30B9\u30BA\u30AD", "\u30C0\u30A4\u30CF\u30C4", "\u30EC\u30AF\u30B5\u30B9", "GT-R", "\u30B9\u30AB\u30A4\u30E9\u30A4\u30F3", "\u30B7\u30EB\u30D3\u30A2", "\u30B9\u30FC\u30D7\u30E9", "AE86", "\u30CF\u30C1\u30ED\u30AF", "\u30A4\u30F3\u30C6\u30B0\u30E9", "\u30B7\u30D3\u30C3\u30AF", "NSX", "RX-7", "\u30ED\u30FC\u30C9\u30B9\u30BF\u30FC", "\u30E9\u30F3\u30A8\u30DC", "\u30A4\u30F3\u30D7\u30EC\u30C3\u30B5", "WRX", "\u8EFD\u30C8\u30E9", "\u30B8\u30E0\u30CB\u30FC", "\u30CF\u30A4\u30A8\u30FC\u30B9", "\u30E9\u30F3\u30AF\u30EB", "JDM", "\u30C9\u30EA\u30D5\u30C8", "\u30C1\u30E5\u30FC\u30CB\u30F3\u30B0", "\u30AB\u30B9\u30BF\u30E0"],
  pottery: ["\u9676\u5668", "\u78C1\u5668", "\u98DF\u5668", "\u82B1\u74F6", "\u8336\u7897", "\u6E6F\u5451", "\u76BF", "\u58FA", "\u6025\u9808", "\u8336\u5668", "\u9152\u5668", "\u76C3", "\u5FB3\u5229", "\u9999\u7089", "\u7F6E\u7269", "\u6709\u7530\u713C", "\u4E5D\u8C37\u713C", "\u4F0A\u4E07\u91CC", "\u4F0A\u4E07\u91CC\u713C", "\u5099\u524D\u713C", "\u8429\u713C", "\u76CA\u5B50\u713C", "\u702C\u6238\u713C", "\u4FE1\u697D\u713C", "\u5E38\u6ED1\u713C", "\u6E05\u6C34\u713C", "\u7F8E\u6FC3\u713C", "\u6CE2\u4F50\u898B\u713C", "\u5C0F\u9E7F\u7530\u713C", "\u7B20\u9593\u713C", "\u30A2\u30F3\u30C6\u30A3\u30FC\u30AF\u98DF\u5668", "\u9AA8\u8463", "\u9AA8\u8463\u54C1", "\u53E4\u4F0A\u4E07\u91CC", "\u548C\u98DF\u5668", "\u8C46\u76BF", "\u62B9\u8336\u7897"],
  electronics: ["\u30B9\u30DE\u30DB", "\u30BF\u30D6\u30EC\u30C3\u30C8", "\u30D1\u30BD\u30B3\u30F3", "\u30A4\u30E4\u30DB\u30F3", "\u30D8\u30C3\u30C9\u30DB\u30F3", "\u30B9\u30D4\u30FC\u30AB\u30FC", "\u30D7\u30EC\u30FC\u30E4\u30FC", "\u30A6\u30A9\u30FC\u30AF\u30DE\u30F3", "\u30E9\u30B8\u30AA", "\u96FB\u5B50\u6A5F\u5668", "\u30AC\u30B8\u30A7\u30C3\u30C8", "\u5145\u96FB\u5668", "\u30E2\u30CB\u30BF\u30FC", "\u30D7\u30EA\u30F3\u30BF\u30FC", "iPhone", "iPad", "Apple", "Mac", "Android", "\u30BD\u30CB\u30FC", "\u30D1\u30CA\u30BD\u30CB\u30C3\u30AF", "\u30B7\u30E3\u30FC\u30D7", "\u6771\u829D", "NEC", "\u5BCC\u58EB\u901A", "BOSE", "\u30AA\u30FC\u30C7\u30A3\u30AA\u30C6\u30AF\u30CB\u30AB", "\u30C7\u30CE\u30F3", "\u30DE\u30E9\u30F3\u30C4", "\u30E9\u30C3\u30AF\u30B9\u30DE\u30F3", "\u30A2\u30AD\u30E5\u30D5\u30A7\u30FC\u30BA", "DAC", "\u771F\u7A7A\u7BA1", "\u30D3\u30F3\u30C6\u30FC\u30B8\u30AA\u30FC\u30C7\u30A3\u30AA", "\u30EC\u30C8\u30ED\u5BB6\u96FB", "\u30E9\u30B8\u30AB\u30BB"],
  records: ["\u30EC\u30B3\u30FC\u30C9", "LP", "EP", "CD", "\u30AB\u30BB\u30C3\u30C8", "\u30AB\u30BB\u30C3\u30C8\u30C6\u30FC\u30D7", "\u30A2\u30CA\u30ED\u30B0\u76E4", "12\u30A4\u30F3\u30C1", "7\u30A4\u30F3\u30C1", "\u30B7\u30F3\u30B0\u30EB", "\u30A2\u30EB\u30D0\u30E0", "\u30BF\u30FC\u30F3\u30C6\u30FC\u30D6\u30EB", "\u30EC\u30B3\u30FC\u30C9\u30D7\u30EC\u30FC\u30E4\u30FC", "\u5E2F\u4ED8\u304D", "\u5E2F\u4ED8", "\u521D\u56DE\u76E4", "\u9650\u5B9A\u76E4", "\u30D7\u30ED\u30E2\u76E4", "\u898B\u672C\u76E4", "\u30C6\u30B9\u30C8\u30D7\u30EC\u30B9", "\u30B7\u30C6\u30A3\u30DD\u30C3\u30D7", "\u548C\u30B8\u30E3\u30BA", "\u548C\u30E2\u30CE", "\u662D\u548C\u6B4C\u8B21", "\u30A2\u30CB\u30BD\u30F3", "\u30B5\u30F3\u30C8\u30E9"],
  jewelry: ["\u30CD\u30C3\u30AF\u30EC\u30B9", "\u30EA\u30F3\u30B0", "\u6307\u8F2A", "\u30D6\u30EC\u30B9\u30EC\u30C3\u30C8", "\u30D4\u30A2\u30B9", "\u30A4\u30E4\u30EA\u30F3\u30B0", "\u30D6\u30ED\u30FC\u30C1", "\u30DA\u30F3\u30C0\u30F3\u30C8", "\u30C1\u30E7\u30FC\u30AB\u30FC", "\u30D0\u30F3\u30B0\u30EB", "\u30A2\u30F3\u30AF\u30EC\u30C3\u30C8", "\u30AB\u30D5\u30B9", "\u30BF\u30A4\u30D4\u30F3", "\u5E2F\u7559\u3081", "\u30B8\u30E5\u30A8\u30EA\u30FC", "\u30A2\u30AF\u30BB\u30B5\u30EA\u30FC", "\u30B7\u30EB\u30D0\u30FC", "\u30B4\u30FC\u30EB\u30C9", "\u30D7\u30E9\u30C1\u30CA", "\u30C0\u30A4\u30E4", "\u30C0\u30A4\u30E4\u30E2\u30F3\u30C9", "\u30D1\u30FC\u30EB", "\u771F\u73E0", "\u30B5\u30D5\u30A1\u30A4\u30A2", "\u30EB\u30D3\u30FC", "\u30A8\u30E1\u30E9\u30EB\u30C9", "\u7FE1\u7FE0", "\u30D2\u30B9\u30A4", "\u73CA\u745A", "\u7425\u73C0", "K18", "K14", "925", "\u30B9\u30BF\u30FC\u30EA\u30F3\u30B0\u30B7\u30EB\u30D0\u30FC", "\u30C6\u30A3\u30D5\u30A1\u30CB\u30FC", "\u30AB\u30EB\u30C6\u30A3\u30A8", "\u30D6\u30EB\u30AC\u30EA", "\u30DF\u30AD\u30E2\u30C8", "\u30BF\u30B5\u30AD", "\u30F4\u30A1\u30F3\u30AF\u30EA\u30FC\u30D5", "\u30AF\u30ED\u30E0\u30CF\u30FC\u30C4", "\u30B4\u30ED\u30FC\u30BA", "goro's", "\u30B8\u30E3\u30B9\u30C6\u30A3\u30F3\u30C7\u30A4\u30D3\u30B9", "\u30ED\u30F3\u30EF\u30F3\u30BA", "\u30D3\u30EB\u30A6\u30A9\u30FC\u30EB\u30EC\u30B6\u30FC"],
  books: ["\u66F8\u7C4D", "\u96D1\u8A8C", "\u6F2B\u753B", "\u30DE\u30F3\u30AC", "\u30B3\u30DF\u30C3\u30AF", "\u5199\u771F\u96C6", "\u753B\u96C6", "\u56F3\u9451", "\u7D75\u672C", "\u6587\u5EAB", "\u5358\u884C\u672C", "\u5168\u5DFB", "\u521D\u7248", "\u540C\u4EBA\u8A8C", "\u30EF\u30F3\u30D4\u30FC\u30B9", "\u9B3C\u6EC5\u306E\u5203", "\u30C9\u30E9\u30B4\u30F3\u30DC\u30FC\u30EB", "\u30CA\u30EB\u30C8", "\u9032\u6483\u306E\u5DE8\u4EBA", "\u30B9\u30E9\u30E0\u30C0\u30F3\u30AF", "\u30D9\u30EB\u30BB\u30EB\u30AF", "\u30CF\u30F3\u30BF\u30FC\u30CF\u30F3\u30BF\u30FC", "\u30D6\u30EA\u30FC\u30C1", "BLEACH", "\u30C7\u30B9\u30CE\u30FC\u30C8", "\u92FC\u306E\u932C\u91D1\u8853\u5E2B", "\u6771\u4EAC\u55B0\u7A2E", "\u30C1\u30A7\u30F3\u30BD\u30FC\u30DE\u30F3", "\u546A\u8853\u5EFB\u6226", "SPY\xD7FAMILY", "\u30B8\u30E3\u30F3\u30D7", "\u30DE\u30AC\u30B8\u30F3", "\u30B5\u30F3\u30C7\u30FC", "\u30C1\u30E3\u30F3\u30D4\u30AA\u30F3", "\u96C6\u82F1\u793E", "\u8B1B\u8AC7\u793E", "\u5C0F\u5B66\u9928", "\u7F8E\u8853\u66F8", "\u5EFA\u7BC9", "\u30C7\u30B6\u30A4\u30F3", "\u30D5\u30A1\u30C3\u30B7\u30E7\u30F3\u8A8C", "\u30AB\u30E1\u30E9\u96D1\u8A8C"]
};
function guessCategory(text) {
  return detectCategory(text, CATEGORY_KEYWORDS);
}
function catName(id) {
  const c = CATEGORIES.find((c2) => c2.id === id);
  return c ? c.name : id;
}
function buildCategorySelect() {
  const sel = $("category");
  sel.innerHTML = "";
  for (const c of CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  }
}
function currentBillingWeight() {
  const l = num("sizeL"), w = num("sizeW"), h = num("sizeH"), actualKg = num("actualWeight");
  const billing = computeBillingWeight({ l, w, h, actualKg });
  const wr = $("weightResult");
  if (billing <= 0) {
    wr.style.display = "none";
    return 0;
  }
  wr.style.display = "block";
  const volumetric = l > 0 && w > 0 && h > 0 ? l * w * h / 5e3 : 0;
  let detail;
  if (volumetric > 0 && actualKg > 0) {
    detail = `\u5BB9\u7A4D\u91CD\u91CF: ${volumetric.toFixed(2)}kg / \u5B9F\u91CD\u91CF: ${actualKg}kg \u2192 ${volumetric >= actualKg ? "\u5BB9\u7A4D\u91CD\u91CF\u3092\u63A1\u7528" : "\u5B9F\u91CD\u91CF\u3092\u63A1\u7528"}`;
  } else if (volumetric > 0) {
    detail = `\u5BB9\u7A4D\u91CD\u91CF: ${volumetric.toFixed(2)}kg\uFF08${l}\xD7${w}\xD7${h}cm \xF7 5000\uFF09`;
  } else {
    detail = `\u5B9F\u91CD\u91CF: ${actualKg}kg`;
  }
  $("billingWeight").textContent = billing.toFixed(2);
  $("weightDetail").textContent = detail;
  return billing;
}
function currentShippingJPY(billingKg) {
  const manual = num("shippingManual");
  const overNote = $("shippingOverNote");
  const autoVal = $("shippingAutoValue");
  const auto = billingKg > 0 ? computeShipping(billingKg, shipping_rates_default) : 0;
  if (auto === null) {
    autoVal.textContent = "\u7B97\u51FA\u4E0D\u53EF";
    overNote.style.display = "block";
  } else {
    autoVal.textContent = fmtYen(auto);
    overNote.style.display = "none";
  }
  if (manual > 0) return manual;
  return auto;
}
function updateTariffDisplay(categoryId) {
  const { base, additional } = getTariffRates(categoryId, tariff_rates_default);
  $("tariffRateValue").textContent = base + "%";
  if (additional > 0) {
    $("additionalTariffDisplay").style.display = "";
    $("additionalTariffValue").textContent = "+" + additional + "%";
    const at = tariff_rates_default.additional_tariff;
    if (at) $("additionalTariffLabel").textContent = `${at.name}\uFF08\u301C${at.expires}\uFF09`;
  } else {
    $("additionalTariffDisplay").style.display = "none";
  }
  $("tariffTotalValue").textContent = base + additional + "%";
  const item = tariff_rates_default.tariff_rates.find((t) => t.category_id === categoryId);
  $("tariffNote").textContent = item ? `\u203B${item.note}\u3002DDP\uFF08\u30BB\u30E9\u30FC\u8CA0\u62C5\uFF09\u3067\u8A08\u7B97\u3055\u308C\u307E\u3059\u3002` : `\u203B\u305D\u306E\u4ED6\u30AB\u30C6\u30B4\u30EA\u306F\u6982\u7B97${base}%\u3067\u8A08\u7B97\u3057\u307E\u3059\u3002DDP\uFF08\u30BB\u30E9\u30FC\u8CA0\u62C5\uFF09\u3002`;
  return { base, additional };
}
function buildInput(categoryId, base, additional, shippingCostJPY) {
  return {
    exchangeRate: num("exchangeRate"),
    currency,
    itemPrice: num("itemPrice"),
    buyerShipping: num("buyerShipping"),
    costPrice: num("costPrice"),
    fvfRate: getFvfRate(categoryId),
    baseTariffRate: base,
    additionalTariffRate: additional,
    shippingCostJPY,
    extraFeeJPY: num("extraFee")
  };
}
function setCeilCell(id, val) {
  const el = $(id);
  el.textContent = fmtYen(val);
  el.classList.toggle("profit-negative", val < 0);
  if (val < 0) el.textContent = "\u8D64\u5B57";
}
function calculate() {
  const categoryId = $("category").value;
  const { base, additional } = updateTariffDisplay(categoryId);
  const billingKg = currentBillingWeight();
  const shipResult = currentShippingJPY(billingKg);
  const shippingCostJPY = shipResult === null ? 0 : shipResult;
  const exchangeRate = num("exchangeRate");
  const itemPrice = num("itemPrice");
  const costPrice = num("costPrice");
  const currentPrice = num("currentPrice");
  const domesticShipping = num("domesticShipping");
  if (!(exchangeRate > 0 && itemPrice > 0)) {
    resetHeadline();
    resetProfit();
    updateVerdict(currentPrice, null);
    return;
  }
  const input = buildInput(categoryId, base, additional, shippingCostJPY);
  const normal = ceilings(input, "normal", domesticShipping);
  const refund = ceilings(input, "refund", domesticShipping);
  setCeilCell("ceilNormal20", normal[0].maxBid);
  setCeilCell("ceilNormal15", normal[1].maxBid);
  setCeilCell("ceilNormal10", normal[2].maxBid);
  setCeilCell("ceilRefund20", refund[0].maxBid);
  setCeilCell("ceilRefund15", refund[1].maxBid);
  setCeilCell("ceilRefund10", refund[2].maxBid);
  updateVerdict(currentPrice, normal[0].maxBid);
  const r = computeProfit(input);
  renderProfit(r, costPrice);
}
function updateVerdict(currentPrice, maxBid20) {
  const badge = $("bidBadge");
  const cur = $("verdictCurrent");
  if (currentPrice > 0) {
    cur.textContent = `\u73FE\u5728\u4FA1\u683C ${fmtYen(currentPrice)}`;
  } else {
    cur.textContent = "\u73FE\u5728\u4FA1\u683C \u672A\u5165\u529B";
  }
  const b = okBadge(currentPrice, maxBid20 == null ? 0 : maxBid20);
  badge.className = "badge " + b.cls;
  if (b.cls === "ok") {
    badge.textContent = `\u5165\u672DOK \u4E0A\u9650${fmtYen(maxBid20)}`;
  } else if (b.cls === "ng") {
    badge.textContent = maxBid20 != null && maxBid20 <= 0 ? "NG\uFF08\u8D64\u5B57\u6C34\u6E96\uFF09" : `NG \u4E0A\u9650${fmtYen(maxBid20)}`;
  } else {
    badge.textContent = "\u2014";
  }
}
function renderProfit(r, costPrice) {
  const pc = profitColorClass(r.profitRate, r.profit);
  $("profitValue").textContent = fmtYen(r.profit);
  $("profitValue").className = "profit-value " + pc;
  $("profitRate").textContent = "\u5229\u76CA\u7387 " + r.profitRate.toFixed(1) + "%";
  $("profitRate").className = "profit-rate " + pc;
  const rpc = profitColorClass(r.profitRefundRate, r.profitWithRefund);
  $("profitRefundValue").textContent = fmtYen(r.profitWithRefund);
  $("profitRefundValue").className = "profit-value " + rpc;
  $("profitRefundRate").textContent = "\u5229\u76CA\u7387 " + r.profitRefundRate.toFixed(1) + "%";
  $("profitRefundRate").className = "profit-rate " + rpc;
  $("refundNote").textContent = "\u9084\u4ED8\u984D +" + fmtYen(r.totalRefund);
  $("revenueDisplay").textContent = fmtYen(r.revenueJPY);
  $("revenueUsdDisplay").textContent = "($" + r.totalSaleUSD.toFixed(2) + ")";
  $("totalCostDisplay").textContent = fmtYen(r.fixedExpense + costPrice);
  $("costDisplay").textContent = fmtYen(costPrice);
  const b = r.breakdown;
  $("dFvf").textContent = fmtYen(b.fvfJPY);
  $("dPerOrder").textContent = fmtYen(b.perOrderJPY);
  $("dIntl").textContent = fmtYen(b.intlJPY);
  $("dEbayTax").textContent = fmtYen(b.ebayFeeTaxJPY);
  $("dPayoneer").textContent = fmtYen(b.payoneerFeeJPY);
  $("dShipping").textContent = fmtYen(b.shippingCostJPY);
  $("dTariffBase").textContent = fmtYen(b.baseTariffJPY);
  $("dTariffAdditional").textContent = fmtYen(b.additionalTariffJPY);
  $("dTariffAdditionalRow").style.display = b.additionalTariffJPY > 0 ? "" : "none";
  $("dExtraFee").textContent = fmtYen(b.extraFeeJPY);
  $("dCost").textContent = fmtYen(b.costPrice);
  $("dTotal").textContent = fmtYen(r.fixedExpense + costPrice);
  $("dRefund").textContent = "+" + fmtYen(r.totalRefund);
}
function resetHeadline() {
  ["ceilNormal20", "ceilNormal15", "ceilNormal10", "ceilRefund20", "ceilRefund15", "ceilRefund10"].forEach((id) => {
    const el = $(id);
    el.textContent = "---";
    el.classList.remove("profit-negative");
  });
}
function resetProfit() {
  ["profitValue", "profitRate", "profitRefundValue", "profitRefundRate"].forEach((id) => {
    $(id).className = $(id).className.replace(/profit-(positive|warning|negative)/g, "").trim();
  });
  $("profitValue").textContent = "---";
  $("profitRate").textContent = "---";
  $("profitRefundValue").textContent = "---";
  $("profitRefundRate").textContent = "---";
  $("refundNote").textContent = "";
  $("revenueDisplay").textContent = "---";
  $("revenueUsdDisplay").textContent = "";
  $("totalCostDisplay").textContent = "---";
  $("costDisplay").textContent = "---";
  ["dFvf", "dPerOrder", "dIntl", "dEbayTax", "dPayoneer", "dShipping", "dTariffBase", "dTariffAdditional", "dExtraFee", "dCost", "dTotal", "dRefund"].forEach((id) => $(id).textContent = "---");
}
var debTimer;
function scheduleCalc() {
  clearTimeout(debTimer);
  debTimer = setTimeout(calculate, 250);
}
function updateSearchLinks() {
  const jaText = $("productName").value.trim();
  const enText = translatedText;
  const jaLinks = [
    ["linkMercari", "https://jp.mercari.com/search?keyword="],
    ["linkYahoo", "https://auctions.yahoo.co.jp/search/search?p="],
    ["linkAmazon", "https://www.amazon.co.jp/s?k="],
    ["linkRakuten", "https://search.rakuten.co.jp/search/mall/"],
    ["linkYahooShop", "https://shopping.yahoo.co.jp/search?p="]
  ];
  for (const [id, base] of jaLinks) {
    const el = $(id);
    if (jaText) {
      el.href = base + encodeURIComponent(jaText);
      el.classList.remove("disabled");
    } else {
      el.href = "#";
      el.classList.add("disabled");
    }
  }
  const ebay = $("linkEbay"), ebaySold = $("linkEbaySold");
  if (enText) {
    const enc = encodeURIComponent(enText);
    ebay.href = "https://www.ebay.com/sch/i.html?_nkw=" + enc;
    ebay.classList.remove("disabled");
    ebaySold.href = "https://www.ebay.com/sch/i.html?_nkw=" + enc + "&LH_Sold=1&LH_Complete=1";
    ebaySold.classList.remove("disabled");
  } else {
    ebay.href = "#";
    ebay.classList.add("disabled");
    ebaySold.href = "#";
    ebaySold.classList.add("disabled");
  }
}
var translateTimer;
async function translateNow(text) {
  try {
    const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=ja|en";
    const res = await fetch(url);
    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
      translatedText = data.responseData.translatedText;
      $("translatedName").textContent = translatedText;
      $("translatedName").className = "translated-text";
    } else {
      $("translatedName").textContent = "\u7FFB\u8A33\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
      $("translatedName").className = "translated-text loading";
      translatedText = "";
    }
  } catch (e) {
    $("translatedName").textContent = "\u7FFB\u8A33\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
    $("translatedName").className = "translated-text loading";
    translatedText = "";
  }
  updateSearchLinks();
}
function onProductNameInput() {
  clearTimeout(translateTimer);
  const text = $("productName").value.trim();
  if (!text) {
    $("translatedName").textContent = "\u5546\u54C1\u540D\u3092\u5165\u529B\u3059\u308B\u3068\u81EA\u52D5\u7FFB\u8A33\u3055\u308C\u307E\u3059";
    $("translatedName").className = "translated-text";
    translatedText = "";
    updateSearchLinks();
    $("categoryHint").className = "category-hint";
    return;
  }
  updateSearchLinks();
  if (!modelLocked) {
    const guess = guessCategory(text);
    const hint = $("categoryHint");
    if (guess) {
      $("category").value = guess;
      hint.textContent = `\u300C${catName(guess)}\u300D\u3092\u81EA\u52D5\u9078\u629E\u3057\u307E\u3057\u305F`;
      hint.className = "category-hint show";
      scheduleCalc();
    } else {
      hint.className = "category-hint";
    }
  }
  $("translatedName").textContent = "\u7FFB\u8A33\u4E2D...";
  $("translatedName").className = "translated-text loading";
  translateTimer = setTimeout(() => translateNow(text), 500);
}
function onModelInput() {
  const el = $("model");
  const half = toHalfWidth(el.value);
  if (half !== el.value) el.value = half;
  const text = el.value.trim();
  const hint = $("modelHint");
  if (!text) {
    hint.className = "model-hint";
    modelLocked = false;
    scheduleCalc();
    return;
  }
  const fill = computeAutofill(text, product_specs_default);
  if (!fill) {
    const guess = guessCategory(text);
    if (guess) {
      $("category").value = guess;
      modelLocked = true;
      $("categoryHint").className = "category-hint";
      updateTariffDisplay(guess);
      hint.textContent = `\u578B\u756A\u304B\u3089\u300C${catName(guess)}\u300D\u3068\u63A8\u5B9A\uFF08\u5BF8\u6CD5\u306FDB\u672A\u53CE\u9332\u306E\u305F\u3081\u65E2\u5B9A\u5024/\u624B\u52D5\uFF09`;
      hint.className = "model-hint show";
    } else {
      hint.className = "model-hint";
      modelLocked = false;
    }
    scheduleCalc();
    return;
  }
  if (fill.categoryId) {
    $("category").value = fill.categoryId;
    modelLocked = true;
    $("categoryHint").className = "category-hint";
  }
  if (fill.size) {
    $("sizeL").value = fill.size.l;
    $("sizeW").value = fill.size.w;
    $("sizeH").value = fill.size.h;
    $("sizePresets").querySelectorAll("button").forEach((b) => b.classList.remove("selected"));
  }
  if (fill.actualWeightKg) $("actualWeight").value = fill.actualWeightKg.toFixed(2);
  const srcLink = fill.source_url ? ` <a href="${fill.source_url}" target="_blank" rel="noopener">\u30B9\u30DA\u30C3\u30AF\u51FA\u5178 \u2192</a>` : "";
  hint.innerHTML = `\u578B\u756A\u304B\u3089\u300C${catName(fill.categoryId)}\u300D\uFF0B\u5BF8\u6CD5/\u91CD\u91CF\u3092\u81EA\u52D5\u5165\u529B${srcLink}`;
  hint.className = "model-hint show";
  scheduleCalc();
}
var API_KEY = "fb2713d84e03d4cfd97d7852";
var DEFAULT_RATE = 150;
function ensureRate() {
  if (!(num("exchangeRate") > 0)) {
    $("exchangeRate").value = String(DEFAULT_RATE);
    $("rateDisplay").textContent = `USD/JPY: ${DEFAULT_RATE}\uFF08\u66AB\u5B9A\u30FB\u624B\u5165\u529B\u53EF\uFF09`;
    $("rateDate").textContent = "";
  }
}
function applyRate(rate, date) {
  $("exchangeRate").value = rate.toFixed(2);
  $("rateDisplay").textContent = "USD/JPY: " + rate.toFixed(2);
  $("rateDate").textContent = "\uFF08" + date.toLocaleDateString("ja-JP") + " \u53D6\u5F97\uFF09";
  calculate();
}
async function fetchExchangeRate(force = false) {
  if (!force) {
    const cached = localStorage.getItem("exchangeRateCache");
    if (cached) {
      try {
        const d = JSON.parse(cached);
        if (Date.now() - d.timestamp < 24 * 60 * 60 * 1e3) {
          applyRate(d.rate, new Date(d.timestamp));
          return;
        }
      } catch (e) {
      }
    }
  }
  try {
    const res = await fetch("https://v6.exchangerate-api.com/v6/" + API_KEY + "/latest/USD");
    const data = await res.json();
    if (data.result === "success" && data.conversion_rates && data.conversion_rates.JPY) {
      const rate = data.conversion_rates.JPY;
      localStorage.setItem("exchangeRateCache", JSON.stringify({ rate, timestamp: Date.now() }));
      applyRate(rate, /* @__PURE__ */ new Date());
    } else {
      $("rateDisplay").textContent = `USD/JPY: \u81EA\u52D5\u53D6\u5F97\u5931\u6557 \u2014 \u70BA\u66FF\u6B04\u306B\u624B\u5165\u529B\u53EF\uFF08\u66AB\u5B9A${DEFAULT_RATE}\uFF09`;
      ensureRate();
    }
  } catch (e) {
    $("rateDisplay").textContent = `USD/JPY: \u81EA\u52D5\u53D6\u5F97\u5931\u6557 \u2014 \u70BA\u66FF\u6B04\u306B\u624B\u5165\u529B\u53EF\uFF08\u66AB\u5B9A${DEFAULT_RATE}\uFF09`;
    ensureRate();
  }
}
async function fetchYahooLowest() {
  const keyword = $("productName").value.trim();
  const note = $("yahooNote");
  const btn = $("yahooLowestBtn");
  if (!keyword) {
    note.style.display = "block";
    note.textContent = "\u5546\u54C1\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044";
    return;
  }
  if (!(window.api && window.api.yahooLowest)) {
    note.style.display = "block";
    note.textContent = "\u3053\u306E\u74B0\u5883\u3067\u306F\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093";
    return;
  }
  btn.disabled = true;
  btn.textContent = "\u53D6\u5F97\u4E2D\u2026";
  note.style.display = "block";
  note.textContent = "\u691C\u7D22\u4E2D\u2026";
  try {
    const res = await window.api.yahooLowest(keyword);
    if (res && res.error) {
      note.textContent = "\u53D6\u5F97\u5931\u6557: " + res.error;
    } else if (res && typeof res.lowest === "number" && res.lowest > 0) {
      $("currentPrice").value = res.lowest;
      const cnt = Array.isArray(res.items) ? res.items.length : 0;
      note.textContent = `\u6700\u5B89\u5024 ${fmtYen(res.lowest)} \u3092\u53CD\u6620${cnt ? `\uFF08${cnt}\u4EF6\u4E2D\uFF09` : ""}`;
      calculate();
    } else if (res && res.stub) {
      note.textContent = "\uFF08\u30E4\u30D5\u30AA\u30AF\u691C\u7D22\u306F\u672A\u5B9F\u88C5\u3067\u3059\u3002\u624B\u52D5\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF09";
    } else {
      note.textContent = "\u8A72\u5F53\u3059\u308B\u51FA\u54C1\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F";
    }
  } catch (e) {
    note.textContent = "\u53D6\u5F97\u5931\u6557: " + (e && e.message ? e.message : e);
  } finally {
    btn.disabled = false;
    btn.textContent = "\u6700\u5B89\u5024\u53D6\u5F97";
  }
}
function applyTheme(dark) {
  document.body.classList.toggle("dark", dark);
  $("themeToggle").textContent = dark ? "\u{1F319}" : "\u2600\uFE0F";
  localStorage.setItem("theme", dark ? "dark" : "light");
}
function wire() {
  const verEl = $("appVersion");
  if (verEl) verEl.textContent = APP_VERSION;
  buildCategorySelect();
  $("currencyToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    $("currencyToggle").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currency = btn.dataset.value;
    calculate();
  });
  $("sizePresets").addEventListener("click", function(e) {
    const btn = e.target.closest("button");
    if (!btn) return;
    this.querySelectorAll("button").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    $("sizeL").value = btn.dataset.l;
    $("sizeW").value = btn.dataset.w;
    $("sizeH").value = btn.dataset.h;
    calculate();
  });
  ["sizeL", "sizeW", "sizeH"].forEach((id) => $(id).addEventListener("focus", () => {
    $("sizePresets").querySelectorAll("button").forEach((b) => b.classList.remove("selected"));
  }));
  $("detailToggleBtn").addEventListener("click", function() {
    const open = $("detailBreakdown").classList.toggle("open");
    this.textContent = open ? "\u7D4C\u8CBB\u306E\u5185\u8A33\u3092\u9589\u3058\u308B \u25B2" : "\u7D4C\u8CBB\u306E\u5185\u8A33\u3092\u898B\u308B \u25BC";
  });
  $("category").addEventListener("change", () => {
    modelLocked = false;
    $("categoryHint").className = "category-hint";
    calculate();
  });
  [
    "exchangeRate",
    "itemPrice",
    "buyerShipping",
    "costPrice",
    "currentPrice",
    "domesticShipping",
    "shippingManual",
    "extraFee",
    "sizeL",
    "sizeW",
    "sizeH",
    "actualWeight"
  ].forEach((id) => $(id).addEventListener("input", (e) => {
    const half = toHalfWidth(e.target.value);
    if (half !== e.target.value) e.target.value = half;
    scheduleCalc();
  }));
  $("model").addEventListener("input", onModelInput);
  $("productName").addEventListener("input", onProductNameInput);
  $("fetchRateBtn").addEventListener("click", () => fetchExchangeRate(true));
  $("yahooLowestBtn").addEventListener("click", fetchYahooLowest);
  $("themeToggle").addEventListener("click", () => applyTheme(!document.body.classList.contains("dark")));
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") applyTheme(true);
  else if (savedTheme === "light") applyTheme(false);
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) applyTheme(true);
  const btn60 = $("sizePresets").querySelector('button[data-l="25"]') || $("sizePresets").querySelector("button");
  if (btn60 && !$("sizeL").value) {
    btn60.classList.add("selected");
    $("sizeL").value = btn60.dataset.l;
    $("sizeW").value = btn60.dataset.w;
    $("sizeH").value = btn60.dataset.h;
  }
  if (!$("actualWeight").value) $("actualWeight").value = "0.5";
  ensureRate();
  fetchExchangeRate();
  calculate();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
else wire();
(function() {
  const yb = document.getElementById("yahooLowestBtn");
  if (yb) yb.style.display = "none";
  const yn = document.getElementById("yahooNote");
  if (yn) yn.style.display = "none";
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {
    }));
  }
})();
