import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { Markup } from "telegraf";
import { Jimp } from "jimp";
import { User } from "../models/User.js";
import { LEVELS } from "../game/levels.js";
import { hasMinMembers } from "../utils/group.js";
import { initLloydAssets, getRandomLloydImage, getCachedFileId, setCachedFileId, getLloydQuote, buildHpBar } from "../services/lloydAssets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STARTING_RP = 1000;
const MAX_HP = 100;
const WORKER_COOLDOWN = 30 * 60;
const SCAM_COOLDOWN = 5 * 60;
const BONUS_ENTRY_FEE = 100;
const WORKER_EXPLORE_PAGE_SIZE = 20;
const WORKER_EXPLORE_COLUMNS = 5;
const WORKER_THUMB_SIZE = 170;
const WORKER_THUMB_GAP = 8;

// ── Timing constants (ms) ──────────────────────────────────────────────────
const LOBBY_DURATION_MS      = 30_000;   // 30 s lobby window
const ROUND_CHOICE_WINDOW_MS = 30_000;   // 30 s per round to choose
const INTER_ROUND_DELAY_MS   = 50_000;   // 50 s between rounds (reveal + pause)
const LLOYD_QUOTE_AT_MS      = 15_000;   // mid-round quote fires 15 s in
// Countdown edit checkpoints during lobby (seconds remaining)
const LOBBY_COUNTDOWN_CHECKPOINTS = [30, 25, 20, 15, 10, 5, 4, 3, 2, 1];

const RANKS = [
  ["Frontera Baron", 50000],
  ["Master Builder", 20000],
  ["Foreman", 5000],
  ["Elite Shoveler", 1000],
  ["Novice Digger", 0]
];

const WORKER_RP = { LOW: 2, MID: 5, TOP: 12, LEGEND: 25, ULTRA: 50 };
const WORKER_POWER = { LOW: 10, MID: 20, TOP: 40, LEGEND: 70, ULTRA: 100 };
const TIER_ORDER = { LOW: 1, MID: 2, TOP: 3, LEGEND: 4, ULTRA: 5 };
const TIER_BALLS = { LOW: "⚪", MID: "🟢", TOP: "🔵", LEGEND: "🟣", ULTRA: "🔴" };
const TACTIC_BEATS = {
  aggressive: "deceptive",
  defensive: "aggressive",
  deceptive: "defensive"
};

const scamSessions = new Map();
const gallerySessions = new Map();
const bonusSessions = new Map();

// ── Utility: promise-based sleep ───────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mention(id, name = "Worker") {
  return `<a href="tg://user?id=${id}">${escapeHtml(name)}</a>`;
}

function formatTime(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.ceil(value / 60)}m`;
  const h = Math.floor(value / 3600);
  const m = Math.ceil((value % 3600) / 60);
  return `${h}h ${m}m`;
}

function getRp(user) {
  if (typeof user.balance === "number") return Math.max(0, Math.floor(user.balance));
  if (typeof user.rp === "number") return Math.max(0, Math.floor(user.rp));
  if (typeof user.moons === "number") return Math.max(0, Math.floor(user.moons));
  return STARTING_RP;
}

function setRp(user, amount) {
  const value = Math.max(0, Math.floor(amount));
  user.rp = value;
  user.moons = value;
  user.balance = value;
  user.rpRank = rankForRp(value);
}

function rankForRp(rp) {
  return RANKS.find(([, required]) => rp >= required)?.[0] || "Novice Digger";
}

function tierLabel(level) {
  return LEVELS[level]?.label || level || "Unknown Tier";
}

function tierStars(level) {
  const stars = Math.max(1, Math.min(5, LEVELS[level]?.stars || TIER_ORDER[level] || 1));
  return "★".repeat(stars) + "☆".repeat(5 - stars);
}

function tierBall(level) {
  return TIER_BALLS[level] || "⚫";
}

function normalizeWorkers(user) {
  if (!Array.isArray(user.shadows)) user.shadows = [];
  for (const worker of user.shadows) {
    if (typeof worker.scamUses !== "number") worker.scamUses = 0;
    if (typeof worker.alive !== "boolean") worker.alive = true;
    const imagePath = resolveWorkerImage(worker);
    if (imagePath) worker.imagePath = imagePath;
  }
  return user.shadows;
}

async function ensureEstateUser(telegramUser) {
  const now = nowSeconds();
  const user = await User.findOneAndUpdate(
    { telegramId: telegramUser.id },
    {
      $set: {
        username: telegramUser.username || null,
        firstName: telegramUser.first_name || null,
        lastSeenAt: now
      },
      $setOnInsert: {
        telegramId: telegramUser.id,
        balance: STARTING_RP,
        moons: STARTING_RP,
        rp: STARTING_RP,
        rpRank: "Novice Digger",
        workerMorale: 100,
        lastCollectedAt: now,
        hp: MAX_HP,
        firstSeenAt: now
      }
    },
    { new: true, upsert: true }
  );

  if (typeof user.rp !== "number") setRp(user, getRp(user));
  if (!user.rpRank) user.rpRank = rankForRp(getRp(user));
  if (typeof user.workerMorale !== "number") user.workerMorale = 100;
  if (!user.lastCollectedAt) user.lastCollectedAt = now;
  normalizeWorkers(user);
  return user;
}

function tierBreakdown(workers) {
  return Object.keys(LEVELS).reduce((counts, level) => {
    counts[level] = workers.filter((worker) => worker.level === level).length;
    return counts;
  }, {});
}

function topWorkers(user, limit = 3) {
  return normalizeWorkers(user)
    .map((worker, index) => ({ worker, index }))
    .filter(({ worker }) => worker.alive !== false)
    .sort((a, b) => (WORKER_POWER[b.worker.level] || 0) - (WORKER_POWER[a.worker.level] || 0))
    .slice(0, limit);
}

function rollLevel() {
  const roll = Math.random() * 100;
  let sum = 0;
  for (const key of Object.keys(LEVELS)) {
    sum += LEVELS[key].chance;
    if (roll <= sum) return key;
  }
  return "LOW";
}

function randomWorkerImage(levelKey) {
  const folder = path.join(__dirname, "..", "..", "assets", LEVELS[levelKey].folder);
  const files = fs.existsSync(folder)
    ? fs.readdirSync(folder).filter((file) => /\.(png|jpg|jpeg)$/i.test(file))
    : [];
  if (!files.length) return null;
  const file = files[Math.floor(Math.random() * files.length)];
  return path.join(folder, file);
}

function randomLloydImage() {
  const folder = path.join(__dirname, "..", "..", "assets", "Lloyd");
  const files = fs.existsSync(folder)
    ? fs.readdirSync(folder).filter((file) => /\.(png|jpg|jpeg|gif)$/i.test(file))
    : [];
  if (!files.length) return null;
  const file = files[Math.floor(Math.random() * files.length)];
  return path.join(folder, file);
}

function assetFolderForLevel(level) {
  const folderName = LEVELS[level]?.folder;
  if (!folderName) return null;
  return path.join(__dirname, "..", "..", "assets", folderName);
}

function findWorkerAssetByName(level, name) {
  const folder = assetFolderForLevel(level);
  if (!folder || !fs.existsSync(folder)) return null;
  const wanted = path.parse(String(name || "")).name.toLowerCase();
  if (!wanted) return null;
  const files = fs.readdirSync(folder).filter((file) => /\.(png|jpg|jpeg)$/i.test(file));
  if (!files.length) return null;
  const exact = files.find((file) => path.parse(file).name.toLowerCase() === wanted);
  const fuzzy = files.find((file) => path.parse(file).name.toLowerCase().includes(wanted));
  const file = exact || fuzzy;
  return file ? path.join(folder, file) : null;
}

function legacyPathBaseName(value = "") {
  const fileName = String(value).split(/[\\/]/).pop() || "";
  return path.parse(fileName).name;
}

function resolveWorkerImage(worker) {
  if (worker?.imagePath && fs.existsSync(worker.imagePath)) return worker.imagePath;
  const fromName = findWorkerAssetByName(worker?.level, worker?.name);
  if (fromName) return fromName;
  if (worker?.imagePath) {
    const legacyName = legacyPathBaseName(worker.imagePath);
    const fromLegacyPath = findWorkerAssetByName(worker?.level, legacyName);
    if (fromLegacyPath) return fromLegacyPath;
  }
  return null;
}

function publicBaseUrl() {
  const raw = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  return raw ? raw.replace(/\/+$/, "") : null;
}

function publicAssetUrl(worker) {
  const imagePath = resolveWorkerImage(worker);
  const baseUrl = publicBaseUrl();
  if (!imagePath || !baseUrl) return null;
  const assetsRoot = path.join(__dirname, "..", "..", "assets");
  const relative = path.relative(assetsRoot, imagePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  const encodedPath = relative
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${baseUrl}/assets/${encodedPath}`;
}

function workerCardCaption(worker, index, total) {
  const rate = WORKER_RP[worker.level] || 0;
  const power = WORKER_POWER[worker.level] || worker.power || 0;
  return (
    `<b>Frontera Labour Dossier</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<b>${escapeHtml(worker.name || "Unnamed Labourer")}</b>\n` +
    `Tier: ${tierBall(worker.level)} <b>${tierLabel(worker.level)}</b> ${tierStars(worker.level)}\n` +
    `Base Clash Power: <b>${power}</b>\n` +
    `Passive Income: <b>${rate} RP/hr</b>\n` +
    `Scam Deployments: <b>${worker.scamUses || 0}</b>\n` +
    `Status: <b>${worker.alive === false ? "Unavailable" : "Ready"}</b>\n\n` +
    `Dossier: <b>${index + 1}/${total}</b>\n\n` +
    `<i>Lloyd: "A labourer is not an expense. A labourer is future profit with boots."</i>`
  );
}

function workerContractCaption(worker, user) {
  const level = worker.level;
  return (
    `<b>LABOUR CONTRACT SIGNED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<b>${escapeHtml(worker.name)}</b>\n` +
    `Tier: ${tierBall(level)} <b>${tierLabel(level)}</b> ${tierStars(level)}\n` +
    `Base Clash Power: <b>${WORKER_POWER[level] || worker.power || 0}</b>\n` +
    `Passive Income: <b>${WORKER_RP[level] || 0} RP/hr</b>\n\n` +
    `<b>Estate Summary</b>\n` +
    `Labourers: <b>${user.shadows?.length || 0}</b>\n` +
    `Total Power: <b>${user.totalPower || 0}</b>\n` +
    `Total Stars: <b>${user.totalStars || 0}</b>\n\n` +
    `<i>Lloyd: "Water is good. Labour is good. Labour that pays for itself is divine."</i>`
  );
}

async function sendWorkerCard(ctx, worker, index, total, keyboard, replyId) {
  const caption = workerCardCaption(worker, index, total);
  const imagePath = resolveWorkerImage(worker);
  if (imagePath) {
    worker.imagePath = imagePath;
    try {
      return await ctx.replyWithPhoto(
        { source: imagePath },
        { caption, parse_mode: "HTML", reply_to_message_id: replyId, ...(keyboard || {}) }
      );
    } catch (err) {
      console.error("Worker card photo error:", err);
    }
  }
  return ctx.reply(`${caption}\n\n<i>Image unavailable; dossier recovered without portrait.</i>`, {
    parse_mode: "HTML",
    reply_to_message_id: replyId,
    ...(keyboard || {})
  });
}

function workerExploreCaption(user, page, totalPages, visibleWorkers) {
  const total = user.shadows?.length || 0;
  const unique = new Set((user.shadows || []).map((worker) => `${worker.level}:${worker.name}`)).size;
  const pageStart = page * WORKER_EXPLORE_PAGE_SIZE + 1;
  const pageEnd = pageStart + visibleWorkers.length - 1;
  return (
    `<b>${escapeHtml(user.firstName || "Baron")}'s Labour Roster</b>\n` +
    `Page <b>${page + 1}/${totalPages}</b> | Showing <b>${pageStart}-${pageEnd}</b>\n\n` +
    `Labour size: <b>${total}</b> (${unique} unique).\n` +
    `Tap a number below to inspect the matching portrait.\n\n` +
    `<i>Lloyd: "A gallery is just inventory management with prettier faces."</i>`
  );
}

function workerExploreKeyboard(sessionId, page, totalPages, visibleWorkers) {
  const startIndex = page * WORKER_EXPLORE_PAGE_SIZE;
  const numberRows = [];
  for (let i = 0; i < visibleWorkers.length; i += WORKER_EXPLORE_COLUMNS) {
    const row = visibleWorkers.slice(i, i + WORKER_EXPLORE_COLUMNS).map((worker, offset) => {
      const absoluteIndex = startIndex + i + offset;
      return Markup.button.callback(String(absoluteIndex + 1), `workers:view:${sessionId}:${absoluteIndex}`);
    });
    numberRows.push(row);
  }
  const nav = [];
  if (page > 0) nav.push(Markup.button.callback("Prev", `workers:page:${sessionId}:${page - 1}`));
  nav.push(Markup.button.callback("Close", `workers:close:${sessionId}`));
  if (page < totalPages - 1) nav.push(Markup.button.callback("Next", `workers:page:${sessionId}:${page + 1}`));
  return Markup.inlineKeyboard([...numberRows, nav]);
}

function inlineWorkerResults(user, workers) {
  return workers.slice(0, 50).map((worker, index) => {
    const caption = workerContractCaption(worker, user);
    const description = `${tierBall(worker.level)} ${tierLabel(worker.level)} | ${WORKER_RP[worker.level] || 0} RP/hr`;
    if (worker.telegramFileId) {
      return {
        type: "photo",
        id: `worker-cache-${index}`,
        photo_file_id: worker.telegramFileId,
        title: worker.name || "Labourer",
        description,
        caption,
        parse_mode: "HTML"
      };
    }
    const photoUrl = publicAssetUrl(worker);
    if (!photoUrl) return null;
    return {
      type: "photo",
      id: `worker-url-${index}`,
      photo_url: photoUrl,
      thumbnail_url: photoUrl,
      title: worker.name || "Labourer",
      description,
      caption,
      parse_mode: "HTML"
    };
  }).filter(Boolean);
}

async function createWorkerCollage(userId, sessionId, workers, page) {
  const visibleWorkers = workers.slice(
    page * WORKER_EXPLORE_PAGE_SIZE,
    page * WORKER_EXPLORE_PAGE_SIZE + WORKER_EXPLORE_PAGE_SIZE
  );
  const rows = Math.max(1, Math.ceil(visibleWorkers.length / WORKER_EXPLORE_COLUMNS));
  const width = WORKER_EXPLORE_COLUMNS * WORKER_THUMB_SIZE + (WORKER_EXPLORE_COLUMNS + 1) * WORKER_THUMB_GAP;
  const height = rows * WORKER_THUMB_SIZE + (rows + 1) * WORKER_THUMB_GAP;
  const canvas = new Jimp({ width, height, color: 0xd8cfabff });

  await Promise.all(visibleWorkers.map(async (worker, localIndex) => {
    const col = localIndex % WORKER_EXPLORE_COLUMNS;
    const row = Math.floor(localIndex / WORKER_EXPLORE_COLUMNS);
    const x = WORKER_THUMB_GAP + col * (WORKER_THUMB_SIZE + WORKER_THUMB_GAP);
    const y = WORKER_THUMB_GAP + row * (WORKER_THUMB_SIZE + WORKER_THUMB_GAP);
    const imagePath = resolveWorkerImage(worker);
    try {
      const image = imagePath
        ? await Jimp.read(imagePath)
        : new Jimp({ width: WORKER_THUMB_SIZE, height: WORKER_THUMB_SIZE, color: 0x6d6551ff });
      image.cover({ w: WORKER_THUMB_SIZE, h: WORKER_THUMB_SIZE });
      canvas.composite(image, x, y);
    } catch (err) {
      console.error("Worker collage tile error:", err);
      const placeholder = new Jimp({ width: WORKER_THUMB_SIZE, height: WORKER_THUMB_SIZE, color: 0x6d6551ff });
      canvas.composite(placeholder, x, y);
    }
  }));

  const outputDir = path.join(os.tmpdir(), "monster-bot-workers");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${userId}-${sessionId}-p${page}.png`);
  await canvas.write(outputPath);
  return { outputPath, visibleWorkers };
}

async function sendWorkerExplore(ctx, user, sessionId, page, edit = false) {
  const workers = normalizeWorkers(user);
  const totalPages = Math.max(1, Math.ceil(workers.length / WORKER_EXPLORE_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const session = gallerySessions.get(sessionId);
  if (session) session.page = safePage;

  const { outputPath, visibleWorkers } = await createWorkerCollage(user.telegramId, sessionId, workers, safePage);
  const caption = workerExploreCaption(user, safePage, totalPages, visibleWorkers);
  const keyboard = workerExploreKeyboard(sessionId, safePage, totalPages, visibleWorkers);

  if (edit) {
    try {
      return await ctx.editMessageMedia(
        { type: "photo", media: { source: outputPath }, caption, parse_mode: "HTML" },
        keyboard
      );
    } catch (err) {
      console.error("Worker explore edit error:", err);
    }
  }
  return ctx.replyWithPhoto({ source: outputPath }, { caption, parse_mode: "HTML", ...keyboard });
}

function tacticLabel(tactic) {
  return {
    aggressive: "Aggressive",
    defensive: "Defensive",
    deceptive: "Deceptive",
    share: "Share",
    embezzle: "Embezzle",
    snitch: "Snitch"
  }[tactic] || tactic;
}

function favoriteTactic(user) {
  const stats = user.tacticStats || {};
  const entries = [
    ["Aggressive", stats.aggressive || 0],
    ["Defensive", stats.defensive || 0],
    ["Deceptive", stats.deceptive || 0]
  ].sort((a, b) => b[1] - a[1]);
  return entries[0][1] ? entries[0][0] : "No favorite yet";
}

async function resolveScam(ctx, session, reason = "") {
  if (session.resolved) return;
  session.resolved = true;
  scamSessions.delete(session.id);

  const attacker = await User.findOne({ telegramId: session.attackerId });
  const defender = await User.findOne({ telegramId: session.defenderId });
  if (!attacker || !defender) return;

  normalizeWorkers(attacker);
  normalizeWorkers(defender);
  const attackerWorker = attacker.shadows[session.attackerWorkerIndex];
  const defenderWorker = session.defenderWorkerIndex == null ? null : defender.shadows[session.defenderWorkerIndex];

  let result = "attacker";
  let attackerPower = WORKER_POWER[attackerWorker?.level] || 0;
  let defenderPower = defenderWorker ? WORKER_POWER[defenderWorker.level] || 0 : 0;

  if (defenderWorker) {
    if (session.attackerTactic && session.defenderTactic) {
      if (TACTIC_BEATS[session.attackerTactic] === session.defenderTactic) attackerPower *= 2;
      if (TACTIC_BEATS[session.defenderTactic] === session.attackerTactic) defenderPower *= 2;
    }
    result = attackerPower > defenderPower ? "attacker" : defenderPower > attackerPower ? "defender" : "tie";
  }

  let amount = 0;
  const attackerRp = getRp(attacker);
  const defenderRp = getRp(defender);
  let caption;

  if (result === "attacker") {
    amount = Math.floor(defenderRp * 0.1);
    setRp(defender, defenderRp - amount);
    setRp(attacker, attackerRp + amount);
    attacker.totalRpStolen = (attacker.totalRpStolen || 0) + amount;
    attacker.scamWins = (attacker.scamWins || 0) + 1;
    defender.scammedCount = (defender.scammedCount || 0) + 1;
    caption =
      `<b>SCAM SUCCESSFUL</b>\n\n` +
      `${mention(session.attackerId, session.attackerName)} sent <b>${escapeHtml(attackerWorker.name)}</b> through the books and came back smiling.\n\n` +
      `Stolen: <b>${amount.toLocaleString()} RP</b>\n` +
      `Power: ${attackerPower} vs ${defenderPower}\n\n` +
      `<i>Lloyd: "Excellent. Deeply unethical, but excellent."</i>`;
  } else if (result === "defender") {
    amount = Math.floor(attackerRp * 0.05);
    setRp(attacker, attackerRp - amount);
    setRp(defender, defenderRp + amount);
    attacker.scamLosses = (attacker.scamLosses || 0) + 1;
    defender.scamDefenses = (defender.scamDefenses || 0) + 1;
    caption =
      `<b>SCAM CRUSHED</b>\n\n` +
      `${mention(session.defenderId, session.defenderName)} beat the scam at the gate and invoiced the attacker for the trouble.\n\n` +
      `Counterpaid: <b>${amount.toLocaleString()} RP</b>\n` +
      `Power: ${attackerPower} vs ${defenderPower}\n\n` +
      `<i>Lloyd: "A loss is just tuition. Expensive tuition."</i>`;
  } else {
    amount = Math.floor(Math.min(attackerRp, defenderRp) * 0.02);
    setRp(attacker, attackerRp - amount);
    setRp(defender, defenderRp - amount);
    attacker.scamTies = (attacker.scamTies || 0) + 1;
    defender.scamTies = (defender.scamTies || 0) + 1;
    caption =
      `<b>SCAM BROKEN UP</b>\n\n` +
      `Javier stepped between both workers. Nobody won. Both ledgers bled.\n\n` +
      `Each lost: <b>${amount.toLocaleString()} RP</b>\n` +
      `Power: ${attackerPower} vs ${defenderPower}\n\n` +
      `<i>Lloyd: "This is why I prefer contracts with traps."</i>`;
  }

  if (attackerWorker) attackerWorker.scamUses = (attackerWorker.scamUses || 0) + 1;
  if (defenderWorker) defenderWorker.scamUses = (defenderWorker.scamUses || 0) + 1;
  attacker.lastScamAt = nowSeconds();
  await attacker.save();
  await defender.save();

  await ctx.telegram.sendMessage(session.chatId, `${caption}${reason ? `\n\n${reason}` : ""}`, {
    parse_mode: "HTML"
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// LLOYD PHOTO HELPER — send or reuse cached file_id
// ══════════════════════════════════════════════════════════════════════════════
async function sendLloydPhoto(telegram, chatId, caption = null) {
  const imagePath = getRandomLloydImage();
  if (!imagePath) {
    if (caption) {
      await telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
    }
    return null;
  }

  const opts = caption ? { caption, parse_mode: "HTML" } : {};
  const cachedId = getCachedFileId(imagePath);

  try {
    let msg;
    if (cachedId) {
      msg = await telegram.sendPhoto(chatId, cachedId, opts);
    } else {
      msg = await telegram.sendPhoto(chatId, { source: imagePath }, opts);
      const fileId = msg?.photo?.at(-1)?.file_id;
      if (fileId) setCachedFileId(imagePath, fileId);
    }
    return msg;
  } catch (err) {
    // If cached ID is stale, retry with file source
    if (cachedId) {
      try {
        const msg = await telegram.sendPhoto(chatId, { source: imagePath }, opts);
        const fileId = msg?.photo?.at(-1)?.file_id;
        if (fileId) setCachedFileId(imagePath, fileId);
        return msg;
      } catch (_) {}
    }
    // Last resort: text-only
    if (caption) {
      await telegram.sendMessage(chatId, caption, { parse_mode: "HTML" }).catch(() => {});
    }
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BONUS GAME — MESSAGE BUILDERS
// ══════════════════════════════════════════════════════════════════════════════

function getChoiceLabel(choice) {
  const labels = {
    share: "⚖️ Share the Contract",
    embezzle: "🪙 Embezzle the Funds",
    snitch: "📢 Snitch to Inspector",
    earplugs: "🛡️ Buy Earplugs",
    endure: "😤 Endure",
    push: "💢 Push"
  };
  return labels[choice] || choice;
}

function getChoiceEmoji(choice) {
  return {
    share: "⚖️",
    embezzle: "🪙",
    snitch: "📢",
    earplugs: "🛡️",
    endure: "😤",
    push: "💢"
  }[choice] || "📭";
}

function buildIntroCaption(timeLeft = 30, playerCount = 0, prizePot = 0, players = []) {
  const playerSection = players.length
    ? `\n✅ <b>ON SITE:</b>\n${players.map((p) => `   👷 ${escapeHtml(p.name)}`).join("\n")}\n`
    : "";

  return (
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏗️ <b>LLOYD'S BONUS CONSTRUCTION TENDER</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>"This is a perfectly legal business arrangement.\nProbably. I haven't checked."</i>\n` +
    `— Lloyd Frontera, Frontera County Development Bureau\n\n` +

    `📋 <b>PROJECT BRIEF</b>\n` +
    `┌─────────────────────────────┐\n` +
    `│ 💰 Bid Fee:   100 RP per player │\n` +
    `│ 👷 Workers:   3–8 players        │\n` +
    `│ 🏗️ Phases:    5 rounds max        │\n` +
    `│ 🏆 Payout:    Winner takes pot    │\n` +
    `└─────────────────────────────┘\n\n` +

    `⚙️ <b>HOW THE TENDER WORKS</b>\n` +
    `Each phase, Lloyd sends you a private work order via DM.\n` +
    `Pick your strategy — but remember, others are bidding too.\n\n` +

    `⚖️ <b>SHARE THE CONTRACT</b>\n` +
    `   Split 1000 RP equally with all alive workers.\n\n` +
    `🪙 <b>EMBEZZLE THE FUNDS</b>\n` +
    `   Pocket 1000 RP solo. Collide with others? All lose -30 HP.\n\n` +
    `📢 <b>SNITCH TO THE INSPECTOR</b>\n` +
    `   Catch embezzlers for 500 RP each. No crime, no reward.\n\n` +

    `⚠️ <b>PHASE 3 — THE LULLABY CONCERT</b>\n` +
    `<i>(Lloyd accidentally booked a magic singer)</i>\n` +
    `   🛡️ Earplugs — Pay 300 RP, stay shielded.\n` +
    `   😤 Endure — Take -50 HP. Free and painful.\n` +
    `   💢 Push — Shove someone. Backfires if they're shielded.\n\n` +

    `❤️ <b>HP = Job security. Hit 0 = fired.</b>\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏳ Lobby closes in: <b>${timeLeft}s</b>\n` +
    `👷 Workers on site: <b>${playerCount} / 8</b>\n` +
    `💰 Prize pot: <b>${prizePot} RP</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━` +
    `${playerSection}`
  );
}

function buildRoundDmCaption(player, session, isLullaby, secondsLeft) {
  const aliveCount = session.players.filter((p) => p.alive).length;
  const hpBar = buildHpBar(player.hp);

  if (isLullaby) {
    return (
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎵 <b>PHASE ${session.round} — THE LULLABY INCIDENT</b>\n` +
      `<b>Contractor: ${escapeHtml(player.name)}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>"I accidentally hired a magical singer for the work site.\nThis is entirely Javier's fault."</i>\n\n` +

      `📊 <b>YOUR STATUS</b>\n` +
      `❤️ HP:    ${player.hp}/100  ${hpBar}\n` +
      `💰 Stash: ${player.stash.toLocaleString()} RP\n\n` +

      `🎵 <b>THE SONG IS PLAYING...</b>\n\n` +
      `🛡️ <b>BUY EARPLUGS</b> — Pay 300 RP. Immune to being Pushed.\n` +
      `😤 <b>ENDURE</b> — No cost. Take -50 HP. Suffer with dignity.\n` +
      `💢 <b>PUSH</b> — Shove a random coworker.\n` +
      `         If they have earplugs: YOU take -100 HP.\n` +
      `         If no other target: you take -50 HP.\n\n` +

      `⏳ <b>Decision expires in: ${secondsLeft}s</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  return (
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏗️ <b>PHASE ${session.round} WORK ORDER</b>\n` +
    `<b>Contractor: ${escapeHtml(player.name)}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<i>"Don't tell me what's ethical. Tell me what's profitable."</i>\n\n` +

    `📊 <b>YOUR STATUS</b>\n` +
    `❤️ HP:    ${player.hp}/100  ${hpBar}\n` +
    `💰 Stash: ${player.stash.toLocaleString()} RP\n` +
    `👷 Still working: ${aliveCount} players\n` +
    `🏦 Prize pot: ${session.prizePot.toLocaleString()} RP\n\n` +

    `📋 <b>CHOOSE YOUR STRATEGY</b>\n\n` +
    `⚖️ <b>SHARE THE CONTRACT</b>\n` +
    `   Split 1000 RP equally. Boring, but reliable.\n\n` +
    `🪙 <b>EMBEZZLE THE FUNDS</b>\n` +
    `   Take 1000 RP alone. If others embezzle too: all lose -30 HP.\n\n` +
    `📢 <b>SNITCH</b>\n` +
    `   Catch a thief, earn 500 RP per head. No thieves = no reward.\n\n` +

    `⏳ <b>Work order expires in: ${secondsLeft}s</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

function buildChoiceConfirmation(playerName, choiceLabel, received, total) {
  return (
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ <b>WORK ORDER SUBMITTED</b>\n` +
    `Contractor: ${escapeHtml(playerName)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `You filed: ${choiceLabel}\n\n` +
    `<i>Lloyd is reviewing submissions...</i>\n` +
    `📬 Received: <b>${received} / ${total}</b> work orders\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

function buildOutcomeLines(session, alive, isLullaby) {
  const lines = [`⚡ <b>PHASE ${session.round} OUTCOME</b>\n`];

  if (isLullaby) {
    lines.push("🎵 Lloyd's concert has concluded. Workers survived... or didn't.");
    return lines.join("\n");
  }

  const choices = alive.map((p) => ({ player: p, choice: session.choices.get(p.id) || "share" }));
  const embezzlers = choices.filter((c) => c.choice === "embezzle");
  const snitches   = choices.filter((c) => c.choice === "snitch");
  const sharers    = choices.filter((c) => c.choice === "share");

  if (!embezzlers.length && !snitches.length) {
    const share = alive.length > 0 ? Math.floor(1000 / alive.length) : 0;
    lines.push(`🤝 All workers shared the contract.\n   <b>+${share} RP each</b> (1000 RP ÷ ${alive.length} workers).`);
  } else if (embezzlers.length === 1 && !snitches.length) {
    lines.push(`🪙 Solo embezzler!\n   ${mention(embezzlers[0].player.id, embezzlers[0].player.name)} pockets <b>+1000 RP</b>.`);
  } else if (embezzlers.length > 1 && !snitches.length) {
    const names = embezzlers.map((c) => mention(c.player.id, c.player.name)).join(", ");
    lines.push(`💥 <b>${embezzlers.length} embezzlers collided!</b>\n   ${names}\n   All lose <b>-30 HP</b>. Greed divided by greed.`);
  } else if (embezzlers.length && snitches.length) {
    const thiefNames   = embezzlers.map((c) => mention(c.player.id, c.player.name)).join(", ");
    const snitchNames  = snitches.map((c) => mention(c.player.id, c.player.name)).join(", ");
    lines.push(`📢 The inspector caught ${embezzlers.length} thief/thieves!\n   Thieves (${thiefNames}): <b>-60 HP</b>\n   Snitches (${snitchNames}): <b>+500 RP each</b>`);
  } else {
    lines.push(`🙅 Snitches found nothing. No embezzlers today.\n   Everyone keeps what they had.`);
  }

  return lines.join("\n");
}

function buildStandingsMessage(session, roundNum) {
  const lines = [`📊 <b>SITE ROSTER — AFTER PHASE ${roundNum}</b>\n`];
  const sorted = [...session.players].sort((a, b) => b.stash - a.stash || b.hp - a.hp);

  sorted.forEach((player, index) => {
    const status = player.alive ? "❤️" : "💀";
    const hpBar = buildHpBar(Math.max(0, player.hp));
    lines.push(
      `${index + 1}. ${status} <b>${escapeHtml(player.name)}</b>\n` +
      `    ❤️ ${Math.max(0, player.hp)}/100  ${hpBar}\n` +
      `    💰 Stash: ${player.stash.toLocaleString()} RP`
    );
    // Blank line between players for readability
    lines.push("");
  });

  return lines.join("\n");
}

function buildEliminationMessage(player, cause = "default") {
  const causeLines = {
    embezzle_collision: "Turns out greed has a headcount limit.",
    snitch_caught:      "The inspector was watching. Classic.",
    push_backfire:      "Tried to push someone armored. That's a self-inflicted termination.",
    endure_fatal:       "The lullaby claimed another victim. It was a very catchy song.",
    push_no_target:     "No one to push. Physics punished them instead.",
    default:            "Their contract has been terminated without severance."
  };

  return (
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔨 <b>${escapeHtml(player.name)} HAS BEEN FIRED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${causeLines[cause] || causeLines.default}\n\n` +
    `<i>"HR has been notified. Well. I am HR. You're fired."</i>\n` +
    `— Lloyd Frontera`
  );
}

function buildWinnerMessage(session, winner) {
  const payout = winner.stash + session.prizePot;
  const sorted = [...session.players].sort((a, b) => b.stash - a.stash);
  const rosterLines = sorted.map((p, i) => {
    const icon = p.alive ? "✅" : "❌";
    const isWinner = p.id === winner.id ? " 👑" : "";
    return `${i + 1}. ${icon} ${escapeHtml(p.name)}${isWinner} — ${p.stash.toLocaleString()} RP`;
  });

  return (
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏆 <b>PROJECT COMPLETE — LLOYD'S VERDICT</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `One worker outlasted everyone else.\n` +
    `Or at least outscammed them.\n\n` +
    `👷 ${mention(winner.id, winner.name)} wins the Frontera Tender!\n\n` +
    `💰 <b>TOTAL PAYOUT: ${payout.toLocaleString()} RP</b>\n` +
    `   ├ Personal stash: ${winner.stash.toLocaleString()} RP\n` +
    `   └ Prize pot:      ${session.prizePot.toLocaleString()} RP\n\n` +
    `📊 <b>FINAL ROSTER</b>\n` +
    `${rosterLines.join("\n")}\n\n` +
    `<i>"I'd say I'm proud, but I'm mostly relieved.\nFrontera County thanks you for your service."</i>\n` +
    `— Lloyd Frontera, Chief Development Officer`
  );
}

function buildTotalWipeMessage(session) {
  return (
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `☠️ <b>COMPLETE PROJECT COLLAPSE</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Every single worker has been fired.\n` +
    `The ${session.prizePot.toLocaleString()} RP prize pot has been... reclaimed.\n` +
    `<i>(By Lloyd. Obviously.)</i>\n\n` +
    `<i>"I've never seen this level of collective incompetence.\nIt's almost impressive. Almost."</i>\n` +
    `— Lloyd Frontera`
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BONUS GAME — CORE LOGIC
// ══════════════════════════════════════════════════════════════════════════════

/**
 * runBonusRound
 * Sets up a round: clears choices, sends DMs, starts the 30-second choice window.
 * The actual settlement is triggered either by the timer or when all players submit.
 * A "settling" flag prevents double-execution.
 */
async function runBonusRound(bot, session) {
  if (session.finished) return;

  const alive = session.players.filter((p) => p.alive);

  // ── End conditions ─────────────────────────────────────────────────────────
  if (alive.length <= 1) {
    return finishBonus(bot, session, alive[0] || null, "sudden");
  }
  if (session.round > 5) {
    const topSurvivor = [...alive].sort((a, b) => b.stash - a.stash)[0] || null;
    return finishBonus(bot, session, topSurvivor, "score");
  }

  // ── Round setup ────────────────────────────────────────────────────────────
  session.choices    = new Map();
  session.settling   = false;   // guard against double-settle
  session.roundDmIds = session.roundDmIds || new Map();
  session.roundDmIds.clear();

  const isLullaby = session.round === 3;

  // ── Group announcement ─────────────────────────────────────────────────────
  const roundHeader = isLullaby
    ? `🎵 <b>PHASE ${session.round}: THE LULLABY CONCERT</b>\n\n<i>"I accidentally hired a magical singer.\nJavier insists it wasn't his fault. It was his fault."</i>\n\n👷 Check your DM for your private work order!\n⏳ You have <b>30 seconds</b>.`
    : `🏗️ <b>PHASE ${session.round}: FRONTERA BONUS TENDER</b>\n\n<i>"Don't tell me what's ethical. Tell me what's profitable."</i>\n\n👷 Check your DM for your private work order!\n⏳ You have <b>30 seconds</b>.`;

  await sendLloydPhoto(bot.telegram, session.chatId, roundHeader);

  // ── Send DM work orders ────────────────────────────────────────────────────
  const buttons = isLullaby
    ? Markup.inlineKeyboard([
        [Markup.button.callback("🛡️ Buy Earplugs", `bonus:choice:${session.id}:earplugs`)],
        [Markup.button.callback("😤 Endure",       `bonus:choice:${session.id}:endure`)],
        [Markup.button.callback("💢 Push",          `bonus:choice:${session.id}:push`)]
      ])
    : Markup.inlineKeyboard([
        [Markup.button.callback("⚖️ Share the Contract", `bonus:choice:${session.id}:share`)],
        [Markup.button.callback("🪙 Embezzle the Funds",  `bonus:choice:${session.id}:embezzle`)],
        [Markup.button.callback("📢 Snitch to Inspector", `bonus:choice:${session.id}:snitch`)]
      ]);

  for (const player of alive) {
    try {
      const caption = buildRoundDmCaption(player, session, isLullaby, 30);
      const imagePath = getRandomLloydImage();
      let dmMsg = null;

      if (imagePath) {
        const cachedId = getCachedFileId(imagePath);
        try {
          if (cachedId) {
            dmMsg = await bot.telegram.sendPhoto(player.id, cachedId, {
              caption, parse_mode: "HTML", ...buttons
            });
          } else {
            dmMsg = await bot.telegram.sendPhoto(player.id, { source: imagePath }, {
              caption, parse_mode: "HTML", ...buttons
            });
            const fileId = dmMsg?.photo?.at(-1)?.file_id;
            if (fileId) setCachedFileId(imagePath, fileId);
          }
        } catch (_photoErr) {
          dmMsg = await bot.telegram.sendMessage(player.id, caption, {
            parse_mode: "HTML", ...buttons
          });
        }
      } else {
        dmMsg = await bot.telegram.sendMessage(player.id, caption, {
          parse_mode: "HTML", ...buttons
        });
      }

      if (dmMsg) session.roundDmIds.set(player.id, dmMsg.message_id);
    } catch (_dmErr) {
      // Can't DM this player — apply default silently
      const defaultChoice = isLullaby ? "endure" : "share";
      session.choices.set(player.id, defaultChoice);
      await bot.telegram.sendMessage(
        session.chatId,
        `📭 <b>${escapeHtml(player.name)}</b> didn't open their work order. Default choice applied.`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
    await sleep(120); // Telegram rate-limit buffer
  }

  // ── Live DM timer: edit each DM every 5 s with updated countdown ───────────
  const choiceWindowStart = Date.now();
  const timerIntervalId = setInterval(async () => {
    const elapsed = Date.now() - choiceWindowStart;
    const remaining = Math.max(0, Math.ceil((ROUND_CHOICE_WINDOW_MS - elapsed) / 1000));

    for (const player of alive) {
      // Skip if player already submitted
      if (session.choices.has(player.id)) continue;
      const dmMsgId = session.roundDmIds.get(player.id);
      if (!dmMsgId) continue;
      try {
        const updatedCaption = buildRoundDmCaption(player, session, isLullaby, remaining);
        await bot.telegram.editMessageCaption(player.id, dmMsgId, undefined, updatedCaption, {
          parse_mode: "HTML",
          ...buttons
        });
      } catch (_) {}
    }
  }, 5000);

  // Store interval id so we can clear it on early settlement
  session.choiceTimerIntervalId = timerIntervalId;

  // ── Mid-round Lloyd quote (at 15 s) ───────────────────────────────────────
  session.lloydQuoteTimeoutId = setTimeout(async () => {
    if (session.finished || session.settling) return;
    const quote = getLloydQuote();
    await sendLloydPhoto(
      bot.telegram,
      session.chatId,
      `<i>"${quote}"</i>\n\n— <b>Lloyd Frontera</b>\n<i>Frontera County Development Bureau</i>`
    );
  }, LLOYD_QUOTE_AT_MS);

  // ── Main settlement timer (fires after 30 s) ──────────────────────────────
  session.settlementTimeoutId = setTimeout(() => {
    triggerSettle(bot, session);
  }, ROUND_CHOICE_WINDOW_MS);
}

/**
 * triggerSettle — idempotent entry point for settlement.
 * Called either by the 30-second timer OR by the callback handler when all
 * players have submitted. Clears pending timers and runs settleBonusRound once.
 */
function triggerSettle(bot, session) {
  if (session.finished || session.settling) return;
  session.settling = true;

  // Cancel pending timers to prevent any duplicate execution
  if (session.settlementTimeoutId) {
    clearTimeout(session.settlementTimeoutId);
    session.settlementTimeoutId = null;
  }
  if (session.choiceTimerIntervalId) {
    clearInterval(session.choiceTimerIntervalId);
    session.choiceTimerIntervalId = null;
  }
  if (session.lloydQuoteTimeoutId) {
    clearTimeout(session.lloydQuoteTimeoutId);
    session.lloydQuoteTimeoutId = null;
  }

  settleBonusRound(bot, session).catch((err) => {
    console.error("settleBonusRound error:", err);
  });
}

/**
 * settleBonusRound — resolves the current round, runs the 50-second reveal
 * sequence, then advances to the next round.
 */
async function settleBonusRound(bot, session) {
  const telegram = bot.telegram;
  const alive = session.players.filter((p) => p.alive);
  const isLullaby = session.round === 3;
  const roundNum = session.round; // capture before increment

  // ── Step 1 (0 s): Choices revealed ────────────────────────────────────────
  const sortedAlive = [...alive].sort((a, b) => a.name.localeCompare(b.name));
  const choicesLines = [`📋 <b>PHASE ${roundNum} — WORK ORDERS REVEALED</b>\n`];
  for (const player of sortedAlive) {
    const choice   = session.choices.get(player.id) || (isLullaby ? "endure" : "share");
    const emoji    = getChoiceEmoji(choice);
    const label    = getChoiceLabel(choice);
    const isDefault = !session.choices.has(player.id);
    choicesLines.push(`${emoji} <b>${escapeHtml(player.name)}</b> → ${label}${isDefault ? " <i>(default)</i>" : ""}`);
  }
  await telegram.sendMessage(session.chatId, choicesLines.join("\n"), { parse_mode: "HTML" }).catch(() => {});

  // ── Step 2 (7 s): Apply damage / stash changes ────────────────────────────
  await sleep(7000);

  /** Track per-player elimination causes for drama messages */
  const eliminationCauses = new Map();

  if (isLullaby) {
    // Resolve earplugs first (must know who is shielded before processing pushes)
    const shielded = new Set();
    for (const player of alive) {
      if ((session.choices.get(player.id) || "endure") === "earplugs") {
        if (player.stash >= 300) {
          player.stash -= 300;
          shielded.add(player.id);
        } else {
          // Can't afford — treat as endure
          session.choices.set(player.id, "endure");
        }
      }
    }

    for (const player of alive) {
      const choice = session.choices.get(player.id) || "endure";
      if (choice === "earplugs") continue; // handled above
      if (choice === "endure") {
        player.hp -= 50;
        if (player.hp <= 0) eliminationCauses.set(player.id, "endure_fatal");
      } else if (choice === "push") {
        const targets = alive.filter((p) => p.id !== player.id && p.alive);
        if (!targets.length) {
          player.hp -= 50;
          if (player.hp <= 0) eliminationCauses.set(player.id, "push_no_target");
        } else {
          const target = targets[Math.floor(Math.random() * targets.length)];
          if (shielded.has(target.id)) {
            player.hp = 0;
            eliminationCauses.set(player.id, "push_backfire");
          } else {
            target.hp = 0;
            eliminationCauses.set(target.id, "push_backfire");
          }
        }
      }
    }
  } else {
    const choices    = alive.map((p) => ({ player: p, choice: session.choices.get(p.id) || "share" }));
    const embezzlers = choices.filter((c) => c.choice === "embezzle");
    const snitches   = choices.filter((c) => c.choice === "snitch");

    if (!embezzlers.length && !snitches.length) {
      // All share
      const share = alive.length > 0 ? Math.floor(1000 / alive.length) : 0;
      alive.forEach((p) => (p.stash += share));
    } else if (embezzlers.length === 1 && !snitches.length) {
      embezzlers[0].player.stash += 1000;
    } else if (embezzlers.length > 1 && !snitches.length) {
      embezzlers.forEach(({ player }) => {
        player.hp -= 30;
        if (player.hp <= 0) eliminationCauses.set(player.id, "embezzle_collision");
      });
    } else if (embezzlers.length && snitches.length) {
      embezzlers.forEach(({ player }) => {
        player.hp -= 60;
        if (player.hp <= 0) eliminationCauses.set(player.id, "snitch_caught");
      });
      snitches.forEach(({ player }) => (player.stash += 500));
    }
    // Only snitches, no embezzlers: no change
  }

  // ── Step 3 (14 s): Outcome message ────────────────────────────────────────
  await sleep(7000);
  const outcomeMsg = buildOutcomeLines(session, alive, isLullaby);
  await telegram.sendMessage(session.chatId, outcomeMsg, { parse_mode: "HTML" }).catch(() => {});

  // ── Step 4 (21 s): Process eliminations + drama messages ──────────────────
  await sleep(7000);
  for (const player of alive) {
    if (player.hp <= 0 && player.alive) {
      player.alive = false;
      const cause = eliminationCauses.get(player.id) || "default";
      await telegram.sendMessage(session.chatId, buildEliminationMessage(player, cause), {
        parse_mode: "HTML"
      }).catch(() => {});
      // DM the eliminated player
      await telegram.sendMessage(
        player.id,
        `🔨 <b>You've been fired</b> from Lloyd's work site.\n` +
        `Your stash of <b>${player.stash.toLocaleString()} RP</b> has been forfeited.\n\n` +
        `<i>Javier sends his condolences. The hamster does not.</i>`,
        { parse_mode: "HTML" }
      ).catch(() => {});
      // Update DB
      User.findOne({ telegramId: player.id }).then((u) => {
        if (u) {
          u.bonusEliminations = (u.bonusEliminations || 0) + 1;
          u.save().catch(() => {});
        }
      }).catch(() => {});
    }
  }

  // ── Step 5 (28 s): Standings ───────────────────────────────────────────────
  await sleep(7000);
  await telegram.sendMessage(session.chatId, buildStandingsMessage(session, roundNum), {
    parse_mode: "HTML"
  }).catch(() => {});

  // ── Step 6 (35 s): Lloyd mid-reveal photo ─────────────────────────────────
  await sleep(7000);
  const quote = getLloydQuote();
  await sendLloydPhoto(
    telegram,
    session.chatId,
    `<i>"${quote}"</i>\n\n— <b>Lloyd Frontera</b>`
  );

  // ── Step 7 (43 s): Countdown to next phase ────────────────────────────────
  await sleep(8000);
  const nextRound = roundNum + 1;
  const stillAlive = session.players.filter((p) => p.alive);

  // Check end conditions before announcing next round
  if (stillAlive.length <= 1 || nextRound > 5) {
    // Will be handled by runBonusRound's end-condition check — advance and call
    session.round = nextRound;
    return runBonusRound(bot, session);
  }

  let countdownMsg = null;
  try {
    countdownMsg = await telegram.sendMessage(
      session.chatId,
      `🏗️ <b>Phase ${nextRound} begins in 5...</b>`,
      { parse_mode: "HTML" }
    );
  } catch (_) {}

  for (let i = 4; i >= 1; i--) {
    await sleep(1000);
    if (countdownMsg) {
      await telegram.editMessageText(
        session.chatId,
        countdownMsg.message_id,
        undefined,
        `🏗️ <b>Phase ${nextRound} begins in ${i}...</b>`,
        { parse_mode: "HTML" }
      ).catch(() => {});
    }
  }

  // ── Step 8 (50 s): Advance to next round ──────────────────────────────────
  await sleep(1000);
  session.round = nextRound;
  runBonusRound(bot, session);
}

/**
 * finishBonus — game over, pay out, update DB, announce result.
 */
async function finishBonus(bot, session, suddenWinner, mode) {
  if (session.finished) return;
  session.finished = true;

  // Cancel any outstanding timers
  if (session.settlementTimeoutId)  clearTimeout(session.settlementTimeoutId);
  if (session.choiceTimerIntervalId) clearInterval(session.choiceTimerIntervalId);
  if (session.lloydQuoteTimeoutId)  clearTimeout(session.lloydQuoteTimeoutId);
  if (session.timer)                clearInterval(session.timer); // lobby timer

  bonusSessions.delete(session.id);

  const survivors = session.players.filter((p) => p.alive);
  let winner = suddenWinner;
  if (!winner && mode === "score" && survivors.length) {
    winner = [...survivors].sort((a, b) => b.stash - a.stash)[0];
  }

  const caption = winner ? buildWinnerMessage(session, winner) : buildTotalWipeMessage(session);
  await sendLloydPhoto(bot.telegram, session.chatId, caption);

  // ── DB updates ─────────────────────────────────────────────────────────────
  for (const player of session.players) {
    try {
      const user = await User.findOne({ telegramId: player.id });
      if (!user) continue;

      user.bonusGamesPlayed = (user.bonusGamesPlayed || 0) + 1;

      if (winner && player.id === winner.id) {
        const payout = winner.stash + session.prizePot;
        setRp(user, getRp(user) + payout);
        user.bonusWins = (user.bonusWins || 0) + 1;
      } else {
        // Survivors (non-winner) keep their stash
        if (player.alive && player.stash > 0) {
          setRp(user, getRp(user) + player.stash);
        }
        user.bonusLosses = (user.bonusLosses || 0) + 1;
      }

      await user.save();
    } catch (err) {
      console.error(`finishBonus DB error for player ${player.id}:`, err.message);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMAND REGISTRATION
// ══════════════════════════════════════════════════════════════════════════════
export function estateCommand(bot) {
  bot.command("stats", async (ctx) => {
    return ctx.reply("Use /profile for the Frontera personnel ledger or /rank for the estate ledger.", {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command("immune", async (ctx) => {
    return ctx.reply("The old immunity desk is closed. Use /javier to summon Javier Asrahan.", {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command(["scarf", "shinzowosasageyo"], async (ctx) => {
    return ctx.reply("The scarf system has been replaced. Use /javier for protection and /unleash to dismiss him.", {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command("tatakae", async (ctx) => {
    return ctx.reply("The battlefield has been rebuilt. Reply to a user with /shovel.", {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command("loot", async (ctx) => {
    return ctx.reply("Looting has been audited and renamed. Reply to a user with /scam.", {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command("arise", async (ctx) => {
    return ctx.reply("The old arise ritual is now an employment contract. Use /worker.", {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command("arisers", async (ctx) => {
    return ctx.reply("The old /arisers command has been renamed. Use /labours for the estate leaderboard.", {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command("shadow", async (ctx) => {
    return ctx.reply("The old shadow roster is now the estate workforce. Use /workers.", {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command("rank", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    const workers = normalizeWorkers(user);
    const counts = tierBreakdown(workers);
    const games = (user.bonusWins || 0) + (user.bonusLosses || 0);
    const production = workers
      .filter((w) => w.alive !== false)
      .reduce((sum, w) => sum + (WORKER_RP[w.level] || 0), 0);
    const nextRank = [...RANKS].reverse().find(([, required]) => required > getRp(user));
    const nextRankText = nextRank ? `${nextRank[0]} at ${nextRank[1].toLocaleString()} RP` : "Estate ceiling reached";
    await user.save();

    return ctx.reply(
      `<b>Frontera Estate Ledger</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `<b>Owner</b>\n` +
      `Name: ${mention(ctx.from.id, ctx.from.first_name)}\n` +
      `Username: ${ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : "Not set"}\n\n` +
      `<b>Wealth & Rank</b>\n` +
      `RP Balance: <b>${getRp(user).toLocaleString()} RP</b>\n` +
      `Rank Tier: <b>${rankForRp(getRp(user))}</b>\n` +
      `Next Promotion: <b>${nextRankText}</b>\n` +
      `HP: <b>${Math.max(0, user.hp || MAX_HP)}/100</b>\n\n` +
      `<b>Labour Force</b>\n` +
      `Total Labourers: <b>${workers.length}</b>\n` +
      `${tierBall("LOW")} Low: <b>${counts.LOW}</b> | ${tierBall("MID")} Mid: <b>${counts.MID}</b> | ${tierBall("TOP")} Top: <b>${counts.TOP}</b>\n` +
      `${tierBall("LEGEND")} Legend: <b>${counts.LEGEND}</b> | ${tierBall("ULTRA")} Ultra: <b>${counts.ULTRA}</b>\n` +
      `Passive Production: <b>${production} RP/hr</b>\n` +
      `Morale: <b>${user.workerMorale ?? 100}/100</b>\n\n` +
      `<b>Frontera Bonus Record</b>\n` +
      `Wins: <b>${user.bonusWins || 0}</b> | Losses: <b>${user.bonusLosses || 0}</b> | Played: <b>${games}</b>\n\n` +
      `<i>Lloyd: "A good estate begins with a brutally honest balance sheet. Mostly brutal."</i>`,
      { parse_mode: "HTML", reply_to_message_id: ctx.message?.message_id }
    );
  });

  bot.command("collect", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    if ((user.workerMorale || 0) <= 0) {
      return ctx.reply("Your workers are on strike. Use /lullaby first.", { reply_to_message_id: ctx.message?.message_id });
    }
    const now = nowSeconds();
    const elapsedHours = Math.min(24, Math.max(0, (now - (user.lastCollectedAt || now)) / 3600));
    const production = normalizeWorkers(user)
      .filter((w) => w.alive !== false)
      .reduce((sum, w) => sum + (WORKER_RP[w.level] || 0), 0);
    const earned = Math.floor(elapsedHours * production);
    setRp(user, getRp(user) + earned);
    user.lastCollectedAt = now;
    await user.save();
    return ctx.reply(
      `You've collected ${earned.toLocaleString()} RP from your estate. Don't spend it all in one place.\n\n` +
      `Production rate: ${production} RP/hr | Stored time: ${elapsedHours.toFixed(1)}h`,
      { reply_to_message_id: ctx.message?.message_id }
    );
  });

  bot.command("lullaby", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    if ((user.workerMorale || 100) === 100) {
      return ctx.reply("Your workers are already terrified enough. They're working fine.", { reply_to_message_id: ctx.message?.message_id });
    }
    user.workerMorale = 100;
    user.lastCollectedAt = nowSeconds();
    await user.save();
    return ctx.reply(
      "Lloyd sings one note. The estate freezes. By the second note, every worker is back at their post out of pure fear. Morale restored to 100.",
      { reply_to_message_id: ctx.message?.message_id }
    );
  });

  bot.command("gg", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    const top = await User.find({ bonusWins: { $gt: 0 } }).sort({ bonusWins: -1, rp: -1 }).limit(5);
    const board = top.length
      ? top.map((u, i) => `${i + 1}. ${escapeHtml(u.firstName || "Worker")} — ${u.bonusWins || 0} wins`).join("\n")
      : "No winners yet.";
    return ctx.reply(
      `<b>Game Ledger</b>\n\n` +
      `Total Games Played: <b>${user.bonusGamesPlayed || 0}</b>\n` +
      `Games Won: <b>${user.bonusWins || 0}</b>\n` +
      `Times Fired / Eliminated: <b>${user.bonusEliminations || 0}</b>\n` +
      `Total RP Stolen: <b>${(user.totalRpStolen || 0).toLocaleString()} RP</b>\n` +
      `Favorite Tactic: <b>${favoriteTactic(user)}</b>\n\n` +
      `<b>Server Top 5</b>\n${board}`,
      { parse_mode: "HTML", reply_to_message_id: ctx.message?.message_id }
    );
  });

  bot.command("labours", async (ctx) => {
    const caller = await ensureEstateUser(ctx.from);
    const topUsers = await User.find({
      shadows: { $exists: true, $ne: [] },
      totalStars: { $gt: 0 }
    }).sort({ totalStars: -1, totalPower: -1, rp: -1 }).limit(10);

    const callerWorkers = normalizeWorkers(caller);
    const callerProduction = callerWorkers
      .filter((w) => w.alive !== false)
      .reduce((sum, w) => sum + (WORKER_RP[w.level] || 0), 0);

    const rows = topUsers.length
      ? topUsers.map((user, index) => {
          const workers = normalizeWorkers(user);
          const production = workers
            .filter((w) => w.alive !== false)
            .reduce((sum, w) => sum + (WORKER_RP[w.level] || 0), 0);
          const name = user.telegramId === ctx.from.id
            ? mention(user.telegramId, user.firstName || ctx.from.first_name)
            : `<b>${escapeHtml(user.firstName || "Unnamed Baron")}</b>`;
          return `${index + 1}. ${name}\n   Labourers: <b>${workers.length}</b> | Stars: <b>${user.totalStars || 0}</b> | Output: <b>${production} RP/hr</b>`;
        }).join("\n\n")
      : "No labour forces have been registered yet.";

    await caller.save();
    return ctx.reply(
      `<b>Frontera Labour Rankings</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Ranked by total worker stars, power, and estate value.</i>\n\n` +
      `${rows}\n\n` +
      `<b>Your Workforce</b>\n` +
      `Labourers: <b>${callerWorkers.length}</b>\n` +
      `Total Stars: <b>${caller.totalStars || 0}</b>\n` +
      `Production: <b>${callerProduction} RP/hr</b>\n\n` +
      `<i>Lloyd: "A leaderboard is just a public invoice for everyone's inadequacy."</i>`,
      { parse_mode: "HTML", reply_to_message_id: ctx.message?.message_id }
    );
  });

  bot.command("topw", async (ctx) => {
    const topUsers = await User.find({ shadows: { $exists: true, $ne: [] } }).limit(50);
    const ranked = topUsers
      .map((user) => {
        const workers = normalizeWorkers(user);
        const score = workers.reduce((sum, w) => sum + (TIER_ORDER[w.level] || 0), 0);
        const production = workers.reduce((sum, w) => sum + (WORKER_RP[w.level] || 0), 0);
        return { user, workers, score, production };
      })
      .sort((a, b) => b.score - a.score || b.workers.length - a.workers.length || getRp(b.user) - getRp(a.user))
      .slice(0, 10);

    if (!ranked.length) {
      return ctx.reply("No labour ledgers exist yet. Lloyd cannot rank empty payroll.", { reply_to_message_id: ctx.message?.message_id });
    }

    const rows = ranked.map((entry, index) => {
      const name = mention(entry.user.telegramId, entry.user.firstName || "Unnamed Baron");
      const counts = tierBreakdown(entry.workers);
      return (
        `<b>${index + 1}.</b> ${name}\n` +
        `Workers: <b>${entry.workers.length}</b> | Score: <b>${entry.score}</b> | Output: <b>${entry.production} RP/hr</b>\n` +
        `${tierBall("LOW")} ${counts.LOW}  ${tierBall("MID")} ${counts.MID}  ${tierBall("TOP")} ${counts.TOP}  ${tierBall("LEGEND")} ${counts.LEGEND}  ${tierBall("ULTRA")} ${counts.ULTRA}`
      );
    }).join("\n\n");

    return ctx.reply(
      `<b>Frontera Top Workers</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Ranked by total worker level score. Low=1, Mid=2, Top=3, Legend=4, Ultra=5.</i>\n\n` +
      `${rows}\n\n` +
      `<i>Lloyd: "A strong workforce is not luck. It is payroll with ambition."</i>`,
      { parse_mode: "HTML", reply_to_message_id: ctx.message?.message_id }
    );
  });

  bot.command("javier", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") {
      return ctx.reply("This command only works in groups.", { reply_to_message_id: ctx.message?.message_id });
    }
    if (!(await hasMinMembers(ctx, 20))) {
      return ctx.reply("Javier refuses small rooms. Bring him a group with 20+ members.", { reply_to_message_id: ctx.message?.message_id });
    }
    const user = await ensureEstateUser(ctx.from);
    const now = nowSeconds();
    if ((user.javierCooldownUntil || 0) > now) {
      return ctx.reply("Javier is on his break. You sent him away too soon.", { reply_to_message_id: ctx.message?.message_id });
    }
    if ((user.javierProtectionUntil || 0) > now) {
      return ctx.reply("Javier is already guarding you. Are you that paranoid?", { reply_to_message_id: ctx.message?.message_id });
    }
    const hours = Math.floor(Math.random() * 9) + 2;
    user.javierProtectionUntil = now + hours * 3600;
    user.immuneUntil = user.javierProtectionUntil;
    await user.save();
    return ctx.reply(`Javier stands beside you, eyes scanning the crowd. Nobody dares to move.\n\nProtection: ${hours} hours.`, {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command("unleash", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    const now = nowSeconds();
    if ((user.javierProtectionUntil || user.immuneUntil || 0) <= now) {
      return ctx.reply("Javier isn't even here. What are you unleashing?", { reply_to_message_id: ctx.message?.message_id });
    }
    const minutes = Math.floor(Math.random() * 11) + 5;
    user.javierProtectionUntil = 0;
    user.immuneUntil = 0;
    user.javierCooldownUntil = now + minutes * 60;
    user.immuneCooldownUntil = user.javierCooldownUntil;
    await user.save();
    return ctx.reply(`Javier steps aside. You are now vulnerable. Choose your battles wisely.\n\n/javier cooldown: ${minutes} minutes.`, {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command("worker", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    const now = nowSeconds();
    if (now - (user.lastAriseAt || 0) < WORKER_COOLDOWN) {
      return ctx.reply(`Lloyd's hiring desk is cooling down. Come back in ${formatTime(WORKER_COOLDOWN - (now - user.lastAriseAt))}.`, {
        reply_to_message_id: ctx.message?.message_id
      });
    }
    if (Math.random() * 100 < 25) {
      user.lastAriseAt = now;
      await user.save();
      const caption = "The recruitment pit is empty. Lloyd bills you for the paperwork anyway.";
      const imagePath = randomLloydImage();
      if (!imagePath) return ctx.reply(caption, { reply_to_message_id: ctx.message?.message_id });
      try {
        return await ctx.replyWithPhoto({ source: imagePath }, { caption, reply_to_message_id: ctx.message?.message_id });
      } catch (err) {
        return ctx.reply(caption, { reply_to_message_id: ctx.message?.message_id });
      }
    }

    const levelKey = rollLevel();
    const imagePath = randomWorkerImage(levelKey);
    if (!imagePath) return ctx.reply(`No worker assets found for ${LEVELS[levelKey].label}.`, { reply_to_message_id: ctx.message?.message_id });

    const worker = {
      name: path.parse(imagePath).name,
      level: levelKey,
      power: LEVELS[levelKey].power,
      stars: LEVELS[levelKey].stars,
      imagePath,
      scamUses: 0,
      alive: true
    };
    user.shadows.push(worker);
    const workerIndex = user.shadows.length - 1;
    user.totalStars  = (user.totalStars || 0) + worker.stars;
    user.totalPower  = (user.totalPower || 0) + worker.power;
    user.lastAriseAt = now;
    await user.save();

    const caption = workerContractCaption(worker, user);
    try {
      const sent = await ctx.replyWithPhoto(
        { source: imagePath },
        { caption, parse_mode: "HTML", reply_to_message_id: ctx.message?.message_id }
      );
      const fileId = sent?.photo?.at(-1)?.file_id;
      if (fileId) {
        user.shadows[workerIndex].telegramFileId = fileId;
        await user.save();
      }
      return sent;
    } catch (err) {
      console.error("Worker summon photo error:", err);
      return ctx.reply(`${caption}\n\n<i>Portrait failed to load, but the contract is legally binding.</i>`, {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message?.message_id
      });
    }
  });

  bot.command("workers", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    const workers = normalizeWorkers(user);
    await user.save();
    if (!workers.length) return ctx.reply("You have no workers, Baron. Use /worker to summon your first one.", { reply_to_message_id: ctx.message?.message_id });
    const id = `${ctx.from.id}:${Date.now().toString(36)}`;
    gallerySessions.set(id, { userId: ctx.from.id, page: 0 });
    return ctx.reply(
      `<b>Frontera Labour Archive</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Labourers Registered: <b>${workers.length}</b>\n` +
      `Unique Contracts: <b>${new Set(workers.map((w) => `${w.level}:${w.name}`)).size}</b>\n\n` +
      `Press <b>Explore</b> to open your worker portraits in Telegram's inline picker. Tap a portrait to send its full contract card.\n\n` +
      `<i>Lloyd: "Do not stare for free. Every portrait is an asset."</i>`,
      {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message?.message_id,
        ...Markup.inlineKeyboard([Markup.button.switchToCurrentChat("Explore", `workers ${ctx.from.id}`)])
      }
    );
  });

  bot.command("shop", async (ctx) => {
    await ensureEstateUser(ctx.from);
    return ctx.reply(
      `<b>Frontera Shop</b>\n\nChoose an item. Lloyd accepts RP, excuses, and neither refunds nor tears.`,
      {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message?.message_id,
        ...Markup.inlineKeyboard(
          [
            Markup.button.callback("Safety Helmet - 500 RP", "shop:safety_helmet"),
            Markup.button.callback("Morale Boost - 200 RP", "shop:morale_boost"),
            Markup.button.callback("Scam Permit - 300 RP", "shop:scam_permit"),
            Markup.button.callback("Javier Pass - 1000 RP", "shop:javier_pass")
          ],
          { columns: 1 }
        )
      }
    );
  });

  bot.command("shovel", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return ctx.reply("Group only. Shovels require witnesses.", { reply_to_message_id: ctx.message?.message_id });
    const targetTelegram = ctx.message?.reply_to_message?.from;
    if (!targetTelegram) return ctx.reply("Reply to a registered user with /shovel.", { reply_to_message_id: ctx.message?.message_id });
    if (targetTelegram.is_bot || targetTelegram.id === ctx.from.id) return ctx.reply("Lloyd rejects that target as bad accounting.", { reply_to_message_id: ctx.message?.message_id });

    const attacker = await ensureEstateUser(ctx.from);
    const target   = await User.findOne({ telegramId: targetTelegram.id });
    if (!target?.estateStarted) return ctx.reply("Target must use /start first.", { reply_to_message_id: ctx.message?.message_id });

    const now = nowSeconds();
    if ((attacker.javierProtectionUntil || attacker.immuneUntil || 0) > now) return ctx.reply("Protected players cannot attack. Javier did not sign up for hypocrisy.", { reply_to_message_id: ctx.message?.message_id });
    if ((target.javierProtectionUntil || target.immuneUntil || 0) > now) return ctx.reply("Javier is guarding the target. Put the shovel down.", { reply_to_message_id: ctx.message?.message_id });
    if ((attacker.lastTatakaeAt || 0) + 60 > now) return ctx.reply(`Your shovel arm needs ${formatTime(attacker.lastTatakaeAt + 60 - now)}.`, { reply_to_message_id: ctx.message?.message_id });

    const damage = Math.floor(Math.random() * 10) + 6;
    target.hp = Math.max(0, (target.hp || MAX_HP) - damage);
    attacker.lastTatakaeAt   = now;
    attacker.totalAttacks    = (attacker.totalAttacks || 0) + 1;
    if (target.hp <= 0) {
      target.defeatedAt         = now;
      target.healthRestoreDueAt = now + 10 * 60 * 60;
      attacker.successfulAttacks = (attacker.successfulAttacks || 0) + 1;
    }
    await attacker.save();
    await target.save();

    return ctx.reply(
      `<b>Shovel Impact</b>\n\n${mention(ctx.from.id, ctx.from.first_name)} deals <b>${damage}</b> HP damage to ${mention(targetTelegram.id, targetTelegram.first_name)}.\nTarget HP: <b>${target.hp}/100</b>${target.hp <= 0 ? "\n\nFired from the estate for 10 hours." : ""}\n\n<i>Lloyd: "A shovel is a tool. Today, it was also an argument."</i>`,
      { parse_mode: "HTML", reply_to_message_id: ctx.message?.message_id }
    );
  });

  bot.command("scam", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return ctx.reply("Group only. A scam without witnesses is just paperwork.", { reply_to_message_id: ctx.message?.message_id });
    const defenderTelegram = ctx.message?.reply_to_message?.from;
    if (!defenderTelegram) return ctx.reply("Reply to a target with /scam.", { reply_to_message_id: ctx.message?.message_id });
    if (defenderTelegram.is_bot || defenderTelegram.id === ctx.from.id) return ctx.reply("That scam plan is not profitable.", { reply_to_message_id: ctx.message?.message_id });

    const attacker = await ensureEstateUser(ctx.from);
    const defender = await ensureEstateUser(defenderTelegram);
    normalizeWorkers(defender);
    const now = nowSeconds();
    if ((attacker.javierProtectionUntil || attacker.immuneUntil || 0) > now) return ctx.reply("Attacker cannot be protected by Javier.", { reply_to_message_id: ctx.message?.message_id });
    if ((attacker.lastScamAt || 0) + SCAM_COOLDOWN > now) {
      const permitIndex = (attacker.inventory || []).indexOf("Scam Permit");
      if (permitIndex === -1) {
        return ctx.reply(`Your last scam is still smoking. Wait ${formatTime(attacker.lastScamAt + SCAM_COOLDOWN - now)}.`, { reply_to_message_id: ctx.message?.message_id });
      }
      attacker.inventory.splice(permitIndex, 1);
      await attacker.save();
    }
    const options = topWorkers(attacker);
    if (!options.length) return ctx.reply("You need at least one worker. Use /worker first.", { reply_to_message_id: ctx.message?.message_id });

    const id = Date.now().toString(36);
    scamSessions.set(id, {
      id,
      chatId: ctx.chat.id,
      attackerId: ctx.from.id,
      attackerName: ctx.from.first_name,
      defenderId: defenderTelegram.id,
      defenderName: defenderTelegram.first_name,
      createdAt: now
    });

    return ctx.reply(
      `<b>Choose your operative.</b>`,
      {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message?.message_id,
        ...Markup.inlineKeyboard(options.map(({ worker, index }) => [
          Markup.button.callback(`${worker.name} (${worker.level})`, `scam:aw:${id}:${index}`)
        ]))
      }
    );
  });

  // ── /bonus ─────────────────────────────────────────────────────────────────
  bot.command("bonus", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") {
      return ctx.reply("The Frontera Bonus is group only.", { reply_to_message_id: ctx.message?.message_id });
    }
    const existing = [...bonusSessions.values()].find((s) => s.chatId === ctx.chat.id && !s.finished);
    if (existing) {
      return ctx.reply("A Frontera Bonus lobby is already open here.", { reply_to_message_id: ctx.message?.message_id });
    }

    const id = Date.now().toString(36);
    const session = {
      id,
      chatId: ctx.chat.id,
      players: [],
      prizePot: 0,
      round: 1,
      choices: new Map(),
      finished: false,
      settling: false,
      timer: null,
      lobbyMessageId: null,
      roundDmIds: new Map(),
      // Timer handles
      settlementTimeoutId: null,
      choiceTimerIntervalId: null,
      lloydQuoteTimeoutId: null
    };
    bonusSessions.set(id, session);

    // ── Send lobby intro with Lloyd photo ──────────────────────────────────
    const introCaption = buildIntroCaption(30, 0, 0, []);
    let introMsg = null;
    try {
      introMsg = await sendLloydPhoto(bot.telegram, ctx.chat.id, introCaption);
      // sendLloydPhoto sends via telegram directly; for the lobby we need
      // to add the Join button — resend as ctx.replyWithPhoto if no msg returned
      if (!introMsg) throw new Error("no photo msg");
      // We can't attach buttons via sendLloydPhoto; edit to add keyboard
      // Instead, send a separate keyboard message pinned below
    } catch (_) {}

    // Always send (or re-send) the message with the Join button attached
    // We use ctx for the initial send so it appears in the right chat
    try {
      const lloydImage = getRandomLloydImage();
      if (lloydImage) {
        const cachedId = getCachedFileId(lloydImage);
        if (cachedId) {
          introMsg = await ctx.replyWithPhoto(cachedId, {
            caption: introCaption,
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([Markup.button.callback("👷 Join the Tender", `bonus:join:${id}`)])
          });
        } else {
          introMsg = await ctx.replyWithPhoto({ source: lloydImage }, {
            caption: introCaption,
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([Markup.button.callback("👷 Join the Tender", `bonus:join:${id}`)])
          });
          const fileId = introMsg?.photo?.at(-1)?.file_id;
          if (fileId) setCachedFileId(lloydImage, fileId);
        }
      } else {
        introMsg = await ctx.reply(introCaption, {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([Markup.button.callback("👷 Join the Tender", `bonus:join:${id}`)])
        });
      }
    } catch (err) {
      console.error("Bonus intro send error:", err.message);
      introMsg = await ctx.reply(introCaption, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([Markup.button.callback("👷 Join the Tender", `bonus:join:${id}`)])
      }).catch(() => null);
    }

    if (introMsg) session.lobbyMessageId = introMsg.message_id;

    // ── Lobby countdown ────────────────────────────────────────────────────
    // Use a single setInterval that ticks every second and edits at checkpoints
    let lobbySecondsLeft = 30;
    const checkpoints = new Set(LOBBY_COUNTDOWN_CHECKPOINTS);

    session.timer = setInterval(async () => {
      lobbySecondsLeft -= 1;

      // Auto-start if lobby is full
      if (session.players.length >= 8) {
        clearInterval(session.timer);
        session.timer = null;
        await bot.telegram.sendMessage(
          session.chatId,
          "👷 <b>8 workers on site — lobby full! Starting immediately.</b>",
          { parse_mode: "HTML" }
        ).catch(() => {});
        return runBonusRound(bot, session);
      }

      // Edit message at countdown checkpoints
      if (checkpoints.has(lobbySecondsLeft) && session.lobbyMessageId) {
        const updatedCaption = buildIntroCaption(lobbySecondsLeft, session.players.length, session.prizePot, session.players);
        try {
          await bot.telegram.editMessageCaption(
            session.chatId,
            session.lobbyMessageId,
            undefined,
            updatedCaption,
            {
              parse_mode: "HTML",
              ...Markup.inlineKeyboard([Markup.button.callback("👷 Join the Tender", `bonus:join:${id}`)])
            }
          );
        } catch (_) {} // identical text or old message — silently ignore
      }

      // Lobby closed
      if (lobbySecondsLeft <= 0) {
        clearInterval(session.timer);
        session.timer = null;

        if (session.players.length >= 3) {
          await bot.telegram.sendMessage(
            session.chatId,
            `🏗️ <b>Lobby closed! ${session.players.length} workers on site.</b>\nPhase 1 starting now...`,
            { parse_mode: "HTML" }
          ).catch(() => {});
          return runBonusRound(bot, session);
        } else {
          bonusSessions.delete(id);
          session.finished = true;
          await bot.telegram.sendMessage(
            session.chatId,
            `🚫 <b>Lobby Closed</b>\n\nLloyd refuses to run a psychological finance disaster for fewer than 3 players.\n<i>"This is embarrassing for everyone."</i>`,
            { parse_mode: "HTML" }
          ).catch(() => {});
        }
      }
    }, 1000);
  });

  // ── /fstart ────────────────────────────────────────────────────────────────
  bot.command("fstart", async (ctx) => {
    const session = [...bonusSessions.values()].find((s) => s.chatId === ctx.chat.id && !s.finished);
    if (!session) return ctx.reply("No active Frontera Bonus lobby.", { reply_to_message_id: ctx.message?.message_id });
    if (session.players.length < 3) return ctx.reply("Need at least 3 players.", { reply_to_message_id: ctx.message?.message_id });
    clearInterval(session.timer);
    session.timer = null;
    await bot.telegram.sendMessage(
      session.chatId,
      `⚡ <b>${ctx.from.first_name} force-started the tender!</b>`,
      { parse_mode: "HTML" }
    ).catch(() => {});
    return runBonusRound(bot, session);
  });

  bot.command(["timeplus", "timeminus"], async (ctx) => {
    return ctx.reply("Lobby timer controls are acknowledged. Use /fstart when 3+ players are ready.", { reply_to_message_id: ctx.message?.message_id });
  });

  // ── Inline worker query ────────────────────────────────────────────────────
  bot.on("inline_query", async (ctx) => {
    const query = (ctx.inlineQuery?.query || "").trim();
    if (!/^workers\b/i.test(query)) return;

    const requestedUserId = Number(query.split(/\s+/)[1] || ctx.from.id);
    if (requestedUserId !== ctx.from.id) {
      return ctx.answerInlineQuery(
        [{
          type: "article",
          id: "private-workers",
          title: "This labour archive is private",
          description: "Use /workers from your own account to inspect your estate.",
          input_message_content: { message_text: "Lloyd refuses to leak another baron's labour contracts. Use /workers yourself." }
        }],
        { cache_time: 1, is_personal: true }
      );
    }

    const user = await ensureEstateUser(ctx.from);
    const workers = normalizeWorkers(user);
    await user.save();

    const results = inlineWorkerResults(user, workers);
    if (!results.length) {
      return ctx.answerInlineQuery(
        [{
          type: "article",
          id: "no-worker-images",
          title: "No public worker portraits ready",
          description: "Summon a new /worker or set PUBLIC_URL/RENDER_EXTERNAL_URL for inline portraits.",
          input_message_content: { message_text: "No inline portraits are ready yet. Summon a new /worker so Telegram can cache the portrait, or set PUBLIC_URL/RENDER_EXTERNAL_URL for public asset links." }
        }],
        { cache_time: 1, is_personal: true }
      );
    }

    return ctx.answerInlineQuery(results, { cache_time: 5, is_personal: true });
  });

  // ── Shop action ────────────────────────────────────────────────────────────
  bot.action(/^shop:(.+)$/, async (ctx) => {
    const key = ctx.match[1];
    const items = {
      safety_helmet: ["Safety Helmet", 500],
      morale_boost:  ["Morale Boost",  200],
      scam_permit:   ["Scam Permit",   300],
      javier_pass:   ["Javier Pass",  1000]
    };
    const [name, cost] = items[key] || [];
    const user = await ensureEstateUser(ctx.from);
    if (!name) return ctx.answerCbQuery("Unknown item.");
    if (getRp(user) < cost) return ctx.answerCbQuery("Not enough RP.", { show_alert: true });
    setRp(user, getRp(user) - cost);
    if (key === "morale_boost") user.workerMorale = 100;
    else if (key === "javier_pass") user.javierCooldownUntil = 0;
    else user.inventory = [...(user.inventory || []), name];
    await user.save();
    await ctx.answerCbQuery("Purchased.");
    return ctx.reply(`Smart investment. Lloyd would be proud.\n\nPurchased: ${name}`);
  });

  // ── Worker gallery actions ─────────────────────────────────────────────────
  bot.action(/^workers:explore:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const session = gallerySessions.get(id);
    if (!session || session.userId !== ctx.from.id) return ctx.answerCbQuery("This gallery expired.");
    const user = await ensureEstateUser(ctx.from);
    const workers = normalizeWorkers(user);
    if (!workers.length) return ctx.answerCbQuery("No labourers found.", { show_alert: true });
    await ctx.answerCbQuery("Opening archive.");
    return sendWorkerExplore(ctx, user, id, 0);
  });

  bot.action(/^workers:page:(.+):(\d+)$/, async (ctx) => {
    const id = ctx.match[1];
    const page = Number(ctx.match[2]);
    const session = gallerySessions.get(id);
    if (!session || session.userId !== ctx.from.id) return ctx.answerCbQuery("This gallery expired.");
    const user = await ensureEstateUser(ctx.from);
    await ctx.answerCbQuery(`Page ${page + 1}`);
    return sendWorkerExplore(ctx, user, id, page, true);
  });

  bot.action(/^workers:view:(.+):(\d+)$/, async (ctx) => {
    const id = ctx.match[1];
    const index = Number(ctx.match[2]);
    const session = gallerySessions.get(id);
    if (!session || session.userId !== ctx.from.id) return ctx.answerCbQuery("This gallery expired.");
    const user = await ensureEstateUser(ctx.from);
    const workers = normalizeWorkers(user);
    const worker = workers[index];
    if (!worker) return ctx.answerCbQuery("Labourer not found.", { show_alert: true });

    await ctx.answerCbQuery(worker.name || "Labour dossier");
    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback("Back to Explore", `workers:page:${id}:${session.page || 0}`),
      Markup.button.callback("Close", `workers:close:${id}`)
    ]);
    const imagePath = resolveWorkerImage(worker);
    const caption   = workerContractCaption(worker, user);

    if (!imagePath) {
      return ctx.reply(`${caption}\n\n<i>Image unavailable; contract details recovered from the ledger.</i>`, {
        parse_mode: "HTML", ...keyboard
      });
    }

    worker.imagePath = imagePath;
    try {
      return await ctx.editMessageMedia(
        { type: "photo", media: { source: imagePath }, caption, parse_mode: "HTML" },
        keyboard
      );
    } catch (err) {
      console.error("Worker view edit error:", err);
      return ctx.replyWithPhoto({ source: imagePath }, { caption, parse_mode: "HTML", ...keyboard });
    }
  });

  bot.action(/^workers:close:(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const session = gallerySessions.get(id);
    if (!session || session.userId !== ctx.from.id) return ctx.answerCbQuery("This gallery expired.");
    gallerySessions.delete(id);
    await ctx.answerCbQuery("Closed.");
    return ctx.editMessageCaption("Labour archive closed. Lloyd has returned the portraits to the vault.")
      .catch(() => ctx.deleteMessage().catch(() => {}));
  });

  // ── Scam actions ───────────────────────────────────────────────────────────
  bot.action(/^scam:aw:([^:]+):(\d+)$/, async (ctx) => {
    const session = scamSessions.get(ctx.match[1]);
    if (!session || session.attackerId !== ctx.from.id) return ctx.answerCbQuery("This scam is not yours.");
    session.attackerWorkerIndex = Number(ctx.match[2]);
    await ctx.answerCbQuery("Operative deployed.");
    const defender = await User.findOne({ telegramId: session.defenderId });
    if ((defender?.javierProtectionUntil || defender?.immuneUntil || 0) > nowSeconds()) {
      session.resolved = true;
      scamSessions.delete(session.id);
      return ctx.telegram.sendMessage(session.chatId, "Javier steps out. Your worker is arrested. The scam fails.");
    }
    await ctx.telegram.sendMessage(
      session.chatId,
      `${mention(session.defenderId, session.defenderName)}! ${escapeHtml(session.attackerName)}'s worker is at your gates. Fight or surrender?`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          Markup.button.callback("Give Up",       `scam:surrender:${session.id}`),
          Markup.button.callback("Deploy Worker", `scam:def:${session.id}`)
        ])
      }
    );
    setTimeout(() => resolveScam(ctx, session, "\nDefender did not respond. Auto surrender."), 30_000);
  });

  bot.action(/^scam:surrender:(.+)$/, async (ctx) => {
    const session = scamSessions.get(ctx.match[1]);
    if (!session || session.defenderId !== ctx.from.id) return ctx.answerCbQuery("Only the defender can surrender.");
    await ctx.answerCbQuery("Surrendered.");
    return resolveScam(ctx, session, "\nThe defender surrendered.");
  });

  bot.action(/^scam:def:(.+)$/, async (ctx) => {
    const session = scamSessions.get(ctx.match[1]);
    if (!session || session.defenderId !== ctx.from.id) return ctx.answerCbQuery("Only the defender can deploy.");
    const defender = await ensureEstateUser(ctx.from);
    const options  = topWorkers(defender);
    if (!options.length) return ctx.answerCbQuery("You have no workers.", { show_alert: true });
    await ctx.answerCbQuery("Choose a defender.");
    return ctx.reply(
      "Choose your defender.",
      Markup.inlineKeyboard(options.map(({ worker, index }) => [
        Markup.button.callback(`${worker.name} (${worker.level})`, `scam:dw:${session.id}:${index}`)
      ]))
    );
  });

  bot.action(/^scam:dw:([^:]+):(\d+)$/, async (ctx) => {
    const session = scamSessions.get(ctx.match[1]);
    if (!session || session.defenderId !== ctx.from.id) return ctx.answerCbQuery("This defense is not yours.");
    session.defenderWorkerIndex = Number(ctx.match[2]);
    await ctx.answerCbQuery("Defender deployed.");
    const buttons = [
      Markup.button.callback("Aggressive", `scam:t:${session.id}:aggressive`),
      Markup.button.callback("Defensive",  `scam:t:${session.id}:defensive`),
      Markup.button.callback("Deceptive",  `scam:t:${session.id}:deceptive`)
    ];
    await ctx.telegram.sendMessage(session.attackerId, "Choose your secret tactic.", Markup.inlineKeyboard(buttons, { columns: 1 }));
    await ctx.telegram.sendMessage(session.defenderId, "Choose your secret tactic.", Markup.inlineKeyboard(buttons, { columns: 1 }));
    setTimeout(() => resolveScam(ctx, session, "\nTactic timer expired."), 15_000);
  });

  bot.action(/^scam:t:([^:]+):(aggressive|defensive|deceptive)$/, async (ctx) => {
    const session = scamSessions.get(ctx.match[1]);
    if (!session) return ctx.answerCbQuery("This scam expired.");
    if (![session.attackerId, session.defenderId].includes(ctx.from.id)) return ctx.answerCbQuery("Not your clash.");
    const tactic = ctx.match[2];
    if (ctx.from.id === session.attackerId) session.attackerTactic = tactic;
    else session.defenderTactic = tactic;
    const user = await ensureEstateUser(ctx.from);
    user.tacticStats = user.tacticStats || {};
    user.tacticStats[tactic] = (user.tacticStats[tactic] || 0) + 1;
    await user.save();
    await ctx.answerCbQuery(`${tacticLabel(tactic)} locked.`);
    if (session.attackerTactic && session.defenderTactic) return resolveScam(ctx, session);
  });

  // ── Bonus: join ────────────────────────────────────────────────────────────
  bot.action(/^bonus:join:(.+)$/, async (ctx) => {
    const session = bonusSessions.get(ctx.match[1]);
    if (!session || session.finished) return ctx.answerCbQuery("Lobby closed.");
    if (session.players.some((p) => p.id === ctx.from.id)) {
      return ctx.answerCbQuery("You're already on site.", { show_alert: false });
    }
    if (session.players.length >= 8) return ctx.answerCbQuery("Lobby full.", { show_alert: true });

    const user = await ensureEstateUser(ctx.from);
    if (getRp(user) < BONUS_ENTRY_FEE) {
      return ctx.answerCbQuery(`Need ${BONUS_ENTRY_FEE} RP to join.`, { show_alert: true });
    }

    setRp(user, getRp(user) - BONUS_ENTRY_FEE);
    await user.save();
    session.prizePot += BONUS_ENTRY_FEE;
    session.players.push({
      id: ctx.from.id,
      name: ctx.from.first_name || "Worker",
      hp: 100,
      stash: 0,
      alive: true
    });

    await ctx.answerCbQuery("✅ Joined the tender!");

    // Update lobby message
    if (session.lobbyMessageId) {
      const updatedCaption = buildIntroCaption(
        "⏳", // timer is running — don't show exact seconds here
        session.players.length,
        session.prizePot,
        session.players
      );
      try {
        await ctx.editMessageCaption(updatedCaption, {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([Markup.button.callback("👷 Join the Tender", `bonus:join:${session.id}`)])
        });
      } catch (_) {}
    }
  });

  // ── Bonus: choice ──────────────────────────────────────────────────────────
  bot.action(/^bonus:choice:([^:]+):(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1];
    const choice    = ctx.match[2];
    const session   = bonusSessions.get(sessionId);

    if (!session || session.finished) return ctx.answerCbQuery("This game has ended.");

    const player = session.players.find((p) => p.id === ctx.from.id && p.alive);
    if (!player) return ctx.answerCbQuery("You're not alive in this game.");

    // Prevent re-submission
    if (session.choices.has(ctx.from.id)) {
      return ctx.answerCbQuery("Your work order is already filed.", { show_alert: false });
    }

    session.choices.set(ctx.from.id, choice);
    await ctx.answerCbQuery("✅ Work order filed!");

    const aliveCount    = session.players.filter((p) => p.alive).length;
    const receivedCount = session.choices.size;
    const choiceLabel   = getChoiceLabel(choice);

    // Edit DM to show locked-in confirmation
    try {
      await ctx.editMessageCaption(
        buildChoiceConfirmation(player.name, choiceLabel, receivedCount, aliveCount),
        { parse_mode: "HTML" }
      );
    } catch (_) {}

    // Mystery update in group (no spoilers)
    await bot.telegram.sendMessage(
      session.chatId,
      `📬 <b>${escapeHtml(player.name)}</b> submitted their work order. (${receivedCount}/${aliveCount} received)`,
      { parse_mode: "HTML" }
    ).catch(() => {});

    // If all alive players have submitted, settle immediately
    if (receivedCount >= aliveCount) {
      await bot.telegram.sendMessage(
        session.chatId,
        "⚡ <b>All work orders received!</b> Lloyd is tallying results...",
        { parse_mode: "HTML" }
      ).catch(() => {});
      triggerSettle(bot, session);
    }
  });
}