// src/commands/immune.js
import { User } from "../models/User.js";
import { hasMinMembers } from "../utils/group.js";

export function immuneCommand(bot) {
  bot.command("immune", async (ctx) => {
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
          `«This battlefield is too small for my protection. Find a larger group [20+ members].»\n` +
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

      // Already immune
      if (user.immuneUntil > now) {
        const leftSeconds = user.immuneUntil - now;
        const hours = Math.floor(leftSeconds / 3600);
        const minutes = Math.floor((leftSeconds % 3600) / 60);
        
        const timeLeft = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        return ctx.reply(
          `🛡️ <b>IMMUNITY ACTIVE</b>\n\n` +
          `${mention}, you're already protected. Don't be reckless.\n` +
          `⏱️ Time left: <b>${timeLeft}</b>\n\n` +
          `«I've already told you, you're safe. Stop being so stubborn.»\n` +
          `— Mikasa`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      // Cooldown (from unleash)
      if (user.immuneCooldownUntil > now) {
        const left = Math.ceil((user.immuneCooldownUntil - now) / 60);
        return ctx.reply(
          `⏳ <b>Immunity Restricted</b>\n\n` +
          `${mention}, you just unleashed your spirit. You need to rest.\n` +
          `⏱️ Wait: <b>${left} min</b>\n\n` +
          `«Take a breath. The battlefield will still be there.»\n` +
          `— Mikasa`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      // Random duration: 2-10 hours
      const randomHours = Math.floor(Math.random() * (10 - 2 + 1)) + 2;
      const durationSeconds = randomHours * 3600;

      // Grant immunity
      user.immuneUntil = now + durationSeconds;
      await user.save();

      await ctx.reply(
        `🛡️ <b>IMMUNITY ACTIVATED</b>\n\n` +
        `${mention}, I'll protect you.\n\n` +
        `⚔️ You cannot use /tatakae\n` +
        `🎯 Others cannot attack you\n` +
        `⏱️ Duration: <b>${randomHours} hours</b>\n\n` +
        `«The world is cruel, but I will be there to protect you.»\n` +
        `— Mikasa`,
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