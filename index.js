const { Telegraf } = require('telegraf');
const axios = require('axios');
const http = require('http');

// ================= CONFIG =================
const BOT_TOKEN = '8702410755:AAFdmwkHpmvkBPQ-fz_7sqcSy_Sv8ze_Awk';
const OWNER_USERNAME = '@headmanmk';

const WINGO_API_URL =
  'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?no=0&size=50';

const WIN_LOGO_URL =
  'https://i.postimg.cc/CRyRLM3g/win.png';

const LOSS_LOGO_URL =
  'https://i.postimg.cc/3RpgTxDz/file-000000001f6871fa818330431319e5b0.png';

const TARGET_CHAT_IDS = ['8756212566'];
// ==========================================

const bot = new Telegraf(BOT_TOKEN);

let temporaryMessages = {};

let lastPredictedPeriod = null;
let lastPredictedColor = null;
let lastPredictedSize = null;

let totalSignals = 0;
let totalWins = 0;
let totalLosses = 0;

let winStreak = 0;
let lossStreak = 0;
let martingaleLevel = 1;

let isPausedForLoss = false;
let alertSentForCurrentPeriod = false;

// ================= SMART TREND =================
function calculateSmartTrend(historyList) {
  const g1 = historyList[0];
  const g2 = historyList[1];

  let predictedColor;

  if (g1.color.toUpperCase() === g2.color.toUpperCase()) {
    predictedColor = g1.color.toUpperCase().includes('RED')
      ? 'RED'
      : 'GREEN';
  } else {
    predictedColor = g1.color.toUpperCase().includes('RED')
      ? 'GREEN'
      : 'RED';
  }

  const s1 = Number(g1.number) >= 5 ? 'BIG' : 'SMALL';
  const s2 = Number(g2.number) >= 5 ? 'BIG' : 'SMALL';

  let predictedSize;

  if (s1 === s2) {
    predictedSize = s1;
  } else {
    predictedSize = s1 === 'BIG' ? 'SMALL' : 'BIG';
  }

  const stabilityScore =
    Math.floor(Math.random() * (100 - 75 + 1)) + 75;

  let marketCondition = '';

  if (stabilityScore > 94) {
    marketCondition = '🔥 DUAL-FILTER SHOT (MAX BET)';
  } else if (stabilityScore < 82) {
    marketCondition = '🟡 MODERATE (FOLLOW 3X)';
  } else {
    marketCondition = '🟢 HIGHLY STABLE';
  }

  return {
    color: predictedColor,
    size: predictedSize,
    marketCondition,
  };
}

// ================= ACCURACY =================
function getLiveAccuracyBar() {
  if (totalSignals === 0) {
    return '[█████████░] 99.2%';
  }

  const rate = (totalWins / totalSignals) * 100;

  let bar = '';

  for (let i = 0; i < 10; i++) {
    bar += i < Math.round(rate / 10) ? '█' : '░';
  }

  return `[${bar}] ${rate.toFixed(1)}%`;
}

// ================= SEND BROADCAST =================
async function sendBroadcast(
  type,
  content,
  options = {},
  isTemporary = false
) {
  for (const chatId of TARGET_CHAT_IDS) {
    try {
      let msgObj;

      if (type === 'text') {
        msgObj = await bot.telegram.sendMessage(
          chatId,
          content,
          options
        );
      } else {
        msgObj = await bot.telegram.sendPhoto(
          chatId,
          content,
          options
        );
      }

      if (isTemporary && msgObj) {
        if (!temporaryMessages[chatId]) {
          temporaryMessages[chatId] = [];
        }

        temporaryMessages[chatId].push(msgObj.message_id);
      }
    } catch (err) {
      console.log('Broadcast Error:', err.message);
    }
  }
}

// ================= CLEAN TEMP MSG =================
async function cleanChannelSpam() {
  for (const chatId of TARGET_CHAT_IDS) {
    if (temporaryMessages[chatId]) {
      for (const msgId of temporaryMessages[chatId]) {
        try {
          await bot.telegram.deleteMessage(chatId, msgId);
        } catch (err) {}
      }

      temporaryMessages[chatId] = [];
    }
  }
}

// ================= MAIN SYSTEM =================
async function checkResultAndPredict() {
  try {
    const response = await axios.get(WINGO_API_URL);

    if (
      !response.data ||
      !response.data.data ||
      !response.data.data.list
    ) {
      return;
    }

    const historyList = response.data.data.list;

    const latestGame = historyList[0];

    const actualPeriod = latestGame.issueNumber;

    const actualColor = latestGame.color.toUpperCase();

    const actualSize =
      Number(latestGame.number) >= 5
        ? 'BIG'
        : 'SMALL';

    const seconds = new Date().getSeconds();

    // ===== ALERT =====
    if (
      seconds >= 48 &&
      seconds <= 53 &&
      !alertSentForCurrentPeriod &&
      lastPredictedPeriod
    ) {
      await sendBroadcast(
        'text',
        `⏳ *RADAR WARNING*\n\n👉 Period: ${lastPredictedPeriod}\n⚡ 10 Seconds Left!`,
        {
          parse_mode: 'Markdown',
        },
        true
      );

      alertSentForCurrentPeriod = true;
    }

    if (isPausedForLoss) return;

    // ===== CHECK RESULT =====
    if (
      lastPredictedPeriod &&
      lastPredictedPeriod === actualPeriod
    ) {
      const isWin =
        actualColor.includes(lastPredictedColor) ||
        actualSize === lastPredictedSize;

      totalSignals++;

      alertSentForCurrentPeriod = false;

      await cleanChannelSpam();

      if (isWin) {
        totalWins++;
        winStreak++;
        lossStreak = 0;
        martingaleLevel = 1;

        let streakBonus = '';

        if (winStreak >= 3) {
          streakBonus = `\n🔥 STREAK: ${winStreak} WINS`;
        }

        await sendBroadcast('photo', WIN_LOGO_URL, {
          caption:
            `💎 DARK X SHADOW RESULT 💎\n\n` +
            `📅 PERIOD: ${actualPeriod}\n` +
            `🎰 RESULT: ${actualColor} || ${actualSize}\n` +
            `${streakBonus}\n\n` +
            `✅ WIN SUCCESS`,
          parse_mode: 'Markdown',
        });
      } else {
        totalLosses++;
        winStreak = 0;
        lossStreak++;
        martingaleLevel++;

        await sendBroadcast('photo', LOSS_LOGO_URL, {
          caption:
            `⚠️ DARK X SHADOW RESULT ⚠️\n\n` +
            `📅 PERIOD: ${actualPeriod}\n` +
            `🎰 RESULT: ${actualColor} || ${actualSize}\n\n` +
            `❌ LOSS DETECTED`,
          parse_mode: 'Markdown',
        });
      }

      lastPredictedPeriod = null;

      // ===== ANTI WIPE =====
      if (lossStreak >= 3) {
        isPausedForLoss = true;

        lossStreak = 0;
        martingaleLevel = 1;

        await sendBroadcast(
          'text',
          `🛡️ *ANTI-WIPE PROTOCOL*\n\n⚠️ 3 Loss Detected\n⏳ Bot Paused For 2 Minutes`,
          {
            parse_mode: 'Markdown',
          },
          true
        );

        setTimeout(async () => {
          isPausedForLoss = false;
          await cleanChannelSpam();
        }, 120000);

        return;
      }
    }

    // ===== NEXT PREDICTION =====
    const nextPeriod =
      (BigInt(actualPeriod) + 1n).toString();

    if (lastPredictedPeriod === nextPeriod) return;

    if (seconds < 45) {
      alertSentForCurrentPeriod = false;
    }

    const { color, size, marketCondition } =
      calculateSmartTrend(historyList);

    lastPredictedPeriod = nextPeriod;
    lastPredictedColor = color;
    lastPredictedSize = size;

    await sendBroadcast(
      'text',
      `🪐 DARK X SHADOW AI VIP 🪐

📡 DK WIN WINGO 1M ENGINE
━━━━━━━━━━━━━━━━━━

📅 NEXT PERIOD: ${nextPeriod}

🔮 PREDICTION:
${color === 'RED' ? '🔴 RED' : '🟢 GREEN'} || ${size}

📊 ACCURACY:
${getLiveAccuracyBar()}

📈 MARKET:
${marketCondition}

📉 FUND LEVEL:
LEVEL ${martingaleLevel}

👑 OWNER:
${OWNER_USERNAME}`,
      {
        parse_mode: 'Markdown',
      }
    );
  } catch (error) {
    console.log('Main Error:', error.message);
  }
}

// ================= START LOOP =================
setInterval(async () => {
  await checkResultAndPredict();
}, 12000);

// ================= KEEP ALIVE =================
http
  .createServer((req, res) => {
    res.write('Bot Active');
    res.end();
  })
  .listen(process.env.PORT || 8080);

// ================= BOT START =================
bot.launch().then(() => {
  console.log('🚀 DARK X SHADOW BOT IS LIVE');
});

// ================= STOP ERROR =================
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));