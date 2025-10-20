const fs = require("fs");
const path = require("path");
const express = require("express");

const { fetchFuturesKlinesBinance } = require("./fetchFuturesKlines_binance");
const { fetchUSDTSymbols_Binance } = require("./fetchUSDTSymbols_binance");

const { calculateRows } = require("./futures_bolinger");
const { queueSignalBol, flushMessages } = require("./telegramNotifyBol");

const app = express();
const PORT = process.env.PORT || 3000;
const pairsDir = path.join(__dirname, "pairs");

app.use(express.json());
app.get("/", (req, res) => res.send("Hello World 🌍"));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

if (!fs.existsSync(pairsDir)) fs.mkdirSync(pairsDir);

function cleanPairsFolder() {
  if (fs.existsSync(pairsDir)) fs.rmSync(pairsDir, { recursive: true, force: true });
  fs.mkdirSync(pairsDir);
  console.log("🧹 Pairs folder cleared and recreated");
}

async function runBackgroundLoop(w) {
  while (true) {
    await cleanPairsFolder();
    try {
      const symbols = await fetchUSDTSymbols_Binance();
      for (const symbol of symbols) {
        const fileAvailable = await fetchFuturesKlinesBinance(symbol);
        if(!fileAvailable) continue;
        let rows = calculateRows(symbol);
        rows = rows.slice(-2);
        const [prev, last] = rows;
        if (!last || !last.side) continue;
        if (last?.side === 1 || last?.side === 3) {
          await queueSignalBol(symbol, last);
        }
      }
    } catch (err) {
      console.error("Error in background loop:", err);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

runBackgroundLoop();
setInterval(flushMessages, 5000);
