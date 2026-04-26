// src/commands/topper.js
import { User } from "../models/User.js";

const ALLOWED_TOPPERS = [
  "ThyMonster",
  "RiverSung",
  "ThyFang",
  "ThyDivine",
  "ThyDemise"
];

export function topperCommand(bot) {
  bot.command("topper", async (ctx) => {
    try {
      if (!ctx.from?.username || !ALLOWED_TOPPERS.includes(ctx.from.username)) {
        return ctx.reply("🚫 You are not authorized to use this command.", {
          reply_to_message_id: ctx.message.message_id
        });
      }

      const topUsers = await User.find({})
        .sort({ balance: -1 })
        .limit(5);

      if (!topUsers.length) {
        return ctx.reply("No data available.", {
          reply_to_message_id: ctx.message.message_id
        });
      }

      let text = "👑 <b>TOP 5 RICHEST PLAYERS (MOON COINS)</b> 👑\n\n";

      topUsers.forEach((u, i) => {
        const mention = `<a href="tg://user?id=${u.telegramId}">${u.firstName || "Unknown"}</a>`;
        text +=
          `${i + 1}. ${mention}\n` +
          `🌙 <b>${u.balance.toLocaleString()}</b> Moon Coins\n\n`;
      });

      await ctx.reply(text, {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message.message_id
      });

    } catch (err) {
      console.error("Topper error:", err);
      await ctx.reply("⚠️ Unable to fetch leaderboard.", {
        reply_to_message_id: ctx.message.message_id
      });
    }
  });
}