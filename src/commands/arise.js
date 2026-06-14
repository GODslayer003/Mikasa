import { User } from "../models/User.js";
import { LEVELS } from "../game/levels.js";
import { getDojkaQuote } from "../services/dojkaAssets.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COOLDOWN = 60 * 30;
const FAIL_CHANCE = 25;

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
      const firstName = ctx.from.first_name || "Incarnation";
      const mention = `<a href="tg://user?id=${userId}">${firstName}</a>`;

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

      if (!Array.isArray(user.shadows)) user.shadows = [];
      if (!user.totalStars) user.totalStars = 0;
      if (!user.totalPower) user.totalPower = 0;
      if (!user.lastAriseAt) user.lastAriseAt = 0;

      if (now - user.lastAriseAt < COOLDOWN) {
        const left = COOLDOWN - (now - user.lastAriseAt);
        const minutes = Math.ceil(left / 60);

        return ctx.reply(
          `🌌 <b>Star Stream — Cooldown</b>\n\n` +
          `⏰ <b>${minutes} minute${minutes !== 1 ? 's' : ''}</b> remaining\n\n` +
          `«The Star Stream flows at its own pace. You cannot force a scenario.»\n` +
          `— Kim Dojka`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      if (Math.random() * 100 < FAIL_CHANCE) {
        user.lastAriseAt = now;
        await user.save();

        return ctx.reply(
          `🌌 <b>Star Stream Revelation: Empty</b>\n\n` +
          `No incarnations answered your call. The probability of this scenario was against you.\n\n` +
          `«${getDojkaQuote()}»`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

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
          `«The Star Stream has not prepared this scenario yet.»`,
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
          `🌟 <b>No Incarnations Available</b>\n\n` +
          `${levelData.emoji} <b>${levelData.label}</b> constellations have no followers to spare.\n\n` +
          `«The probability is 0.001%.»`,
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

      user.shadows.push(shadow);
      user.totalStars += levelData.stars;
      user.totalPower += levelData.power;
      user.lastAriseAt = now;
      user.lastSeenAt = now;
      await user.save();

      const stars = "★".repeat(levelData.stars) + "☆".repeat(5 - levelData.stars);

      await ctx.replyWithPhoto(
        { source: shadow.imagePath },
        {
          caption:
            `🌌 <b>STAR STREAM — SPONSORSHIP</b>\n` +
            `━━━━━━━━━━━━━━\n\n` +
            `${levelData.emoji} <b>${shadow.name}</b>\n` +
            `└─ <i>${levelData.label} Incarnation</i>\n\n` +
            `⭐ <b>${stars}</b>\n` +
            `⚡ <b>${levelData.power}</b> Probability\n\n` +
            `━━━━━━━━━━━━━━\n` +
            `🌟 <b>${firstName}'s Kim Com</b>\n` +
            `┌─ Incarnations: <b>${user.shadows.length}</b>\n` +
            `├─ Total Probability: <b>${user.totalPower}</b>\n` +
            `└─ Total Stars: <b>${user.totalStars}</b>\n\n` +
            `«${getDojkaQuote()}»`,
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        }
      );

    } catch (err) {
      console.error("ARISE ERROR:", err);
      await ctx.reply(
        `⚠️ <b>Scenario Error</b>\n\n` +
        `«${getDojkaQuote()}»`,
        {
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        }
      );
    }
  });
}
