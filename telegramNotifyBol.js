const TelegramBot = require('node-telegram-bot-api');
require("dotenv").config();


const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const chatIdBol = process.env.TELEGRAM_CHAT_ID;

let pendingMessages = [];

// Function to send buffered messages
async function flushMessages() {
  if (pendingMessages.length === 0) return;

  const message = pendingMessages.join("\n\n");
  try {
    await bot.sendMessage(chatIdBol, message, { parse_mode: "HTML",disable_web_page_preview: true });
    // console.log(`📩 Sent batch of ${pendingMessages.length} signals`);
  } catch (err) {
    console.error("❌ Telegram send error:", err.message);
  }

  pendingMessages = []; // clear after send
}


function queueSignalBol(symbol, lastRow) {
  const msg = `📊 <b>${symbol} ||</b> ${lastRow.side === 1 ? "🔻" : lastRow.side === 3 ? "🔺" : "⚪"} || ${lastRow.DistPct}%\n` +
    `Time: ${lastRow.Time}\n` +
    `Close: ${lastRow.Close}\n` +
    `<a href="https://www.binance.com/en/futures/${symbol}">Открыть ${symbol}</a>`;

  pendingMessages.push(msg);

  // If buffer is too big, flush immediately
  if (pendingMessages.length >= 10) {
    flushMessages();
  }
}


module.exports = { queueSignalBol,flushMessages };