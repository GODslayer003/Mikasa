// src/commands/unleash.js
import { User } from "../models/User.js";
import { hasMinMembers } from "../utils/group.js";

export function unleashCommand(bot) {
  bot.command("unleash", async (ctx) => {
    try {
      if (ctx.chat.type === "private") {
        return ctx.reply("⚠️ This command only works in groups!", {
          reply_to_message_id: ctx.message.message_id
        });
      }

      // Member count check (20+)
      if (!(await hasMinMembers(ctx, 20))) {
        return ctx.reply(
          `🛡️ <b>Field Too Small</b>\n\n` +
          `«This battlefield is too small for my attention. Find a larger group [20+ members].»\n` +
          `— Mikasa`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      const userId = ctx.from.id;
      const mention = `<a href="tg://user?id=${userId}">${ctx.from.first_name}</a>`;
      const now = Math.floor(Date.now() / 1000);

      let user = await User.findOne({ telegramId: userId });
      if (!user) {
        return ctx.reply("❌ Use /start first.", {
          reply_to_message_id: ctx.message.message_id
        });
      }

      // Check if actually immune
      if (!user.immuneUntil || user.immuneUntil <= now) {
        return ctx.reply(
          `❌ <b>No Immunity to Unleash</b>\n\n` +
          `${mention}, you are not currently under protection.\n\n` +
          `«You don't need to unleash what isn't there.»\n` +
          `— Mikasa`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      // Deactivate immunity
      user.immuneUntil = 0;

      // Random cooldown: 5-15 minutes
      const randomMinutes = Math.floor(Math.random() * (15 - 5 + 1)) + 5;
      const cooldownSeconds = randomMinutes * 60;
      user.immuneCooldownUntil = now + cooldownSeconds;

      await user.save();

      await ctx.reply(
        `⚔️ <b>SPIRIT UNLEASHED</b>\n\n` +
        `${mention} has dropped their protection and returned to the fray!\n\n` +
        `🔓 /tatakae is now active for you.\n` +
        `⏳ /immune restricted for <b>${randomMinutes} minutes</b>.\n\n` +
        `«If you don't fight, you can't win. TATAKAE!»\n` +
        `— Mikasa`,
        {
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        }
      );

    } catch (err) {
      console.error("Unleash error:", err);
      ctx.reply("⚠️ Something went wrong.", {
        reply_to_message_id: ctx.message.message_id
      });
    }
  });
}