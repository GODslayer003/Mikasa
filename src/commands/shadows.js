import { User } from "../models/User.js";
import { LEVELS } from "../game/levels.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PER_PAGE = 5;

function shadowCaption(shadow, ownerName, index, total) {
  const levelData = LEVELS[shadow.level];
  if (!levelData) return `${shadow.name}`;

  const stars = "★".repeat(levelData.stars) + "☆".repeat(6 - levelData.stars);
  const rarity = levelData.stars >= 6
    ? "💎 <b>MOONS LIMITED</b> 💎"
    : levelData.stars >= 4
      ? "✦ <b>ELITE SHADOW</b> ✦"
      : "⬤ <b>Shadow Soldier</b>";

  return (
    `👤 <b>${ownerName}'s Shadow</b> #${index}/${total}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `${rarity}\n\n` +
    `${levelData.emoji} <b>${shadow.name}</b>\n` +
    `└─ <i>${levelData.label}</i>\n\n` +
    `⭐ <b>${stars}</b>\n` +
    `⚡ <b>${levelData.power}</b> Shadow Power\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `— Sung Jin Woo 🗡️`
  );
}

function chunks(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function registerShadows(bot) {
  bot.command("shadows", async (ctx) => {
    try {
      if (!ctx.message || !ctx.from) return;

      const isReply = ctx.message.reply_to_message;
      const targetId = isReply
        ? ctx.message.reply_to_message.from.id
        : ctx.from.id;
      const targetName = isReply
        ? (ctx.message.reply_to_message.from.first_name || "User")
        : (ctx.from.first_name || "Hunter");

      let user = await User.findOne({ telegramId: targetId });
      if (!user || !Array.isArray(user.shadows) || !user.shadows.length) {
        return ctx.reply(
          `🗡️ <b>No Shadows</b>\n\n` +
          `<a href="tg://user?id=${targetId}">${targetName}</a> has no shadows in their army yet.\n\n` +
          `— Sung Jin Woo 🗡️`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      const shadows = user.shadows;
      const total = shadows.length;
      const totalPages = Math.ceil(total / PER_PAGE);
      const page = 0;
      const pageItems = shadows.slice(0, PER_PAGE);

      const rows = chunks(
        pageItems.map((s, i) => ({
          text: `${LEVELS[s.level]?.emoji || "⬤"} ${s.name}`,
          callback_data: `sv_${targetId}_${i}`
        })),
        2
      );

      const nav = [];
      if (totalPages > 1) {
        nav.push({ text: `📜 Page ${page + 1}/${totalPages}`, callback_data: "sv_nav" });
      }

      await ctx.reply(
        `🗡️ <b>${targetName}'s Shadow Army</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `Total Shadows: <b>${total}</b>\n\n` +
        `Tip: Type <code>@${ctx.botInfo?.username || "bot"} ${targetName.replace(/\s+/g, "").toLowerCase()}</code> in any chat to browse inline.\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `— Sung Jin Woo 🗡️`,
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [...rows, nav] },
          reply_to_message_id: ctx.message.message_id
        }
      );
    } catch (err) {
      console.error("SHADOWS ERROR:", err);
    }
  });

  // ─── Nav button placeholder ─────────────────────
  bot.action("sv_nav", async (ctx) => {
    await ctx.answerCbQuery();
  });

  // ─── View single shadow card ───────────────────
  bot.action(/^sv_(\d+)_(\d+)$/, async (ctx) => {
    try {
      const targetId = Number(ctx.match[1]);
      const shadowIdx = Number(ctx.match[2]);

      const user = await User.findOne({ telegramId: targetId });
      if (!user || !Array.isArray(user.shadows) || shadowIdx >= user.shadows.length) {
        return ctx.answerCbQuery("Shadow not found.");
      }

      const shadow = user.shadows[shadowIdx];
      const ownerName = user.firstName || "Hunter";
      const total = user.shadows.length;
      const caption = shadowCaption(shadow, ownerName, shadowIdx + 1, total);

      await ctx.answerCbQuery();

      if (shadow.imagePath && /\.gif$/i.test(shadow.imagePath)) {
        await ctx.replyWithAnimation(
          { source: shadow.imagePath },
          { caption, parse_mode: "HTML" }
        );
      } else if (shadow.imagePath) {
        await ctx.replyWithPhoto(
          { source: shadow.imagePath },
          { caption, parse_mode: "HTML" }
        );
      } else {
        await ctx.reply(caption, { parse_mode: "HTML" });
      }
    } catch (err) {
      console.error("SHADOW VIEW ERROR:", err);
    }
  });

  // ─── Inline query ──────────────────────────────
  bot.on("inline_query", async (ctx) => {
    try {
      const query = ctx.inlineQuery.query.trim().toLowerCase();
      const fromId = ctx.inlineQuery.from.id;

      let targetUser;
      let ownerName;

      if (!query) {
        targetUser = await User.findOne({ telegramId: fromId });
        ownerName = ctx.inlineQuery.from.first_name || "Hunter";
      } else {
        const clean = query.replace(/^@/, "");
        targetUser = await User.findOne({
          username: new RegExp(`^${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
        });
        if (!targetUser) {
          targetUser = await User.findOne({
            firstName: new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
          });
        }
        ownerName = targetUser?.firstName || clean;
      }

      if (!targetUser || !Array.isArray(targetUser.shadows) || !targetUser.shadows.length) {
        return ctx.answerInlineQuery([], { cache_time: 10 });
      }

      const total = targetUser.shadows.length;
      const results = targetUser.shadows.slice(0, 50).map((shadow, i) => {
        const levelData = LEVELS[shadow.level];
        const caption = shadowCaption(shadow, ownerName, i + 1, total);
        const stars = "★".repeat(levelData?.stars || 0) + "☆".repeat(6 - (levelData?.stars || 0));

        const baseUrl = process.env.RENDER_EXTERNAL_URL || "https://monsterbot-8v2b.onrender.com";
        let photoUrl = "";

        if (shadow.imagePath) {
          const rel = path.relative(
            path.join(__dirname, "..", "..", "assets"),
            shadow.imagePath
          );
          photoUrl = `${baseUrl}/assets/${rel.replace(/\\/g, "/")}`;
        }

        if (photoUrl) {
          return {
            type: "photo",
            id: `si_${targetUser.telegramId}_${i}`,
            photo_url: photoUrl,
            thumb_url: photoUrl,
            caption,
            parse_mode: "HTML"
          };
        }

        return {
          type: "article",
          id: `sa_${targetUser.telegramId}_${i}`,
          title: `${levelData?.emoji || "⬤"} ${shadow.name}`,
          description: `${levelData?.label || "Unknown"} • ${stars}`,
          input_message_content: {
            message_text: caption,
            parse_mode: "HTML"
          }
        };
      });

      await ctx.answerInlineQuery(results, {
        cache_time: 30,
        is_personal: true
      });
    } catch (err) {
      console.error("INLINE SHADOWS ERROR:", err);
    }
  });
}
