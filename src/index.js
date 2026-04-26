// ─── ENV ───────────────────────────────────
import "dotenv/config";
import express from "express";

// ─── BOT ───────────────────────────────────
import { bot } from "./bot.js";

// ─── DATABASE ──────────────────────────────
import { connectDB } from "./db.js";

// ─── GLOBAL ACTIVITY TRACKER ───────────────
import { trackActivity } from "./middleware/track.js";

// ─── COMMANDS ──────────────────────────────
import { startCommand } from "./commands/start.js";
import { wishCommand } from "./commands/wish.js";
import { gambleCommand } from "./commands/gamble.js";
import { topperCommand } from "./commands/topper.js";
import { betCommand } from "./commands/bet.js";
import { immuneCommand } from "./commands/immune.js";
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

// ─── BOOTSTRAP ─────────────────────────────
async function start() {
  // 🔥 Start health check server IMMEDIATELY for Render
  const app = express();
  const port = process.env.PORT || 3000;
  app.get("/", (req, res) => res.send("Bot is running 🚀"));
  app.listen(port, () => console.log(`Server running on port ${port}`));

  // Connect DB
  await connectDB();

  // GLOBAL TRACKER
  bot.use(trackActivity);

  // Register commands
  startCommand(bot);
  wishCommand(bot);
  gambleCommand(bot);
  topperCommand(bot);
  betCommand(bot);
  immuneCommand(bot);
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
  // ⚠️  mikasaCommand MUST be registered last — its on('message') listener
  //     would otherwise shadow commands registered after it.
  mikasaCommand(bot);

  // Launch bot
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  await bot.launch();
  console.log("🤖 Monster Bot is running");
}

start();

// ─── GRACEFUL SHUTDOWN (RAILWAY SAFE) ──────
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));