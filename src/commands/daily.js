import { User } from "../models/User.js";
import { getDojkaQuote } from "../services/dojkaAssets.js";

const DAILY_REWARD = 100;
const COOLDOWN = 24 * 60 * 60;

export function dailyCommand(bot) {
  bot.command("daily", async (ctx) => {
    try {
      if (!ctx.from || !ctx.message) return;

      const now = Math.floor(Date.now() / 1000);
      const userId = ctx.from.id;
      const firstName = ctx.from.first_name || "Incarnation";

      let user = await User.findOne({ telegramId: userId });

      if (!user) {
        user = await User.create({
          telegramId: userId,
          firstName,
          stars: 0,
          lastDailyAt: 0,
          firstSeenAt: now,
          lastSeenAt: now
        });
      }

      if (typeof user.stars !== "number") user.stars = 0;
      if (!user.lastDailyAt) user.lastDailyAt = 0;

      const elapsed = now - user.lastDailyAt;
      if (elapsed < COOLDOWN) {
        const remaining = COOLDOWN - elapsed;
        const h = Math.floor(remaining / 3600);
        const m = Math.ceil((remaining % 3600) / 60);
        return ctx.reply(
          `⏳ <b>Daily Reward — Cooldown</b>\n\n` +
          `Come back in <b>${h}h ${m}m</b>.\n\n` +
          `«${getDojkaQuote()}»`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      user.stars += DAILY_REWARD;
      user.lastDailyAt = now;
      user.lastSeenAt = now;
      await user.save();

      await ctx.reply(
        `⭐ <b>Daily Reward Collected</b>\n\n` +
        `+${DAILY_REWARD} ⭐ Stars\n` +
        `───\n` +
        `Balance: <b>${user.stars}</b> ⭐\n\n` +
        `«A day is a chapter. Claim what the Star Stream owes you.»\n` +
        `— Kim Dojka`,
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    } catch (err) {
      console.error("DAILY ERROR:", err);
    }
  });
}
