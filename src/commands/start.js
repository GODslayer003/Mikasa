import { User } from "../models/User.js";

const STARTING_RP = 1000;

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mention(user) {
  return `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name || "Worker")}</a>`;
}

export function startCommand(bot) {
  bot.start(async (ctx) => {
    const now = Math.floor(Date.now() / 1000);
    const existing = await User.findOne({ telegramId: ctx.from.id });

    if (existing?.estateStarted) {
      existing.username = ctx.from.username || null;
      existing.firstName = ctx.from.first_name || null;
      if (typeof existing.rp !== "number") existing.rp = existing.moons ?? existing.balance ?? STARTING_RP;
      if (!existing.rpRank) existing.rpRank = "Novice Digger";
      if (typeof existing.workerMorale !== "number") existing.workerMorale = 100;
      if (!existing.lastCollectedAt) existing.lastCollectedAt = now;
      await existing.save();

      return ctx.reply("You're already registered, worker. Get back to digging.", {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const payload = {
      telegramId: ctx.from.id,
      username: ctx.from.username || null,
      firstName: ctx.from.first_name || null,
      rp: STARTING_RP,
      estateStarted: true,
      moons: STARTING_RP,
      balance: STARTING_RP,
      hp: 100,
      rpRank: "Novice Digger",
      workerMorale: 100,
      lastCollectedAt: now,
      firstSeenAt: now,
      lastSeenAt: now
    };

    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
    } else {
      await User.create(payload);
    }

    return ctx.reply(
      `<b>Welcome to the Frontera Estate, ${mention(ctx.from)}.</b>\n\n` +
        `I am Lloyd Frontera, and this is not charity. You begin with <b>1,000 RP</b>, 100 HP, and the rank of <b>Novice Digger</b>.\n\n` +
        `Use /worker to hire labor, /collect to claim passive RP, /rank to inspect your ledger, and /bonus when you are ready to learn how friendship collapses under proper financial pressure.\n\n` +
        `<i>Water is good. Lloyd is water. Lloyd is good. Now dig.</i>`,
      {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message?.message_id
      }
    );
  });
}
