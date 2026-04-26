// src/commands/arise.js
import { User } from "../models/User.js";
import { LEVELS } from "../game/levels.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── PATH SETUP ─────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CONFIG ─────────────────────────────────
const COOLDOWN = 60 * 30; // 30 minutes
const FAIL_CHANCE = 25;   // 15% chance to find nothing

function rollLevel() {
  const roll = Math.random() * 100;
  let sum = 0;
  for (const key of Object.keys(LEVELS)) {
    sum += LEVELS[key].chance;
    if (roll <= sum) return key;
  }
  return "LOW";
}

export function ariseCommand(bot) {
  bot.command("arise", async (ctx) => {
    try {
      if (!ctx.from || !ctx.message) return;

      const now = Math.floor(Date.now() / 1000);
      const userId = ctx.from.id;
      const firstName = ctx.from.first_name || "Scout";
      const mention = `<a href="tg://user?id=${userId}">${firstName}</a>`;

      // ─── FIND / CREATE USER ─────────────────
      let user = await User.findOne({ telegramId: userId });

      if (!user) {
        user = await User.create({
          telegramId: userId,
          firstName,
          shadows: [],
          totalStars: 0,
          totalPower: 0,
          lastAriseAt: 0,
          firstSeenAt: now,
          lastSeenAt: now
        });
      }

      // ─── SAFETY (LEGACY USERS) ─────────────
      if (!Array.isArray(user.shadows)) user.shadows = [];
      if (!user.totalStars) user.totalStars = 0;
      if (!user.totalPower) user.totalPower = 0;
      if (!user.lastAriseAt) user.lastAriseAt = 0;

      // ─── COOLDOWN ──────────────────────────
      if (now - user.lastAriseAt < COOLDOWN) {
        const left = COOLDOWN - (now - user.lastAriseAt);
        const minutes = Math.ceil(left / 60);

        return ctx.reply(
          `🧣 <b>Arise Cooldown</b>\n\n` +
          `⏰ <b>${minutes} minute${minutes !== 1 ? 's' : ''}</b> remaining\n\n` +
          `«You are overextending. Rest. Your life depends on it.»\n` +
          `— Mikasa`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      // ─── FAILURE CHANCE ────────────────────
      if (Math.random() * 100 < FAIL_CHANCE) {
        user.lastAriseAt = now; // Still trigger cooldown
        await user.save();

        return ctx.reply(
          `🧣 <b>SCAPE REPORT: EMPTY</b>\n\n` +
          `The area is deserted. There are no allies here to recruit.\n\n` +
          `«The world is cruel. Sometimes, you find nothing but dust. Do not lose your resolve.»\n` +
          `— Mikasa`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      // ─── ROLL CHARACTER ────────────────────
      const levelKey = rollLevel();
      const levelData = LEVELS[levelKey];

      const folder = path.join(
        __dirname,
        "..",
        "..",
        "assets",
        levelData.folder
      );

      if (!fs.existsSync(folder)) {
        return ctx.reply(
          `⚠️ <b>No Assets Found</b>\n\n` +
          `Failed to access: <code>${levelData.folder}</code>\n\n` +
          `«Scouting report incomplete.»`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      const files = fs
        .readdirSync(folder)
        .filter(f => /\.(png|jpg|jpeg)$/i.test(f));

      if (!files.length) {
        return ctx.reply(
          `🛡️ <b>No Recruits Available</b>\n\n` +
          `${levelData.emoji} <b>${levelData.label}</b> barracks are empty.\n\n` +
          `«No soldiers in this division.»`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      const file = files[Math.floor(Math.random() * files.length)];

      const shadow = {
        name: path.parse(file).name,
        level: levelKey,
        power: levelData.power,
        stars: levelData.stars,
        imagePath: path.join(folder, file)
      };

      // ─── SAVE ──────────────────────────────
      user.shadows.push(shadow);
      user.totalStars += levelData.stars;
      user.totalPower += levelData.power;
      user.lastAriseAt = now;
      user.lastSeenAt = now;
      await user.save();

      // ─── FORMAT STARS ──────────────────────
      const stars = "★".repeat(levelData.stars) + "☆".repeat(5 - levelData.stars);

      // ─── FINAL RESPONSE ────────────────────
      await ctx.replyWithPhoto(
        { source: shadow.imagePath },
        {
          caption:
            `🛡️ <b>RECRUIT REPORT</b>\n` +
            `━━━━━━━━━━━━━━\n\n` +
            `${levelData.emoji} <b>${shadow.name}</b>\n` +
            `└─ <i>${levelData.label}</i>\n\n` +
            `⭐ <b>${stars}</b>\n` +
            `⚡ <b>${levelData.power}</b> Combat Power\n\n` +
            `━━━━━━━━━━━━━━\n` +
            `🧣 <b>${firstName}'s Regiment</b>\n` +
            `┌─ Soldiers: <b>${user.shadows.length}</b>\n` +
            `├─ Total Power: <b>${user.totalPower}</b>\n` +
            `└─ Total Stars: <b>${user.totalStars}</b>\n\n` +
            `«I will protect you. No matter what.»\n` +
            `— Mikasa`,
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        }
      );

    } catch (err) {
      console.error("MIKA ARISE ERROR:", err);
      await ctx.reply(
        `⚠️ <b>System Error</b>\n\n` +
        `«Fall back and regroup. Try again.»\n` +
        `— Mikasa`,
        {
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        }
      );
    }
  });
}