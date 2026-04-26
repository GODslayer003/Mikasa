// src/commands/wish.js
import fs from "fs";
import path from "path";
import { User } from "../models/User.js";
import { WISH_COOLDOWN } from "../game/state.js";

// ─── ASSET DIRECTORIES ─────────────────────
const WISH_ON_DIR = "assets/WISH ON";
const WISH_OFF_DIR = "assets/WISH OFF";

// ─── HELPERS ───────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function randomGif(dir) {
  try {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".gif"));
    if (!files.length) return null;
    return path.join(dir, files[Math.floor(Math.random() * files.length)]);
  } catch {
    return null;
  }
}

// ─── COMMAND ───────────────────────────────
export function wishCommand(bot) {
  bot.command("wish", async (ctx) => {
    const replyId = ctx.message?.message_id;
    const now = Math.floor(Date.now() / 1000);

    try {
      if (!ctx.from || !ctx.message?.text) return;

      const userId = ctx.from.id;
      const name = ctx.from.first_name || "Dreamer";
      const mention = `<a href="tg://user?id=${userId}">${name}</a>`;

      // ─── PARSE WISH TEXT ──────────────────
      const wishText = ctx.message.text
        .split(" ")
        .slice(1)
        .join(" ")
        .trim();

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

      // ─── FETCH / CREATE USER ──────────────
      const user = await User.findOneAndUpdate(
        { telegramId: userId },
        {
          $setOnInsert: {
            telegramId: userId,
            firstName: name
          }
        },
        { new: true, upsert: true }
      );

      // ─── COOLDOWN CHECK ───────────────────
      if (user.lastWishAt && now - user.lastWishAt < WISH_COOLDOWN) {
        const left = Math.ceil(
          (WISH_COOLDOWN - (now - user.lastWishAt)) / 60
        );

        return ctx.reply(
          `⏳ ${mention}, the cosmos is silent.\n` +
          `Try again in <b>${left} minute(s)</b>.`,
          {
            parse_mode: "HTML",
            reply_to_message_id: replyId
          }
        );
      }

      // ─── CINEMATIC SEQUENCE ───────────────
      const thinking = await ctx.reply(
        `🔮 Analyzing ${mention}'s desire...`,
        {
          parse_mode: "HTML",
          reply_to_message_id: replyId
        }
      );

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

      // ─── ROLL ─────────────────────────────
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

      // ─── ASSET ────────────────────────────
      const gif = success
        ? randomGif(WISH_ON_DIR)
        : randomGif(WISH_OFF_DIR);

      // ─── UPDATE USER ──────────────────────
      user.wishCount += 1;
      if (success) user.wishSuccess += 1;
      user.lastWishAt = now;
      await user.save();

      // ─── FINAL MESSAGE ────────────────────
      const caption =
        `🌟 <b>WISH VERDICT</b> 🌟\n\n` +
        `👤 Dreamer: ${mention}\n` +
        `✨ Wish: <i>"${wishText}"</i>\n\n` +
        `${rating}\n` +
        `🎲 Destiny Roll: <b>${roll}%</b>\n` +
        `[${bar}]\n\n` +
        (success
          ? "🎉 The universe bends to your will."
          : "🌑 The cosmos delays your destiny.") +
        `\n\n📊 Total Wishes: <b>${user.wishCount}</b>\n` +
        `⭐ Successful Wishes: <b>${user.wishSuccess}</b>`;

      if (gif) {
        await ctx.replyWithAnimation(
          { source: gif },
          {
            caption,
            parse_mode: "HTML",
            reply_to_message_id: replyId
          }
        );
      } else {
        await ctx.reply(caption, {
          parse_mode: "HTML",
          reply_to_message_id: replyId
        });
      }

    } catch (err) {
      console.error("Wish error:", err);
      await ctx.reply(
        "🌪️ The cosmic flow fractured.\nTry again later.",
        {
          reply_to_message_id: replyId
        }
      );
    }
  });
}