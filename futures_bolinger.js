const fs = require("fs");
const path = require("path");

const length = 20; // for Bollinger
const mult = 2;
const pairsDir = path.join(__dirname, "pairs");

// =======================
// 📘 Helper Functions
// =======================

// --- SMA ---
function SMA(values, period, index) {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index + 1 - period; i <= index; i++) sum += values[i];
  return sum / period;
}

// --- EMA ---
function EMA(values, period, index, prevEMA) {
  const k = 2 / (period + 1);
  if (index + 1 < period) return null;

  if (prevEMA === null) {
    // start EMA with SMA for first period
    return SMA(values, period, index);
  } else {
    return values[index] * k + prevEMA * (1 - k);
  }
}

// --- Standard Deviation ---
function stdDev(values, period, index) {
  if (index + 1 < period) return null;
  const mean = SMA(values, period, index);
  let sumSq = 0;
  for (let i = index + 1 - period; i <= index; i++) {
    sumSq += Math.pow(values[i] - mean, 2);
  }
  return Math.sqrt(sumSq / period);
}

// --- RSI ---
function RSI(values, period, index) {
  if (index + 1 < period + 1) return null;

  let gains = 0, losses = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100; // avoid division by 0
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// --- Average Volume ---
function avgVolume(volumes, period, index) {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index + 1 - period; i <= index; i++) sum += volumes[i];
  return sum / period;
}

// --- Position detection (we’ll expand later) ---
function getPosition(close, sma, upper, lower, ema, rsi, volume, avgVol) {
  if (!sma || !ema || !rsi) return { pos: "-", distPct: null };

  const topRange = upper - sma;
  const bottomRange = sma - lower;
  let pos = "⚪ Middle";
  let side = false;
  let distPct = 0;

  if (close >= upper && rsi > 70 && volume > avgVol) {
    const percent = ((close - upper) / upper) * 100;
    if(percent.toFixed(2) >= 7){
      pos = "🔺 Top (Overbought)";
      side = 3;
      distPct = percent;
    }
  } else if (close <= lower && rsi < 30 && volume > avgVol) {
    const percent = ((lower - close) / lower) * 100;
    if(percent.toFixed(2) >= 7){
      pos = "🔻 Bottom (Oversold)";
      side = 1;
      distPct = percent;
    }
    
  }

  return { pos, distPct: distPct.toFixed(2), side };
}

// =======================
// 🧮 Main Calculation
// =======================
function calculateRows(symbol) {
  const filePath = path.join(pairsDir, `${symbol}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ No JSON file for ${symbol}`);
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  if (!json.success) {
    console.error(`❌ API did not return success for ${symbol}`);
    return [];
  }

  const data = json.data;
  const closes = data.close;
  const volumes = data.vol;

  let emaPrev = null;

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString("en-GB", {
      timeZone: "Asia/Dubai",
      hour12: false
    });
  }

  return data.time.map((t, i) => {
    const sma = SMA(closes, length, i);
    const sd = stdDev(closes, length, i);
    const upper = sma !== null ? sma + mult * sd : null;
    const lower = sma !== null ? sma - mult * sd : null;
    const close = closes[i];

    const ema = EMA(closes, length, i, emaPrev);
    emaPrev = ema !== null ? ema : emaPrev;

    const rsi = RSI(closes, 14, i);
    const avgVol = avgVolume(volumes, 20, i);
    const vol = volumes[i];

    const { pos, distPct, side } = getPosition(close, sma, upper, lower, ema, rsi, vol, avgVol);
    const time = formatTime(t);

    return {
      Symbol: symbol,
      Time: time,
      Close: close.toFixed(4),
      SMA: sma !== null ? sma.toFixed(4) : "-",
      EMA: ema !== null ? ema.toFixed(4) : "-",
      RSI: rsi !== null ? rsi.toFixed(2) : "-",
      Upper: upper !== null ? upper.toFixed(4) : "-",
      Lower: lower !== null ? lower.toFixed(4) : "-",
      Volume: vol,
      AvgVolume: avgVol !== null ? avgVol.toFixed(2) : "-",
      Position: pos,
      DistPct: distPct,
      side
    };
  });
}

module.exports = { calculateRows };
