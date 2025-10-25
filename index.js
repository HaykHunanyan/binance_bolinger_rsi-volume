const fs = require("fs");
const path = require("path");
const express = require("express");
require("dotenv").config();

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

const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_BOT_TOKEN_COPY_TRADE = process.env.TELEGRAM_BOT_TOKEN_COPY_TRADE;
const TELEGRAM_CHAT_ID_COPY_TRADE = process.env.TELEGRAM_CHAT_ID_COPY_TRADE;
const TARGET_USER = process.env.TARGET_USER;

if (!TELEGRAM_BOT_TOKEN_COPY_TRADE || !TELEGRAM_CHAT_ID_COPY_TRADE || !TARGET_USER) {
  console.error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID and TARGET_USER env variables.');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN_COPY_TRADE, { polling: false });
const API_URL = 'https://api.hyperliquid.xyz/info';

let prevPositions = {}; // store previous positions

function prettyNumber(s) {
  try {
    const n = Number(s);
    if (!isFinite(n)) return s;
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(3) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(3) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(3) + 'k';
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch (e) { return s; }
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    hour12: false
  });
}

async function sendTelegram(html) {
  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID_COPY_TRADE, html, {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  } catch (err) {
    console.error('Telegram send error:', err.response ? err.response.data : err.message);
  }
}

function formatPositionHtml(position) {
  const p = position.position;
  return `
Size: ${Number(p.szi).toLocaleString()}  
Leverage: ${p.leverage?.value ?? '-'} (${p.leverage?.type ?? '-'})  
Entry Price: ${Number(p.entryPx).toLocaleString()}  
Position Value: ${prettyNumber(p.positionValue)}  
Unrealized PnL: ${prettyNumber(p.unrealizedPnl)}  
ROE: ${(Number(p.returnOnEquity) * 100).toFixed(2)}%  
Liquidation: ${p.liquidationPx ?? '-'}  
Margin Used: ${prettyNumber(p.marginUsed)}  
`;
}

function compareAndNotify(data) {
  const positions = data.assetPositions || [];
  const nowTs = new Date(data.time || Date.now());
  const newState = {};

  // Build new state
  for (const item of positions) {
    const coin = item.position?.coin;
    if (!coin) continue;
    newState[coin] = {
      szi: item.position.szi,
      positionValue: item.position.positionValue,
      raw: item
    };
  }

  const events = [];
  for (const coin of Object.keys(newState)) {
    const prev = prevPositions[coin];
    const currSzi = Number(newState[coin].szi || 0);
    const prevSzi = prev ? Number(prev.szi || 0) : 0;

    if (!prev && currSzi > 0) {
      events.push({ type: 'opened', coin, item: newState[coin].raw });
    } else if (currSzi > prevSzi) {
      events.push({ type: 'increased', coin, item: newState[coin].raw, delta: currSzi - prevSzi });
    } else if (currSzi === 0 && prev && prevSzi > 0) {
      events.push({ type: 'closed', coin, item: newState[coin].raw });
    }
  }

  // detect removed coins (fully closed)
  for (const coin of Object.keys(prevPositions)) {
    if (!newState[coin]) {
      events.push({ type: 'closed', coin, item: prevPositions[coin].raw });
    }
  }

  // Send notifications
  for (const ev of events) {
    let titleEmoji = 'ℹ️';
    if (ev.type === 'opened') titleEmoji = '🚀';
    if (ev.type === 'increased') titleEmoji = '📈';
    if (ev.type === 'closed') titleEmoji = '🔒';

    const header = `${titleEmoji} <b>${ev.type.toUpperCase()}</b> — ${ev.coin}\n`;
    const body = formatPositionHtml(ev.item);
    const footer = `\n🕒 <em>Time:</em> ${formatTime(nowTs)}\n<code>User: ${TARGET_USER}</code>`;

    const message = header + '\n' + body + footer;
    sendTelegram(message);
  }

  // Update stored state
  for (const coin of Object.keys(newState)) {
    prevPositions[coin] = {
      szi: newState[coin].szi,
      positionValue: newState[coin].positionValue,
      raw: newState[coin].raw
    };
  }
  for (const coin of Object.keys(prevPositions)) {
    if (!newState[coin]) delete prevPositions[coin];
  }
}

async function fetchAndProcess() {
  try {
    const resp = await axios.post(API_URL, {
      type: "clearinghouseState",
      user: TARGET_USER
    }, { timeout: 15000 });

    const data = resp.data;
    console.log(data,'data')
    compareAndNotify(data);
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

// Run every minute
(async () => {
  console.log('Starting monitor for', TARGET_USER);
  await fetchAndProcess();
  setInterval(fetchAndProcess, 60 * 1000);
})();
