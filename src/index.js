// ─── ENV ───────────────────────────────────
import "dotenv/config";
import express from "express";

// ─── BOT ───────────────────────────────────
import { bot } from "./bot.js";

// ─── DATABASE ──────────────────────────────
import { connectDB } from "./db.js";
import { startTatakaeRecoveryWorker } from "./services/tatakaeRecovery.js";

// ─── GLOBAL ACTIVITY TRACKER ───────────────
import { trackActivity } from "./middleware/track.js";

// ─── COMMANDS ──────────────────────────────
import { startCommand } from "./commands/start.js";
import { wishCommand } from "./commands/wish.js";
import { gambleCommand } from "./commands/gamble.js";
import { topperCommand } from "./commands/topper.js";
import { betCommand } from "./commands/bet.js";
import { immuneCommand } from "./commands/immune.js";
import { unleashCommand } from "./commands/unleash.js";
import { lootCommand } from "./commands/loot.js";
import { duelCommand } from "./commands/duel.js";
import { ariseCommand } from "./commands/arise.js";
import { banCommand } from "./commands/ban.js";
import { muteCommand } from "./commands/mute.js";
import { shadowCommand } from "./commands/shadow.js";
import { arisersCommand } from "./commands/arisers.js";
import { trainCommand } from "./commands/train.js";
import { profileCommand } from "./commands/profile.js";
import { tatakaeCommands } from "./commands/tatakae.js";
import { helpCommand } from "./commands/help.js";
import { mikasaCommand } from "./commands/mikasa.js";
import { expeditionCommand } from "./commands/expedition.js";
import { loveCommand } from "./commands/love.js";
import { estateCommand } from "./commands/estate.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTelegramConflict(err) {
  return err?.response?.error_code === 409;
}

async function launchBotWithRetry() {
  while (true) {
    try {
      await bot.launch({
        dropPendingUpdates: true,
        allowedUpdates: []
      });
      console.log("🤖 Monster Bot is running");
      return;
    } catch (err) {
      if (!isTelegramConflict(err)) {
        console.error("Failed to launch bot:", err);
        throw err;
      }

      console.error(
        "Telegram polling conflict detected. Another bot instance is using this token. Retrying in 15 seconds..."
      );
      await sleep(15 * 1000);
    }
  }
}

// ─── BOOTSTRAP ─────────────────────────────
async function start() {
  // 🔥 Start health check server IMMEDIATELY for Render
  const app = express();
  const port = process.env.PORT || 3000;
  app.get("/", (req, res) => res.send("Bot is running 🚀"));
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    
    // 🚀 SELF-PING (Keep-alive for Render Free Plan)
    const publicUrl = process.env.RENDER_EXTERNAL_URL || "https://monsterbot-8v2b.onrender.com";
    if (publicUrl) {
      console.log(`[Keep-Alive] Starting self-ping for ${publicUrl} every 14 minutes...`);
      setInterval(async () => {
        try {
          const response = await fetch(publicUrl);
          console.log(`[Keep-Alive] Pinged ${publicUrl} - Status: ${response.status}`);
        } catch (err) {
          console.error(`[Keep-Alive] Ping failed: ${err.message}`);
        }
      }, 14 * 60 * 1000); // 14 minutes
    }
  });

  // Connect DB
  await connectDB();

  // GLOBAL TRACKER
  bot.use(trackActivity);

  // Register commands
  startCommand(bot);
  estateCommand(bot);
  wishCommand(bot);
  gambleCommand(bot);
  topperCommand(bot);
  betCommand(bot);
  immuneCommand(bot);
  unleashCommand(bot);
  lootCommand(bot);
  duelCommand(bot);
  ariseCommand(bot);
  banCommand(bot);
  muteCommand(bot);
  shadowCommand(bot);
  arisersCommand(bot);
  trainCommand(bot);
  profileCommand(bot);
  tatakaeCommands(bot);
  helpCommand(bot);
  expeditionCommand(bot);
  loveCommand(bot);
  // ⚠️  mikasaCommand MUST be registered last — its on('message') listener
  //     would otherwise shadow commands registered after it.
  mikasaCommand(bot);
  startTatakaeRecoveryWorker(bot);

  await launchBotWithRetry();
}

start();

// ─── GRACEFUL SHUTDOWN (RAILWAY SAFE) ──────
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
