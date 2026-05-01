// src/commands/wish.js
import fs from "fs";
import path from "path";
import { User } from "../models/User.js";
import { WISH_COOLDOWN } from "../game/state.js";

const WISH_ON_DIR = "assets/WISH ON";
const WISH_OFF_DIR = "assets/WISH OFF";
const STARTING_MOONS = 1000;
const WISH_SUCCESS_REWARD = 100;
const WISH_FAILURE_PENALTY = 10;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomGif(dir) {
  try {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter((file) => file.endsWith(".gif"));
    if (!files.length) return null;
    return path.join(dir, files[Math.floor(Math.random() * files.length)]);
  } catch {
    return null;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

export function wishCommand(bot) {
  bot.command("wish", async (ctx) => {
    const replyId = ctx.message?.message_id;
    const now = Math.floor(Date.now() / 1000);

    try {
      if (!ctx.from || !ctx.message?.text) return;

      const userId = ctx.from.id;
      const name = ctx.from.first_name || "Dreamer";
      const safeName = escapeHtml(name);
      const mention = `<a href="tg://user?id=${userId}">${safeName}</a>`;

      const wishText = ctx.message.text.split(" ").slice(1).join(" ").trim();

      if (!wishText) {
        return ctx.reply(
          "🌙 <b>Whisper your desire</b>\n\n" +
            "Usage:\n<code>/wish I want to rule the underworld</code>",
          {
            parse_mode: "HTML",
            reply_to_message_id: replyId
          }
        );
      }

      const user = await User.findOneAndUpdate(
        { telegramId: userId },
        {
          $set: {
            firstName: name,
            username: ctx.from.username || null
          },
          $setOnInsert: {
            telegramId: userId,
            balance: STARTING_MOONS,
            moons: STARTING_MOONS
          }
        },
        { new: true, upsert: true }
      );

      if (user.lastWishAt && now - user.lastWishAt < WISH_COOLDOWN) {
        const left = Math.ceil((WISH_COOLDOWN - (now - user.lastWishAt)) / 60);

        return ctx.reply(
          `⏳ ${mention}, the cosmos is silent.\n` +
            `Try again in <b>${left} minute${left === 1 ? "" : "s"}</b>.`,
          {
            parse_mode: "HTML",
            reply_to_message_id: replyId
          }
        );
      }

      const thinking = await ctx.reply(`🔮 Analyzing ${mention}'s desire...`, {
        parse_mode: "HTML",
        reply_to_message_id: replyId
      });

      await sleep(1200);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        thinking.message_id,
        null,
        "🌌 Consulting the cosmic forces..."
      );

      await sleep(1200);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        thinking.message_id,
        null,
        "✨ The universe contemplates your wish..."
      );

      await sleep(1200);
      await ctx.telegram.deleteMessage(ctx.chat.id, thinking.message_id);

      const roll = Math.floor(Math.random() * 100) + 1;
      const success = roll >= 50;
      const barFilled = Math.floor(roll / 10);
      const bar = "■".repeat(barFilled) + "□".repeat(10 - barFilled);

      let rating;
      if (roll >= 90) rating = "✨ <b>LEGENDARY WISH</b> ✨";
      else if (roll >= 70) rating = "🌟 <b>POWERFUL WISH</b>";
      else if (roll >= 50) rating = "💫 <b>HOPEFUL WISH</b>";
      else if (roll >= 30) rating = "🌙 <b>FRAGILE WISH</b>";
      else rating = "🌑 <b>DISTANT WISH</b>";

      const gif = success ? randomGif(WISH_ON_DIR) : randomGif(WISH_OFF_DIR);

      user.wishCount = (user.wishCount || 0) + 1;
      if (success) user.wishSuccess = (user.wishSuccess || 0) + 1;

      const moonDelta = success ? WISH_SUCCESS_REWARD : -WISH_FAILURE_PENALTY;
      setMoons(user, getMoons(user) + moonDelta);
      user.lastWishAt = now;
      await user.save();

      const caption =
        `🌟 <b>WISH VERDICT</b> 🌟\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `Dreamer: ${mention}\n` +
        `Wish: <i>"${escapeHtml(wishText)}"</i>\n\n` +
        `${rating}\n` +
        `Destiny Roll: <b>${roll}%</b>\n` +
        `[${bar}]\n\n` +
        (success
          ? `The universe bends to your will.\n🌙 Reward: <b>+${WISH_SUCCESS_REWARD} Moons</b>`
          : `The cosmos delays your destiny.\n🌙 Cost: <b>-${WISH_FAILURE_PENALTY} Moons</b>`) +
        `\n\nTotal Wishes: <b>${user.wishCount}</b>\n` +
        `Successful Wishes: <b>${user.wishSuccess || 0}</b>\n` +
        `Moons Balance: <b>${getMoons(user).toLocaleString()} Moons</b>\n\n` +
        `<i>“Your resolve decides how far the stars will listen.”</i>\n` +
        `— Mikasa`;

      if (gif) {
        return ctx.replyWithAnimation(
          { source: gif },
          {
            caption,
            parse_mode: "HTML",
            reply_to_message_id: replyId
          }
        );
      }

      return ctx.reply(caption, {
        parse_mode: "HTML",
        reply_to_message_id: replyId
      });
    } catch (err) {
      console.error("Wish error:", err);
      return ctx.reply("🌪️ The cosmic flow fractured.\nTry again later.", {
        reply_to_message_id: replyId
      });
    }
  });
}
