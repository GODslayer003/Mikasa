// src/commands/immune.js
import { User } from "../models/User.js";
import {
  IMMUNITY_DURATION,
  IMMUNITY_COOLDOWN
} from "../game/constants.js";

export function immuneCommand(bot) {
  bot.command("immune", async (ctx) => {
    try {
      if (ctx.chat.type === "private") {
        return ctx.reply("⚠️ This command only works in groups!", {
          reply_to_message_id: ctx.message.message_id
        });
      }

      const userId = ctx.from.id;
      const mention = `<a href="tg://user?id=${userId}">${ctx.from.first_name}</a>`;
      const now = Math.floor(Date.now() / 1000);

      const user = await User.findOne({ telegramId: userId });
      if (!user) {
        return ctx.reply("❌ Use /start first.", {
          reply_to_message_id: ctx.message.message_id
        });
      }

      // Already immune
      if (user.immuneUntil > now) {
        const left = Math.ceil((user.immuneUntil - now) / 60);
        return ctx.reply(
          `🛡️ <b>IMMUNITY ACTIVE</b>\n\n` +
          `${mention}, Gun has you covered.\n` +
          `⏱️ Time left: <b>${left} min</b>`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      // Cooldown
      if (user.immuneCooldownUntil > now) {
        const left = Math.ceil((user.immuneCooldownUntil - now) / 60);
        return ctx.reply(
          `⏳ ${mention}, Gun exhales smoke.\n` +
          `"Wait <b>${left}</b> minutes."`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      // Grant immunity
      user.immuneUntil = now + IMMUNITY_DURATION;
      user.immuneCooldownUntil = user.immuneUntil + IMMUNITY_COOLDOWN;
      await user.save();

      await ctx.reply(
        `🛡️ <b>IMMUNITY ACTIVATED</b>\n\n` +
        `${mention}, Gun says:\n` +
        `"For one hour, no one touches you."\n\n` +
        `⏱️ Duration: <b>1 hour</b>\n` +
        `❌ You cannot loot others while immune`,
        {
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        }
      );

    } catch (err) {
      console.error("Immune error:", err);
      ctx.reply("⚠️ Something went wrong.", {
        reply_to_message_id: ctx.message.message_id
      });
    }
  });
}