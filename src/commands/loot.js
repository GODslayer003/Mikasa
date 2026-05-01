// src/commands/loot.js
import { User } from "../models/User.js";

const LOOT_FAIL_COOLDOWN = 5 * 60;
const STARTING_MOONS = 1000;

const SUCCESS_CAPTIONS = [
  "Mikasa moved first. The pouch was gone before anyone blinked.",
  "A clean strike. No wasted motion, no mercy from the battlefield.",
  "The raid was silent, precise, and painfully effective.",
  "One opening was enough. The Moons changed hands."
];

const FAIL_CAPTIONS = [
  "Mikasa caught the movement before the blade left its sheath.",
  "The attempt was read perfectly. Discipline beats greed.",
  "A careless step gave everything away.",
  "The raid collapsed before it began."
];

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mention(userId, firstName = "Soldier") {
  return `<a href="tg://user?id=${userId}">${escapeHtml(firstName)}</a>`;
}

function formatTime(seconds) {
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function getMoons(user) {
  if (typeof user.moons === "number") return Math.max(0, user.moons);
  if (typeof user.balance === "number") return Math.max(0, user.balance);
  return STARTING_MOONS;
}

function setMoons(user, amount) {
  const value = Math.max(0, Math.floor(amount));
  user.moons = value;
  user.balance = value;
}

function randomLootAmount(available) {
  if (available <= 0) return 0;
  if (available <= 10) return available;

  const min = 10;
  const max = available;
  const biasedRoll = Math.random() ** 2.8;
  return Math.min(max, Math.max(min, Math.floor(min + (max - min) * biasedRoll)));
}

async function ensureUser(telegramUser) {
  return User.findOneAndUpdate(
    { telegramId: telegramUser.id },
    {
      $set: {
        username: telegramUser.username || null,
        firstName: telegramUser.first_name || null
      },
      $setOnInsert: {
        telegramId: telegramUser.id,
        balance: STARTING_MOONS,
        moons: STARTING_MOONS,
        hp: 100
      }
    },
    { new: true, upsert: true }
  );
}

async function sendProfileResult(ctx, telegramUser, caption, replyId) {
  try {
    const photos = await ctx.telegram.getUserProfilePhotos(telegramUser.id, 0, 1);
    const fileId = photos?.photos?.[0]?.[0]?.file_id;

    if (fileId) {
      return ctx.replyWithPhoto(fileId, {
        caption,
        parse_mode: "HTML",
        reply_to_message_id: replyId
      });
    }
  } catch (err) {
    console.error("Loot profile photo error:", err);
  }

  return ctx.reply(caption, {
    parse_mode: "HTML",
    reply_to_message_id: replyId
  });
}

export function lootCommand(bot) {
  bot.command("loot", async (ctx) => {
    const replyId = ctx.message?.message_id;

    try {
      if (!ctx.chat || ctx.chat.type === "private") {
        return ctx.reply(
          "⚠️ <b>Group Only</b>\n\nLooting only works where witnesses can see it.",
          { parse_mode: "HTML", reply_to_message_id: replyId }
        );
      }

      if (!ctx.message?.reply_to_message?.from) {
        return ctx.reply(
          "🎯 <b>Choose a Target</b>\n\nReply to someone with <code>/loot</code>.",
          { parse_mode: "HTML", reply_to_message_id: replyId }
        );
      }

      const looterTelegram = ctx.from;
      const victimTelegram = ctx.message.reply_to_message.from;

      if (victimTelegram.is_bot) {
        return ctx.reply("🤖 Bots carry no Moons.", {
          reply_to_message_id: replyId
        });
      }

      if (victimTelegram.id === looterTelegram.id) {
        return ctx.reply("You cannot loot yourself. Mikasa is already judging that plan.", {
          reply_to_message_id: replyId
        });
      }

      const now = nowSeconds();
      const looter = await ensureUser(looterTelegram);
      const victim = await ensureUser(victimTelegram);
      const looterMention = mention(looterTelegram.id, looterTelegram.first_name);
      const victimMention = mention(victimTelegram.id, victimTelegram.first_name);

      if ((looter.immuneUntil || 0) > now) {
        return ctx.reply(
          `🛡️ ${looterMention}, you cannot loot while protected.`,
          { parse_mode: "HTML", reply_to_message_id: replyId }
        );
      }

      if ((victim.immuneUntil || 0) > now) {
        return ctx.reply(
          `🛡️ ${victimMention} is under protection. Stand down.`,
          { parse_mode: "HTML", reply_to_message_id: replyId }
        );
      }

      if ((looter.lastLootAt || 0) + LOOT_FAIL_COOLDOWN > now) {
        const remaining = looter.lastLootAt + LOOT_FAIL_COOLDOWN - now;
        return ctx.reply(
          `⏳ ${looterMention}, your failed raid is still on cooldown.\n` +
            `Try again in <b>${formatTime(remaining)}</b>.`,
          { parse_mode: "HTML", reply_to_message_id: replyId }
        );
      }

      const victimMoons = getMoons(victim);
      if (victimMoons <= 0) {
        return ctx.reply(
          `🌙 ${victimMention} has no Moons to loot.`,
          { parse_mode: "HTML", reply_to_message_id: replyId }
        );
      }

      const success = Math.random() < 0.62;
      const amount = randomLootAmount(victimMoons);

      if (success) {
        setMoons(victim, victimMoons - amount);
        setMoons(looter, getMoons(looter) + amount);
        looter.xp = (looter.xp || 0) + 3;

        await victim.save();
        await looter.save();

        const caption =
          `🌙 <b>LOOT SUCCESSFUL</b>\n` +
          `━━━━━━━━━━━━━━\n\n` +
          `${pick(SUCCESS_CAPTIONS)}\n\n` +
          `Raider: ${looterMention}\n` +
          `Target: ${victimMention}\n\n` +
          `Looted: <b>${amount.toLocaleString()} Moons</b>\n` +
          `Raider Balance: <b>${getMoons(looter).toLocaleString()} Moons</b>\n` +
          `Target Balance: <b>${getMoons(victim).toLocaleString()} Moons</b>\n\n` +
          `<i>Profile shown: successful raider.</i>`;

        return sendProfileResult(ctx, looterTelegram, caption, replyId);
      }

      const looterMoons = getMoons(looter);
      const penalty = randomLootAmount(looterMoons);
      setMoons(looter, looterMoons - penalty);
      setMoons(victim, victimMoons + penalty);
      looter.xp = (looter.xp || 0) + 1;
      looter.lastLootAt = now;

      await looter.save();
      await victim.save();

      const caption =
        `🛡️ <b>LOOT FAILED</b>\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `${pick(FAIL_CAPTIONS)}\n\n` +
        `Raider: ${looterMention}\n` +
        `Defender: ${victimMention}\n\n` +
        `Lost: <b>${penalty.toLocaleString()} Moons</b>\n` +
        `Raid Cooldown: <b>5 minutes</b>\n` +
        `Raider Balance: <b>${getMoons(looter).toLocaleString()} Moons</b>\n` +
        `Defender Balance: <b>${getMoons(victim).toLocaleString()} Moons</b>\n\n` +
        `<i>Profile shown: defender who stopped the raid.</i>`;

      return sendProfileResult(ctx, victimTelegram, caption, replyId);
    } catch (err) {
      console.error("Loot error:", err);
      return ctx.reply(
        "⚠️ <b>Loot Error</b>\n\nMikasa lost sight of the raid. Try again.",
        { parse_mode: "HTML", reply_to_message_id: replyId }
      );
    }
  });
}
