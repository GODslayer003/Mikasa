import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Markup } from "telegraf";
import { User } from "../models/User.js";
import { LEVELS } from "../game/levels.js";
import { hasMinMembers } from "../utils/group.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STARTING_RP = 1000;
const MAX_HP = 100;
const WORKER_COOLDOWN = 30 * 60;
const SCAM_COOLDOWN = 5 * 60;
const BONUS_ENTRY_FEE = 100;

const RANKS = [
  ["Frontera Baron", 50000],
  ["Master Builder", 20000],
  ["Foreman", 5000],
  ["Elite Shoveler", 1000],
  ["Novice Digger", 0]
];

const WORKER_RP = { LOW: 2, MID: 5, TOP: 12, LEGEND: 25, ULTRA: 50 };
const WORKER_POWER = { LOW: 10, MID: 20, TOP: 40, LEGEND: 70, ULTRA: 100 };
const TACTIC_BEATS = {
  aggressive: "deceptive",
  defensive: "aggressive",
  deceptive: "defensive"
};

const scamSessions = new Map();
const gallerySessions = new Map();
const bonusSessions = new Map();

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
  if (typeof user.rp === "number") return Math.max(0, Math.floor(user.rp));
  if (typeof user.moons === "number") return Math.max(0, Math.floor(user.moons));
  if (typeof user.balance === "number") return Math.max(0, Math.floor(user.balance));
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

function workerClass(level) {
  if (level === "TOP") return "GUARD";
  if (level === "LEGEND" || level === "ULTRA") return "BUILDER";
  return "MINER";
}

function normalizeWorkers(user) {
  if (!Array.isArray(user.shadows)) user.shadows = [];
  for (const worker of user.shadows) {
    if (!worker.class) worker.class = workerClass(worker.level);
    if (typeof worker.scamUses !== "number") worker.scamUses = 0;
    if (typeof worker.alive !== "boolean") worker.alive = true;
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

function workerBreakdown(workers) {
  const counts = { MINER: 0, GUARD: 0, BUILDER: 0 };
  for (const worker of workers) counts[worker.class || workerClass(worker.level)]++;
  return counts;
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

async function runBonusRound(bot, session) {
  if (session.finished) return;
  const alive = session.players.filter((player) => player.alive);
  if (alive.length <= 1) return finishBonus(bot, session, alive[0] || null, "sudden");
  if (session.round > 5) return finishBonus(bot, session, null, "score");

  session.choices = new Map();
  const isLullaby = session.round === 3;
  const prompt = isLullaby
    ? `<b>Round 3: Lloyd's Concert</b>\n\nChoose fast. Mercy is not in the budget.`
    : `<b>Round ${session.round}: Frontera Bonus</b>\n\nShare, embezzle, or snitch. Lloyd is watching the math.`;

  await bot.telegram.sendMessage(session.chatId, prompt, { parse_mode: "HTML" });

  for (const player of alive) {
    const buttons = isLullaby
      ? [
          Markup.button.callback("Buy Earplugs", `bonus:choice:${session.id}:earplugs`),
          Markup.button.callback("Endure", `bonus:choice:${session.id}:endure`),
          Markup.button.callback("Push", `bonus:choice:${session.id}:push`)
        ]
      : [
          Markup.button.callback("Share", `bonus:choice:${session.id}:share`),
          Markup.button.callback("Embezzle", `bonus:choice:${session.id}:embezzle`),
          Markup.button.callback("Snitch", `bonus:choice:${session.id}:snitch`)
        ];
    try {
      await bot.telegram.sendMessage(player.id, prompt, Markup.inlineKeyboard(buttons, { columns: 1 }));
    } catch {
      await bot.telegram.sendMessage(session.chatId, `${mention(player.id, player.name)} start me in DM first. I need to whisper your secret moves.`, { parse_mode: "HTML" });
    }
  }

  setTimeout(() => settleBonusRound(bot, session.id), 15 * 1000);
}

async function settleBonusRound(bot, sessionId) {
  const session = bonusSessions.get(sessionId);
  if (!session || session.finished) return;

  const alive = session.players.filter((player) => player.alive);
  const isLullaby = session.round === 3;
  const lines = [`<b>Round ${session.round} Results</b>`];

  if (isLullaby) {
    for (const player of alive) {
      const choice = session.choices.get(player.id) || "endure";
      if (choice === "earplugs") {
        player.stash = Math.max(0, player.stash - 300);
        lines.push(`${mention(player.id, player.name)} bought earplugs. -300 RP, no damage.`);
      } else if (choice === "push") {
        const targets = alive.filter((p) => p.id !== player.id && p.alive);
        const target = targets[Math.floor(Math.random() * targets.length)];
        if (!target) {
          player.hp -= 50;
          lines.push(`${mention(player.id, player.name)} tried to push nobody and endured the concert.`);
        } else if ((session.choices.get(target.id) || "endure") === "earplugs") {
          player.hp = 0;
          lines.push(`${mention(player.id, player.name)} pushed ${mention(target.id, target.name)}. Earplugs reflected the disaster.`);
        } else {
          target.hp = 0;
          lines.push(`${mention(player.id, player.name)} pushed ${mention(target.id, target.name)} into the front row.`);
        }
      } else {
        player.hp -= 50;
        lines.push(`${mention(player.id, player.name)} endured Lloyd's voice. -50 HP.`);
      }
    }
  } else {
    const choices = alive.map((player) => ({ player, choice: session.choices.get(player.id) || "share" }));
    const embezzlers = choices.filter((item) => item.choice === "embezzle");
    const snitches = choices.filter((item) => item.choice === "snitch");

    if (!embezzlers.length && !snitches.length) {
      const share = Math.floor(1000 / alive.length);
      alive.forEach((player) => (player.stash += share));
      lines.push(`Everyone shared. Each survivor gains ${share} RP.`);
    } else if (embezzlers.length === 1 && !snitches.length) {
      embezzlers[0].player.stash += 1000;
      lines.push(`${mention(embezzlers[0].player.id, embezzlers[0].player.name)} embezzled the full 1000 RP.`);
    } else if (embezzlers.length > 1 && !snitches.length) {
      embezzlers.forEach(({ player }) => (player.hp -= 30));
      lines.push(`Multiple embezzlers collided. Each takes -30 HP.`);
    } else if (embezzlers.length && snitches.length) {
      embezzlers.forEach(({ player }) => (player.hp -= 60));
      snitches.forEach(({ player }) => (player.stash += 500));
      lines.push(`Snitches caught the theft. Embezzlers take -60 HP; snitches gain 500 RP.`);
    } else {
      lines.push(`Snitches found no crime. Lloyd writes "dramatic, unprofitable" in the margin.`);
    }
  }

  for (const player of alive) {
    if (player.hp <= 0 && player.alive) {
      player.alive = false;
      const user = await User.findOne({ telegramId: player.id });
      if (user) {
        user.bonusEliminations = (user.bonusEliminations || 0) + 1;
        await user.save();
      }
      lines.push(`${mention(player.id, player.name)} has been fired.`);
    }
  }

  await bot.telegram.sendMessage(session.chatId, lines.join("\n"), { parse_mode: "HTML" });
  session.round += 1;
  setTimeout(() => runBonusRound(bot, session), 4000);
}

async function finishBonus(bot, session, suddenWinner, mode) {
  if (session.finished) return;
  session.finished = true;
  bonusSessions.delete(session.id);

  const survivors = session.players.filter((player) => player.alive);
  let winner = suddenWinner;
  if (!winner && mode === "score" && survivors.length) {
    winner = [...survivors].sort((a, b) => b.stash - a.stash)[0];
  }

  if (!winner) {
    await bot.telegram.sendMessage(session.chatId, `<b>Total Wipe</b>\n\nLloyd keeps the money. "This is why I handle my own finances."`, { parse_mode: "HTML" });
  } else {
    const payout = winner.stash + session.prizePot;
    const user = await User.findOne({ telegramId: winner.id });
    if (user) {
      setRp(user, getRp(user) + payout);
      user.bonusWins = (user.bonusWins || 0) + 1;
      await user.save();
    }
    await bot.telegram.sendMessage(session.chatId, `<b>Frontera Bonus Winner</b>\n\n${mention(winner.id, winner.name)} wins <b>${payout.toLocaleString()} RP</b>.\n\n<i>Lloyd: "Water is good. Profit is better. Today, you are both."</i>`, { parse_mode: "HTML" });
  }

  for (const player of session.players) {
    const user = await User.findOne({ telegramId: player.id });
    if (!user) continue;
    user.bonusGamesPlayed = (user.bonusGamesPlayed || 0) + 1;
    if (!winner || player.id !== winner.id) user.bonusLosses = (user.bonusLosses || 0) + 1;
    if (player.alive && player.stash > 0) setRp(user, getRp(user) + player.stash);
    await user.save();
  }
}

export function estateCommand(bot) {
  bot.command(["profile", "stats"], async (ctx) => {
    return ctx.reply("The old personnel forms were shredded. Use /rank for the Frontera estate profile.", {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command("immune", async (ctx) => {
    return ctx.reply("Mikasa's immunity desk is closed. Use /javier to summon Javier Asrahan.", {
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

  bot.command(["arisers", "shadow"], async (ctx) => {
    return ctx.reply("The old shadow roster is now the estate workforce. Use /workers.", {
      reply_to_message_id: ctx.message?.message_id
    });
  });

  bot.command("rank", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    const workers = normalizeWorkers(user);
    const counts = workerBreakdown(workers);
    const games = (user.bonusWins || 0) + (user.bonusLosses || 0);
    await user.save();

    return ctx.reply(
      `<b>Frontera Estate Profile</b>\n\n` +
        `Name: ${mention(ctx.from.id, ctx.from.first_name)}\n` +
        `Username: ${ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : "Not set"}\n` +
        `RP Balance: <b>${getRp(user).toLocaleString()} RP</b>\n` +
        `Rank Tier: <b>${rankForRp(getRp(user))}</b>\n` +
        `HP: <b>${Math.max(0, user.hp || MAX_HP)}/100</b>\n\n` +
        `Workers: <b>${workers.length}</b>\n` +
        `MINER: ${counts.MINER} | GUARD: ${counts.GUARD} | BUILDER: ${counts.BUILDER}\n\n` +
        `Game Stats: ${user.bonusWins || 0} wins, ${user.bonusLosses || 0} losses, ${games} played\n\n` +
        `<i>Lloyd: "A good estate begins with a brutally honest balance sheet."</i>`,
      { parse_mode: "HTML", reply_to_message_id: ctx.message?.message_id }
    );
  });

  bot.command("collect", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    if ((user.workerMorale || 0) <= 0) {
      return ctx.reply(`Your workers are on strike. Use /lullaby first.`, { reply_to_message_id: ctx.message?.message_id });
    }

    const now = nowSeconds();
    const elapsedHours = Math.min(24, Math.max(0, (now - (user.lastCollectedAt || now)) / 3600));
    const production = normalizeWorkers(user)
      .filter((worker) => worker.alive !== false)
      .reduce((sum, worker) => sum + (WORKER_RP[worker.level] || 0), 0);
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
      return ctx.reply(`Your workers are already terrified enough. They're working fine.`, { reply_to_message_id: ctx.message?.message_id });
    }
    user.workerMorale = 100;
    user.lastCollectedAt = nowSeconds();
    await user.save();
    return ctx.reply(`Lloyd sings one note. The estate freezes. By the second note, every worker is back at their post out of pure fear. Morale restored to 100.`, { reply_to_message_id: ctx.message?.message_id });
  });

  bot.command("gg", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    const top = await User.find({ bonusWins: { $gt: 0 } }).sort({ bonusWins: -1, rp: -1 }).limit(5);
    const board = top.length
      ? top.map((u, i) => `${i + 1}. ${escapeHtml(u.firstName || "Worker")} - ${u.bonusWins || 0} wins`).join("\n")
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
    return ctx.reply(`Javier stands beside you, eyes scanning the crowd. Nobody dares to move.\n\nProtection: ${hours} hours.`, { reply_to_message_id: ctx.message?.message_id });
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
    return ctx.reply(`Javier steps aside. You are now vulnerable. Choose your battles wisely.\n\n/javier cooldown: ${minutes} minutes.`, { reply_to_message_id: ctx.message?.message_id });
  });

  bot.command("worker", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    const now = nowSeconds();
    if (now - (user.lastAriseAt || 0) < WORKER_COOLDOWN) {
      return ctx.reply(`Lloyd's hiring desk is cooling down. Come back in ${formatTime(WORKER_COOLDOWN - (now - user.lastAriseAt))}.`, { reply_to_message_id: ctx.message?.message_id });
    }
    if (Math.random() * 100 < 25) {
      user.lastAriseAt = now;
      await user.save();
      return ctx.reply(`The recruitment pit is empty. Lloyd bills you for the paperwork anyway.`, { reply_to_message_id: ctx.message?.message_id });
    }

    const levelKey = rollLevel();
    const imagePath = randomWorkerImage(levelKey);
    if (!imagePath) return ctx.reply(`No worker assets found for ${LEVELS[levelKey].label}.`, { reply_to_message_id: ctx.message?.message_id });

    const worker = {
      name: path.parse(imagePath).name,
      level: levelKey,
      class: workerClass(levelKey),
      power: LEVELS[levelKey].power,
      stars: LEVELS[levelKey].stars,
      imagePath,
      scamUses: 0,
      alive: true
    };
    user.shadows.push(worker);
    user.totalStars = (user.totalStars || 0) + worker.stars;
    user.totalPower = (user.totalPower || 0) + worker.power;
    user.lastAriseAt = now;
    await user.save();

    return ctx.replyWithPhoto(
      { source: imagePath },
      {
        caption:
          `<b>Worker Contract Signed</b>\n\n` +
          `Name: <b>${escapeHtml(worker.name)}</b>\n` +
          `Tier: <b>${LEVELS[levelKey].label}</b>\n` +
          `Class: <b>${worker.class}</b>\n` +
          `Passive RP: <b>${WORKER_RP[levelKey]} RP/hr</b>\n\n` +
          `<i>Lloyd: "Water is good. Cheap labor is also good."</i>`,
        parse_mode: "HTML",
        reply_to_message_id: ctx.message?.message_id
      }
    );
  });

  bot.command("workers", async (ctx) => {
    const user = await ensureEstateUser(ctx.from);
    const workers = normalizeWorkers(user);
    await user.save();
    if (!workers.length) return ctx.reply("You have no workers, Baron. Use /worker to summon your first one.", { reply_to_message_id: ctx.message?.message_id });
    const id = `${ctx.from.id}:${Date.now().toString(36)}`;
    gallerySessions.set(id, { userId: ctx.from.id, index: 0 });
    const worker = workers[0];
    return ctx.replyWithPhoto(
      { source: worker.imagePath },
      {
        caption:
          `<b>${escapeHtml(worker.name)}</b>\n\nTier: ${worker.level}\nClass: ${worker.class}\nPassive RP/hr: ${WORKER_RP[worker.level] || 0}\nUsed in scam battle: ${worker.scamUses || 0} times\n\n1/${workers.length}`,
        parse_mode: "HTML",
        reply_to_message_id: ctx.message?.message_id,
        ...Markup.inlineKeyboard([
          Markup.button.callback("<", `workers:prev:${id}`),
          Markup.button.callback("Explore", `workers:all:${id}`),
          Markup.button.callback(">", `workers:next:${id}`)
        ])
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
    const target = await User.findOne({ telegramId: targetTelegram.id });
    if (!target?.estateStarted) return ctx.reply("Target must use /start first.", { reply_to_message_id: ctx.message?.message_id });

    const now = nowSeconds();
    if ((attacker.javierProtectionUntil || attacker.immuneUntil || 0) > now) return ctx.reply("Protected players cannot attack. Javier did not sign up for hypocrisy.", { reply_to_message_id: ctx.message?.message_id });
    if ((target.javierProtectionUntil || target.immuneUntil || 0) > now) return ctx.reply("Javier is guarding the target. Put the shovel down.", { reply_to_message_id: ctx.message?.message_id });
    if ((attacker.lastTatakaeAt || 0) + 60 > now) return ctx.reply(`Your shovel arm needs ${formatTime(attacker.lastTatakaeAt + 60 - now)}.`, { reply_to_message_id: ctx.message?.message_id });

    const damage = Math.floor(Math.random() * 10) + 6;
    target.hp = Math.max(0, (target.hp || MAX_HP) - damage);
    attacker.lastTatakaeAt = now;
    attacker.totalAttacks = (attacker.totalAttacks || 0) + 1;
    if (target.hp <= 0) {
      target.defeatedAt = now;
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
    const defender = await User.findOne({ telegramId: defenderTelegram.id });
    if (!defender?.estateStarted) return ctx.reply("Target must use /start first.", { reply_to_message_id: ctx.message?.message_id });
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
        ...Markup.inlineKeyboard(options.map(({ worker, index }) => [Markup.button.callback(`${worker.name} (${worker.level})`, `scam:aw:${id}:${index}`)]))
      }
    );
  });

  bot.command("bonus", async (ctx) => {
    if (!ctx.chat || ctx.chat.type === "private") return ctx.reply("The Frontera Bonus is group only.", { reply_to_message_id: ctx.message?.message_id });
    const existing = [...bonusSessions.values()].find((session) => session.chatId === ctx.chat.id && !session.finished);
    if (existing) return ctx.reply("A Frontera Bonus lobby is already open here.", { reply_to_message_id: ctx.message?.message_id });
    const id = Date.now().toString(36);
    const session = {
      id,
      chatId: ctx.chat.id,
      players: [],
      prizePot: 0,
      round: 1,
      choices: new Map(),
      finished: false,
      timer: null
    };
    bonusSessions.set(id, session);
    session.timer = setTimeout(() => {
      if (session.players.length >= 3) runBonusRound(bot, session);
      else {
        bonusSessions.delete(id);
        bot.telegram.sendMessage(session.chatId, "Lobby closed. Lloyd refuses to run a psychological finance disaster for fewer than 3 players.");
      }
    }, 60 * 1000);
    return ctx.reply(
      `<b>The Frontera Bonus</b>\n\nEntry fee: 100 RP\nPlayers: 0/8\nTimer: 60s`,
      {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message?.message_id,
        ...Markup.inlineKeyboard([Markup.button.callback("Join", `bonus:join:${id}`)])
      }
    );
  });

  bot.command("fstart", async (ctx) => {
    const session = [...bonusSessions.values()].find((item) => item.chatId === ctx.chat.id && !item.finished);
    if (!session) return ctx.reply("No active Frontera Bonus lobby.", { reply_to_message_id: ctx.message?.message_id });
    if (session.players.length < 3) return ctx.reply("Need at least 3 players.", { reply_to_message_id: ctx.message?.message_id });
    clearTimeout(session.timer);
    return runBonusRound(bot, session);
  });

  bot.command(["timeplus", "timeminus"], async (ctx) => {
    return ctx.reply("Lobby timer controls are acknowledged. Use /fstart when 3+ players are ready.", { reply_to_message_id: ctx.message?.message_id });
  });

  bot.action(/^shop:(.+)$/, async (ctx) => {
    const key = ctx.match[1];
    const items = {
      safety_helmet: ["Safety Helmet", 500],
      morale_boost: ["Morale Boost", 200],
      scam_permit: ["Scam Permit", 300],
      javier_pass: ["Javier Pass", 1000]
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

  bot.action(/^workers:(prev|next|all):(.+)$/, async (ctx) => {
    const action = ctx.match[1];
    const id = ctx.match[2];
    const session = gallerySessions.get(id);
    if (!session || session.userId !== ctx.from.id) return ctx.answerCbQuery("This gallery expired.");
    const user = await ensureEstateUser(ctx.from);
    const workers = normalizeWorkers(user);
    if (action === "all") {
      await ctx.answerCbQuery("Exploring.");
      const text = workers.map((w, i) => `${i + 1}. ${w.name} - ${w.level}/${w.class} - ${WORKER_RP[w.level] || 0} RP/hr`).join("\n");
      return ctx.reply(`<b>Estate Workforce</b>\n\n${escapeHtml(text)}`, { parse_mode: "HTML" });
    }
    session.index = action === "next"
      ? (session.index + 1) % workers.length
      : (session.index - 1 + workers.length) % workers.length;
    const worker = workers[session.index];
    await ctx.answerCbQuery();
    return ctx.editMessageMedia(
      { type: "photo", media: { source: worker.imagePath }, caption: `<b>${escapeHtml(worker.name)}</b>\n\nTier: ${worker.level}\nClass: ${worker.class}\nPassive RP/hr: ${WORKER_RP[worker.level] || 0}\nUsed in scam battle: ${worker.scamUses || 0} times\n\n${session.index + 1}/${workers.length}`, parse_mode: "HTML" },
      Markup.inlineKeyboard([
        Markup.button.callback("<", `workers:prev:${id}`),
        Markup.button.callback("Explore", `workers:all:${id}`),
        Markup.button.callback(">", `workers:next:${id}`)
      ])
    );
  });

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
          Markup.button.callback("Give Up", `scam:surrender:${session.id}`),
          Markup.button.callback("Deploy Worker", `scam:def:${session.id}`)
        ])
      }
    );
    setTimeout(() => resolveScam(ctx, session, "\nDefender did not respond. Auto surrender."), 30 * 1000);
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
    const options = topWorkers(defender);
    if (!options.length) return ctx.answerCbQuery("You have no workers.", { show_alert: true });
    await ctx.answerCbQuery("Choose a defender.");
    return ctx.reply(
      "Choose your defender.",
      Markup.inlineKeyboard(options.map(({ worker, index }) => [Markup.button.callback(`${worker.name} (${worker.level})`, `scam:dw:${session.id}:${index}`)]))
    );
  });

  bot.action(/^scam:dw:([^:]+):(\d+)$/, async (ctx) => {
    const session = scamSessions.get(ctx.match[1]);
    if (!session || session.defenderId !== ctx.from.id) return ctx.answerCbQuery("This defense is not yours.");
    session.defenderWorkerIndex = Number(ctx.match[2]);
    await ctx.answerCbQuery("Defender deployed.");
    const buttons = [
      Markup.button.callback("Aggressive", `scam:t:${session.id}:aggressive`),
      Markup.button.callback("Defensive", `scam:t:${session.id}:defensive`),
      Markup.button.callback("Deceptive", `scam:t:${session.id}:deceptive`)
    ];
    await ctx.telegram.sendMessage(session.attackerId, "Choose your secret tactic.", Markup.inlineKeyboard(buttons, { columns: 1 }));
    await ctx.telegram.sendMessage(session.defenderId, "Choose your secret tactic.", Markup.inlineKeyboard(buttons, { columns: 1 }));
    setTimeout(() => resolveScam(ctx, session, "\nTactic timer expired."), 15 * 1000);
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

  bot.action(/^bonus:join:(.+)$/, async (ctx) => {
    const session = bonusSessions.get(ctx.match[1]);
    if (!session || session.finished) return ctx.answerCbQuery("Lobby closed.");
    if (session.players.some((player) => player.id === ctx.from.id)) return ctx.answerCbQuery("Already joined.");
    if (session.players.length >= 8) return ctx.answerCbQuery("Lobby full.", { show_alert: true });
    const user = await ensureEstateUser(ctx.from);
    if (getRp(user) < BONUS_ENTRY_FEE) return ctx.answerCbQuery("Need 100 RP.", { show_alert: true });
    setRp(user, getRp(user) - BONUS_ENTRY_FEE);
    await user.save();
    session.prizePot += BONUS_ENTRY_FEE;
    session.players.push({ id: ctx.from.id, name: ctx.from.first_name || "Worker", hp: 100, stash: 0, alive: true });
    await ctx.answerCbQuery("Joined.");
    return ctx.editMessageText(
      `<b>The Frontera Bonus</b>\n\nEntry fee: 100 RP\nPlayers: ${session.players.length}/8\nPrize Pot: ${session.prizePot} RP`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([Markup.button.callback("Join", `bonus:join:${session.id}`)])
      }
    );
  });

  bot.action(/^bonus:choice:([^:]+):(.+)$/, async (ctx) => {
    const session = bonusSessions.get(ctx.match[1]);
    if (!session || session.finished) return ctx.answerCbQuery("Game closed.");
    const player = session.players.find((item) => item.id === ctx.from.id && item.alive);
    if (!player) return ctx.answerCbQuery("You are not alive in this game.");
    session.choices.set(ctx.from.id, ctx.match[2]);
    await ctx.answerCbQuery("Choice locked.");
  });
}
