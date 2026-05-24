import { User } from "../models/User.js";

const STARTING_RP = 1000;
const WORKER_RP = { LOW: 2, MID: 5, TOP: 12, LEGEND: 25, ULTRA: 50 };
const WORKER_SCORE = { LOW: 1, MID: 2, TOP: 3, LEGEND: 4, ULTRA: 5 };
const TIER_BALLS = { LOW: "⚪", MID: "🟢", TOP: "🔵", LEGEND: "🟣", ULTRA: "🔴" };

const RANKS = [
  ["Frontera Baron", 50000],
  ["Master Builder", 20000],
  ["Foreman", 5000],
  ["Elite Shoveler", 1000],
  ["Novice Digger", 0]
];


function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mention(userId, firstName = "Worker") {
  return `<a href="tg://user?id=${userId}">${escapeHtml(firstName)}</a>`;
}

function getRp(user) {
  // Prefer `balance` as the canonical stored amount since many flows update it.
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

function normalizeWorkers(user) {
  if (!Array.isArray(user.shadows)) user.shadows = [];
  return user.shadows;
}

function workerLevelScore(workers) {
  return workers.reduce((sum, worker) => sum + (WORKER_SCORE[worker.level] || 0), 0);
}

function productionRate(workers) {
  return workers.reduce((sum, worker) => sum + (WORKER_RP[worker.level] || 0), 0);
}

function powerLevel(workers) {
  return workers.reduce((sum, worker) => sum + (worker.power || 0), 0);
}

function tierLine(workers) {
  const counts = { LOW: 0, MID: 0, TOP: 0, LEGEND: 0, ULTRA: 0 };
  for (const worker of workers) {
    if (counts[worker.level] !== undefined) counts[worker.level]++;
  }
  return `${TIER_BALLS.LOW} ${counts.LOW}  ${TIER_BALLS.MID} ${counts.MID}  ${TIER_BALLS.TOP} ${counts.TOP}  ${TIER_BALLS.LEGEND} ${counts.LEGEND}  ${TIER_BALLS.ULTRA} ${counts.ULTRA}`;
}

async function ensureUser(telegramUser) {
  const now = Math.floor(Date.now() / 1000);
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
        firstName: telegramUser.first_name || null,
        username: telegramUser.username || null,
        rp: STARTING_RP,
        moons: STARTING_RP,
        balance: STARTING_RP,
        hp: 100,
        firstSeenAt: now,
        lastCollectedAt: now,
        workerMorale: 100
      }
    },
    { new: true, upsert: true }
  );

  if (typeof user.rp !== "number") setRp(user, getRp(user));
  if (!user.rpRank) user.rpRank = rankForRp(getRp(user));
  return user;
}

async function workerCountRank(userId, count) {
  const better = await User.countDocuments({
    $expr: { $gt: [{ $size: { $ifNull: ["$shadows", []] } }, count] }
  });
  return better + 1;
}

async function workerLevelRank(userId, score) {
  const users = await User.find({ shadows: { $exists: true } }, { telegramId: 1, shadows: 1 }).lean();
  const better = users.filter((user) => {
    const userScore = workerLevelScore(user.shadows || []);
    return user.telegramId !== userId && userScore > score;
  }).length;
  return better + 1;
}

export function profileCommand(bot) {
  bot.command("profile", async (ctx) => {
    try {
      const user = await ensureUser(ctx.from);
      const workers = normalizeWorkers(user);
      const workerCount = workers.length;
      const output = productionRate(workers);
      const power = powerLevel(workers);
      const score = workerLevelScore(workers);
      const countRank = await workerCountRank(ctx.from.id, workerCount);
      const levelRank = await workerLevelRank(ctx.from.id, score);
      await user.save();

      const scamWins = user.scamWins || 0;
      const scammed = user.scammedCount || 0;
      const scamLosses = user.scamLosses || 0;
      const scamDefenses = user.scamDefenses || 0;

      const caption =
        `<b>Frontera Personnel Ledger</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>Identity</b>\n` +
        `Name: ${mention(ctx.from.id, ctx.from.first_name)}\n` +
        `ID: <code>${ctx.from.id}</code>\n` +
        `Username: ${ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : "Not set"}\n\n` +
        `<b>Estate Tier</b>\n` +
        `RP Rank: <b>${rankForRp(getRp(user))}</b>\n` +
        `RP Balance: <b>${getRp(user).toLocaleString()} RP</b>\n\n` +
        `<b>Workforce</b>\n` +
        `Workers Total: <b>${workerCount}</b>\n` +
        `Production Efficiency: <b>${output} RP/hr</b>\n` +
        `Power Level: <b>${power}</b>\n` +
        `Worker Level Score: <b>${score}</b>\n` +
        `${tierLine(workers)}\n\n` +
        `<b>Scam Ledger</b>\n` +
        `Scammer: <b>${scamWins}</b> successful scams | <b>${scamLosses}</b> failed attacks\n` +
        `Scammed: <b>${scammed}</b> times | Defended: <b>${scamDefenses}</b>\n\n` +
        `<b>Rankings</b>\n` +
        `Worker Count Rank: <b>#${countRank}</b>\n` +
        `Worker Level Rank: <b>#${levelRank}</b>\n\n` +
        `<i>Lloyd: "This is not a profile. This is evidence of whether your estate deserves funding."</i>`;

      return ctx.reply(caption, {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message?.message_id
      });
    } catch (err) {
      console.error("Profile error:", err);
      return ctx.reply("Lloyd dropped the ledger. Try /profile again after the dust settles.", {
        reply_to_message_id: ctx.message?.message_id
      });
    }
  });
}
