// fetchFuturesKlinesBinance.js
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const interval = "15m"; // 15-minute candles (Binance format)
const pairsDir = path.join(__dirname, "pairs");

if (!fs.existsSync(pairsDir)) fs.mkdirSync(pairsDir);

async function fetchFuturesKlinesBinance(symbol) {
  const url = "https://fapi.binance.com/fapi/v1/klines";

  try {
    const { data } = await axios.get(url, {
      params: {
        symbol,
        interval,
        limit: 40 // last 500 candles
      },
    });

    if (!Array.isArray(data)) {
      console.error(`❌ Binance API error for ${symbol}`);
      return null;
    }

    // Transform Binance array-of-arrays into MEXC-like structure
    const transformed = {
      success: true,
      data: {
        time: data.map(c => c[0]),
        open: data.map(c => parseFloat(c[1])),
        high: data.map(c => parseFloat(c[2])),
        low: data.map(c => parseFloat(c[3])),
        close: data.map(c => parseFloat(c[4])),
        vol: data.map(c => parseFloat(c[5])),
      },
    };

    const outFile = path.join(pairsDir, `${symbol}.json`);
    fs.writeFileSync(outFile, JSON.stringify(transformed, null, 2));

    // console.log(`✅ ${symbol}: Saved ${data.length} candles -> ${outFile}`);
    return transformed.data.time.length;
  } catch (err) {
    console.error(`❌ Error fetching Binance ${symbol}:`, err.message);
    return null;
  }
}

module.exports = { fetchFuturesKlinesBinance };
