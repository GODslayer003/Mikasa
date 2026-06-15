import { User } from "../models/User.js";
import { LEVELS, rollRarity } from "../game/levels.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COOLDOWN = 60 * 30;

function randomFile(folder) {
  if (!fs.existsSync(folder)) return null;
  const files = fs.readdirSync(folder).filter(f => /\.(png|jpg|jpeg|gif)$/i.test(f));
  if (!files.length) return null;
  return path.join(folder, files[Math.floor(Math.random() * files.length)]);
}

function pickGif(levelKey) {
  const star = LEVELS[levelKey].stars;
  const wishFolder = star <= 3 ? "WISH OFF" : "WISH ON";
  const folder = path.join(__dirname, "..", "..", "assets", wishFolder);
  return randomFile(folder);
}

function starString(n) {
  return "★".repeat(n) + "☆".repeat(6 - n);
}

export function ariseCommand(bot) {
  bot.command("arise", async (ctx) => {
    try {
      if (!ctx.from || !ctx.message) return;

      const now = Math.floor(Date.now() / 1000);
      const userId = ctx.from.id;
      const firstName = ctx.from.first_name || "Hunter";
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
          pityCount: 0,
          ariseCount: 0,
          firstSeenAt: now,
          lastSeenAt: now
        });
      }

      if (!Array.isArray(user.shadows)) user.shadows = [];
      if (!user.totalStars) user.totalStars = 0;
      if (!user.totalPower) user.totalPower = 0;
      if (!user.lastAriseAt) user.lastAriseAt = 0;
      if (typeof user.pityCount !== "number") user.pityCount = 0;
      if (typeof user.ariseCount !== "number") user.ariseCount = 0;

      if (now - user.lastAriseAt < COOLDOWN) {
        const left = COOLDOWN - (now - user.lastAriseAt);
        const minutes = Math.ceil(left / 60);
        return ctx.reply(
          `🗡️ <b>Shadow Extraction — Cooldown</b>\n\n` +
          `⏰ <b>${minutes} minute${minutes !== 1 ? 's' : ''}</b> remaining\n\n` +
          `The gates need time to reopen.\n` +
          `— Sung Jin Woo 🗡️`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      // ─── DETERMINE RARITY VIA PITY ───────────────
      const prevPity = user.pityCount;
      const levelKey = rollRarity(prevPity);
      const levelData = LEVELS[levelKey];
      const isFiveOrHigher = levelData.stars >= 4;

      // ─── SEND SUSPENSE GIF ───────────────────────
      const gifPath = pickGif(levelKey);
      let gifMsgId = null;

      if (gifPath && /\.gif$/i.test(gifPath)) {
        const suspenseText =
          levelKey === "MOONS"
            ? `🗡️ <b>Shadow Extraction</b>\nThe Shadow Monarch stirs...`
            : isFiveOrHigher
              ? `🗡️ <b>Shadow Extraction</b>\nA powerful presence emerges from the gate...`
              : `🗡️ <b>Shadow Extraction</b>\nThe gates open... a shadow stirs.`;

        const gifMsg = await ctx.replyWithAnimation(
          { source: gifPath },
          {
            caption: suspenseText,
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
        gifMsgId = gifMsg.message_id;
      }

      // ─── RESOLVE PITY ────────────────────────────
      let userPity = prevPity;
      if (levelKey === "ULTRA" || levelKey === "MOONS") {
        userPity = 0;
      } else {
        userPity += 1;
      }

      // ─── PICK CHARACTER ──────────────────────────
      const folder = path.join(__dirname, "..", "..", "assets", levelData.folder);
      const charFile = randomFile(folder);

      if (!charFile) {
        if (gifMsgId) {
          ctx.telegram.deleteMessage(ctx.chat.id, gifMsgId).catch(() => {});
        }
        return ctx.reply(
          `🗡️ <b>No Shadows Available</b>\n\n` +
          `${levelData.emoji} <b>${levelData.label}</b> has no shadows to summon.\n\n` +
          `— Sung Jin Woo 🗡️`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }

      const charName = path.parse(charFile).name;

      const shadow = {
        name: charName,
        level: levelKey,
        power: levelData.power,
        stars: levelData.stars,
        imagePath: charFile
      };

      user.shadows.push(shadow);
      user.totalStars += levelData.stars;
      user.totalPower += levelData.power;
      user.lastAriseAt = now;
      user.lastSeenAt = now;
      user.pityCount = userPity;
      user.ariseCount += 1;
      await user.save();

      const stars = starString(levelData.stars);
      const rarityLabel = levelKey === "MOONS"
        ? "💎 <b>MOONS LIMITED</b> 💎"
        : isFiveOrHigher
          ? "✦ <b>ELITE SHADOW</b> ✦"
          : "⬤ <b>Shadow Soldier</b>";

      const caption =
        `🗡️ <b>SHADOW EXTRACTION</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `${rarityLabel}\n\n` +
        `${levelData.emoji} <b>${charName}</b>\n` +
        `└─ <i>${levelData.label}</i>\n\n` +
        `⭐ <b>${stars}</b>\n` +
        `⚡ <b>${levelData.power}</b> Shadow Power\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>${firstName}'s Army</b>\n` +
        `├ Shadows: <b>${user.shadows.length}</b>\n` +
        `├ Total Power: <b>${user.totalPower}</b>\n` +
        `├ Total Stars: <b>${user.totalStars}</b>\n` +
        `└ Arises: <b>${user.ariseCount}</b>\n\n` +
        `🔄 Pity: <b>${userPity}/60</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `— Sung Jin Woo 🗡️`;

      const chatId = ctx.chat.id;
      const origMsgId = ctx.message.message_id;

      if (gifMsgId) {
        setTimeout(async () => {
          try {
            await ctx.telegram.deleteMessage(chatId, gifMsgId);
          } catch (_) {}

          try {
            if (/\.gif$/i.test(charFile)) {
              await ctx.telegram.sendAnimation(chatId, { source: charFile }, { caption, parse_mode: "HTML", reply_to_message_id: origMsgId });
            } else {
              await ctx.telegram.sendPhoto(chatId, { source: charFile }, { caption, parse_mode: "HTML", reply_to_message_id: origMsgId });
            }
          } catch (_) {}
        }, 3000);
      } else {
        if (/\.gif$/i.test(charFile)) {
          await ctx.replyWithAnimation({ source: charFile }, { caption, parse_mode: "HTML" });
        } else {
          await ctx.replyWithPhoto({ source: charFile }, { caption, parse_mode: "HTML" });
        }
      }

    } catch (err) {
      console.error("ARISE ERROR:", err);
      await ctx.reply(
        `🗡️ <b>Extraction Failed</b>\n\n` +
        `— Sung Jin Woo 🗡️`,
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    }
  });
}
