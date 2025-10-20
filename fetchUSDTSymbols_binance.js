// fetchUSDTSymbols_binance.js
const axios = require("axios");

async function fetchUSDTSymbols_Binance() {
  try {
    const url = "https://fapi.binance.com/fapi/v1/exchangeInfo";
    const { data } = await axios.get(url);

    if (!data || !data.symbols) {
      throw new Error("Binance did not return symbols");
    }
    // Filter only USDT-M futures pairs
    const symbols = data.symbols
      .filter(item => item.quoteAsset === "USDT" && item.contractType === "PERPETUAL")
      .map(item => item.symbol);

    console.log(`✅ Found ${symbols.length} Binance USDT-M futures pairs`);
    return symbols;
  } catch (err) {
    console.error("❌ Error fetching Binance symbols:", err.message);
    return [];
  }
}

module.exports = { fetchUSDTSymbols_Binance };
