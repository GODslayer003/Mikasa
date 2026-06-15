import { User } from "../models/User.js";

export function registerKarma(bot) {
  bot.command("karma", async (ctx) => {
    try {
      if (!ctx.message || !ctx.from) return;

      const isReply = ctx.message.reply_to_message;
      const targetId = isReply
        ? ctx.message.reply_to_message.from.id
        : ctx.from.id;
      const targetName = isReply
        ? (ctx.message.reply_to_message.from.first_name || "User")
        : (ctx.from.first_name || "User");

      let user = await User.findOne({ telegramId: targetId });
      if (!user) {
        await ctx.reply(
          `<a href="tg://user?id=${targetId}">${targetName}</a> — <b>0</b> Karma\n` +
          `Rank <b>#-</b>\n` +
          `— Sylus 🖤`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
        return;
      }

      const rep = typeof user.reputation === "number" ? user.reputation : 0;
      const rank = await User.countDocuments({ reputation: { $gt: rep } }) + 1;
      const total = await User.countDocuments({});

      await ctx.reply(
        `<a href="tg://user?id=${targetId}">${targetName}</a> — <b>${rep}</b> Karma\n` +
        `Rank <b>#${rank}</b> of <b>${total}</b>\n` +
        `— Sylus 🖤`,
        {
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        }
      );
    } catch (err) {
      console.error("KARMA COMMAND ERROR:", err);
    }
  });

  bot.command("ktop", async (ctx) => {
    try {
      if (!ctx.message) return;

      const leaders = await User.find({})
        .sort({ reputation: -1 })
        .limit(3)
        .lean();

      if (leaders.length === 0) {
        await ctx.reply(
          `No karma records yet, darling~ Give it time.\n— Sylus 🖤`,
          { reply_to_message_id: ctx.message.message_id }
        );
        return;
      }

      const medals = ["🥇", "🥈", "🥉"];
      const lines = leaders.map((u, i) => {
        const name = u.firstName || "User";
        const rep = typeof u.reputation === "number" ? u.reputation : 0;
        return `${medals[i]} <b>${i + 1}.</b> <a href="tg://user?id=${u.telegramId}">${name}</a> — <b>${rep}</b> Karma`;
      });

      await ctx.reply(
        `🖤 <b>Karma Leaderboard</b>\n` +
        `${lines.join("\n")}\n` +
        `— Sylus 🖤`,
        {
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        }
      );
    } catch (err) {
      console.error("KTOP COMMAND ERROR:", err);
    }
  });
}
