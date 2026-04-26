// src/commands/loot.js
import { User } from "../models/User.js";
import { LOOT_COOLDOWN } from "../game/constants.js";

export function lootCommand(bot) {
  bot.command("loot", async (ctx) => {
    try {
      if (ctx.chat.type === "private") {
        return ctx.reply("⚠️ Looting only works in groups.", {
          reply_to_message_id: ctx.message.message_id
        });
      }

      if (!ctx.message.reply_to_message) {
        return ctx.reply("🎯 Reply to someone to loot them.", {
          reply_to_message_id: ctx.message.message_id
        });
      }

      const attackerId = ctx.from.id;
      const attackerMention = `<a href="tg://user?id=${attackerId}">${ctx.from.first_name}</a>`;
      const victimUser = ctx.message.reply_to_message.from;

      if (victimUser.is_bot) {
        return ctx.reply("🤖 Bots have no pockets.", {
          reply_to_message_id: ctx.message.message_id
        });
      }

      if (victimUser.id === attackerId) {
        return ctx.reply("🤡 You can’t loot yourself.", {
          reply_to_message_id: ctx.message.message_id
        });
      }

      const victimMention = `<a href="tg://user?id=${victimUser.id}">${victimUser.first_name}</a>`;
      const now = Math.floor(Date.now() / 1000);

      const attacker = await User.findOne({ telegramId: attackerId });
      const target = await User.findOne({ telegramId: victimUser.id });

      if (!attacker || !target) {
        return ctx.reply("❌ Both users must use /start first.", {
          reply_to_message_id: ctx.message.message_id
        });
      }

      // Immune checks
      if (attacker.immuneUntil > now) {
        return ctx.reply(
          `🛡️ ${attackerMention}, Gun blocks you.\n"You can't loot while immune."`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      if (target.immuneUntil > now) {
        return ctx.reply(
          `🛡️ ${victimMention} is under Gun's protection.`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      // Cooldown
      if (attacker.lastLootAt + LOOT_COOLDOWN > now) {
        const left = Math.ceil((attacker.lastLootAt + LOOT_COOLDOWN - now) / 60);
        return ctx.reply(
          `⏳ ${attackerMention}, wait <b>${left} min</b> before looting again.`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      const success = Math.random() < 0.7;
      let caption;

      if (success) {
        let stolen = Math.floor(target.balance * (Math.random() * 0.1 + 0.05));
        stolen = Math.max(2000, Math.min(stolen, 50000, target.balance));

        target.balance -= stolen;
        attacker.balance += stolen;
        attacker.xp += 3;

        caption =
          `✅ <b>LOOT SUCCESSFUL</b>\n\n` +
          `🔫 ${attackerMention} robbed ${victimMention}\n\n` +
          `💰 Looted: <b>${stolen.toLocaleString()}</b> coins`;
      } else {
        const penalty = Math.min(
          Math.floor(Math.random() * 5000 + 3000),
          attacker.balance
        );

        attacker.balance -= penalty;
        attacker.xp += 1;

        caption =
          `💥 <b>LOOT FAILED</b>\n\n` +
          `🚬 Gun: "Sloppy."\n\n` +
          `💸 Penalty: <b>${penalty.toLocaleString()}</b> coins`;
      }

      attacker.lastLootAt = now;
      await attacker.save();
      await target.save();

      await ctx.reply(caption, {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message.message_id
      });

    } catch (err) {
      console.error("Loot error:", err);
      ctx.reply("⚠️ Something went wrong.", {
        reply_to_message_id: ctx.message.message_id
      });
    }
  });
}