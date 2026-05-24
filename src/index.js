// ─── ENV ───────────────────────────────────
import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── BOT ───────────────────────────────────
import { bot } from "./bot.js";

// ─── DATABASE ──────────────────────────────
import { connectDB } from "./db.js";
import { startTatakaeRecoveryWorker } from "./services/tatakaeRecovery.js";
import { User } from "./models/User.js";

// ─── GLOBAL ACTIVITY TRACKER ───────────────
import { trackActivity } from "./middleware/track.js";

// ─── COMMANDS ──────────────────────────────
import { startCommand } from "./commands/start.js";
import { topperCommand } from "./commands/topper.js";
import { banCommand } from "./commands/ban.js";
import { muteCommand } from "./commands/mute.js";
import { profileCommand } from "./commands/profile.js";
import { helpCommand } from "./commands/help.js";
import { estateCommand } from "./commands/estate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const recentErrors = [];

function recordError(source, err, meta = {}) {
  recentErrors.unshift({
    source,
    message: err?.message || String(err),
    stack: err?.stack || null,
    meta,
    at: new Date().toISOString()
  });
  recentErrors.splice(100);
}

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
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/assets",
    express.static(path.join(__dirname, "..", "assets"), {
      immutable: true,
      maxAge: "30d"
    })
  );
  const adminDist = path.join(__dirname, "..", "Admin", "dist");
  if (fs.existsSync(adminDist)) {
    app.use("/admin", express.static(adminDist));
    app.get("/admin", (req, res) => res.sendFile(path.join(adminDist, "index.html")));
    app.get("/admin/*", (req, res) => res.sendFile(path.join(adminDist, "index.html")));
  }

  function requireAdmin(req, res, next) {
    const configured = process.env.ADMIN_TOKEN;
    const provided = req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.query.token;
    if (!configured) {
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ error: "ADMIN_TOKEN is not configured." });
      }
      console.warn("ADMIN_TOKEN is missing. Admin routes are open in non-production mode.");
      return next();
    }
    if (provided !== configured) return res.status(401).json({ error: "Invalid admin token." });
    return next();
  }

  app.get("/api/admin/summary", requireAdmin, async (req, res) => {
    const [users, bannedUsers, aggregate] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isBanned: true }),
      User.aggregate([
        {
          $group: {
            _id: null,
            totalRp: { $sum: { $ifNull: ["$rp", "$balance"] } },
            totalWorkers: { $sum: { $size: { $ifNull: ["$shadows", []] } } }
          }
        }
      ])
    ]);
    res.json({
      users,
      bannedUsers,
      totalRp: aggregate[0]?.totalRp || 0,
      totalWorkers: aggregate[0]?.totalWorkers || 0,
      recentErrors: recentErrors.slice(0, 12)
    });
  });

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const q = String(req.query.q || "").trim();
    const filter = q
      ? {
          $or: [
            { firstName: new RegExp(q, "i") },
            { username: new RegExp(q, "i") },
            ...(Number.isFinite(Number(q)) ? [{ telegramId: Number(q) }] : [])
          ]
        }
      : {};
    const users = await User.find(filter).sort({ lastSeenAt: -1 }).limit(100).lean();
    res.json(users.map((user) => ({
      telegramId: user.telegramId,
      firstName: user.firstName,
      username: user.username,
      // Prefer `balance` as authoritative; fall back to `rp` or `moons`.
      rp: (typeof user.balance === 'number' ? user.balance : (typeof user.rp === 'number' ? user.rp : (typeof user.moons === 'number' ? user.moons : 0))),
      hp: user.hp ?? 100,
      isBanned: Boolean(user.isBanned),
      workers: user.shadows?.length || 0,
      totalPower: user.totalPower || 0,
      totalStars: user.totalStars || 0,
      scamWins: user.scamWins || 0,
      scammedCount: user.scammedCount || 0,
      lastSeenAt: user.lastSeenAt || null
    })));
  });

  app.get("/api/admin/users/:telegramId", requireAdmin, async (req, res) => {
    const user = await User.findOne({ telegramId: Number(req.params.telegramId) }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json(user);
  });

  app.patch("/api/admin/users/:telegramId", requireAdmin, async (req, res) => {
    const allowed = ["rp", "hp", "isBanned", "workerMorale", "javierProtectionUntil", "javierCooldownUntil", "shadows"];
    const update = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = req.body[key];
    }
    if (Object.prototype.hasOwnProperty.call(update, "rp")) {
      const rp = Math.max(0, Math.floor(Number(update.rp) || 0));
      update.rp = rp;
      update.balance = rp;
      update.moons = rp;
    }
    if (Object.prototype.hasOwnProperty.call(update, "hp")) {
      update.hp = Math.max(0, Math.min(100, Math.floor(Number(update.hp) || 0)));
    }
    if (Array.isArray(update.shadows)) {
      update.totalPower = update.shadows.reduce((sum, worker) => sum + (Number(worker.power) || 0), 0);
      update.totalStars = update.shadows.reduce((sum, worker) => sum + (Number(worker.stars) || 0), 0);
    }
    const user = await User.findOneAndUpdate(
      { telegramId: Number(req.params.telegramId) },
      { $set: update },
      { new: true }
    ).lean();
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json({ ok: true, user });
  });

  app.get("/api/admin/errors", requireAdmin, (req, res) => res.json(recentErrors));
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
  bot.catch((err, ctx) => {
    recordError("telegram", err, {
      updateType: ctx?.updateType,
      from: ctx?.from?.id,
      chat: ctx?.chat?.id,
      text: ctx?.message?.text
    });
    console.error("Unhandled Telegram error:", err);
  });

  // Register commands
  startCommand(bot);
  estateCommand(bot);
  topperCommand(bot);
  banCommand(bot);
  muteCommand(bot);
  profileCommand(bot);
  helpCommand(bot);
  startTatakaeRecoveryWorker(bot);

  await launchBotWithRetry();
}

start();

// ─── GRACEFUL SHUTDOWN (RAILWAY SAFE) ──────
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
process.on("unhandledRejection", (err) => recordError("unhandledRejection", err));
process.on("uncaughtException", (err) => recordError("uncaughtException", err));
