// commands/duel.js
import { Duel } from "../models/Duel.js";
import { User } from "../models/User.js";
import { Markup } from "telegraf";
import crypto from "crypto";

export function duelCommand(bot) {
  bot.command("duel", async (ctx) => {
    if (!ctx.message.reply_to_message) {
      return ctx.reply("⚔️ Reply to someone to challenge them to a duel.");
    }

    const challengerId = ctx.from.id;
    const opponentId = ctx.message.reply_to_message.from.id;

    if (opponentId === challengerId || ctx.message.reply_to_message.from.is_bot) {
      return ctx.reply("❌ Invalid opponent.");
    }

    const challenger = await User.findOne({ telegramId: challengerId });
    const opponent = await User.findOne({ telegramId: opponentId });

    if (!challenger || !opponent) {
      return ctx.reply("❌ Both players must use /start.");
    }

    if (challenger.shadows.length === 0 || opponent.shadows.length === 0) {
      return ctx.reply("❌ Both players must have at least one character.");
    }

    const duelId = crypto.randomUUID();

    await Duel.create({
      duelId,
      challengerId,
      opponentId,
      createdAt: Math.floor(Date.now() / 1000)
    });

    await ctx.reply(
      `⚔️ <b>DUEL REQUEST</b>\n\n` +
      `👤 Challenger: ${ctx.from.first_name}\n` +
      `🎯 Opponent: ${ctx.message.reply_to_message.from.first_name}\n\n` +
      `💀 Loser loses their chosen character\n` +
      `💰 Winner gets 10,000 Moon Coins`,
      {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback("🔥 Accept Duel", `duel_accept:${duelId}`),
          Markup.button.callback("❌ Decline", `duel_decline:${duelId}`)
        ])
      }
    );
  });
}