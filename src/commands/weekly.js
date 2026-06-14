import { User } from "../models/User.js";
import { getDojkaQuote } from "../services/dojkaAssets.js";

const WEEKLY_REWARD = 800;
const COOLDOWN = 7 * 24 * 60 * 60;

export function weeklyCommand(bot) {
  bot.command("weekly", async (ctx) => {
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
          lastWeeklyAt: 0,
          firstSeenAt: now,
          lastSeenAt: now
        });
      }

      if (typeof user.stars !== "number") user.stars = 0;
      if (!user.lastWeeklyAt) user.lastWeeklyAt = 0;

      const elapsed = now - user.lastWeeklyAt;
      if (elapsed < COOLDOWN) {
        const remaining = COOLDOWN - elapsed;
        const d = Math.floor(remaining / 86400);
        const h = Math.floor((remaining % 86400) / 3600);
        return ctx.reply(
          `⏳ <b>Weekly Reward — Cooldown</b>\n\n` +
          `Come back in <b>${d}d ${h}h</b>.\n\n` +
          `«${getDojkaQuote()}»`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      user.stars += WEEKLY_REWARD;
      user.lastWeeklyAt = now;
      user.lastSeenAt = now;
      await user.save();

      await ctx.reply(
        `⭐ <b>Weekly Reward Collected</b>\n\n` +
        `+${WEEKLY_REWARD} ⭐ Stars\n` +
        `───\n` +
        `Balance: <b>${user.stars}</b> ⭐\n\n` +
        `«A constellation's worth is measured by their probability. And their stars.»\n` +
        `— Kim Dojka`,
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    } catch (err) {
      console.error("WEEKLY ERROR:", err);
    }
  });
}
