// src/commands/arisers.js
import { User } from "../models/User.js";

export function arisersCommand(bot) {
  bot.command("arisers", async (ctx) => {
    try {
      if (!ctx.from) return;

      const callerId = ctx.from.id;
      const callerName = ctx.from.first_name || "Scout";
      const callerMention = `<a href="tg://user?id=${callerId}">${callerName}</a>`;

      const topUsers = await User.find({
        shadows: { $exists: true, $ne: [] },
        totalStars: { $gt: 0 }
      })
        .sort({ totalStars: -1, totalPower: -1 })
        .limit(15);

      let callerRankInTop = null;

      let caption =
        `🛡️ <b>SURVEY CORPS RANKING</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>Global strength assessment</i>\n\n`;

      // ─── TOP COMMANDERS (1–3) ──────────────────
      if (topUsers.length > 0) {
        caption += `👑 <b>TOP COMMANDERS</b>\n`;
        topUsers.slice(0, 3).forEach((u, i) => {
          const rank = i + 1;
          if (u.telegramId === callerId) callerRankInTop = rank;

          const name = u.telegramId === callerId
            ? `🧣 ${callerMention}`
            : `<b>${u.firstName || "Unknown"}</b>`;

          const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
          caption += `${medal} <b>#${rank}</b> ${name}\n` +
                    `   └─ ${u.totalStars} ⭐\n`;
        });
        caption += "\n";
      }

      // ─── ELITE SQUAD (4–5) ───────────────────
      if (topUsers.length >= 4) {
        caption += `🔥 <b>ELITE SQUAD</b>\n`;
        topUsers.slice(3, 5).forEach((u, i) => {
          const rank = i + 4;
          if (u.telegramId === callerId) callerRankInTop = rank;

          const name = u.telegramId === callerId
            ? `🧣 ${callerMention}`
            : `<b>${u.firstName || "Unknown"}</b>`;

          caption += `⚔️ <b>#${rank}</b> ${name}\n` +
                    `   └─ ${u.totalStars} ⭐\n`;
        });
        caption += "\n";
      }

      // ─── VETERAN REGIMENT (6–10) ────────────────
      if (topUsers.length >= 6) {
        caption += `🛡️ <b>VETERAN REGIMENT</b>\n`;
        topUsers.slice(5, 10).forEach((u, i) => {
          const rank = i + 6;
          if (u.telegramId === callerId) callerRankInTop = rank;

          const name = u.telegramId === callerId
            ? `🧣 ${callerMention}`
            : `<b>${u.firstName || "Unknown"}</b>`;

          const bullet = rank < 8 ? "•" : "◦";
          caption += `${bullet} <b>#${rank}</b> ${name} — ${u.totalStars} ⭐\n`;
        });
        caption += "\n";
      }

      // ─── SCOUTING DIVISION (11–15) ───────────────
      if (topUsers.length >= 11) {
        caption += `🎖️ <b>SCOUTING DIVISION</b>\n`;
        topUsers.slice(10, 15).forEach((u, i) => {
          const rank = i + 11;
          if (u.telegramId === callerId) callerRankInTop = rank;

          const name = u.telegramId === callerId
            ? `🧣 ${callerMention}`
            : `<b>${u.firstName || "Unknown"}</b>`;

          caption += `◦ <b>#${rank}</b> ${name} — ${u.totalStars} ⭐\n`;
        });
        caption += "\n";
      }

      // ─── CALLER STATUS ─────────────────────
      const callerData = await User.findOne({ telegramId: callerId });
      
      caption += `━━━━━━━━━━━━━━━━━━━━\n`;

      if (!callerData || !callerData.shadows?.length) {
        caption +=
          `🛡️ <b>YOUR STATUS</b>\n` +
          `├─ Rank: <b>Recruit</b>\n` +
          `└─ No soldiers summoned\n\n` +
          `«Report to /arise for deployment.»\n` +
          `— Mikasa`;
      } else if (!callerRankInTop) {
        const betterCount = await User.countDocuments({
          shadows: { $exists: true, $ne: [] },
          totalStars: { $gt: callerData.totalStars }
        });

        caption +=
          `🛡️ <b>YOUR STATUS</b>\n` +
          `├─ Soldiers: ${callerData.shadows.length}\n` +
          `├─ Total Stars: ${callerData.totalStars} ⭐\n` +
          `├─ Combat Power: ${callerData.totalPower} ⚡\n` +
          `└─ <b>WORLD RANK: #${betterCount + 1}</b>\n\n` +
          `«Advance your position.»\n` +
          `— Mikasa`;
      } else {
        caption +=
          `🛡️ <b>YOUR STATUS</b>\n` +
          `├─ Soldiers: ${callerData.shadows.length}\n` +
          `├─ Total Stars: ${callerData.totalStars} ⭐\n` +
          `├─ Combat Power: ${callerData.totalPower} ⚡\n` +
          `└─ <b>WORLD RANK: #${callerRankInTop}</b>\n\n` +
          `«Hold your ground.»\n` +
          `— Mikasa`;
      }

      // ─── PROFILE PHOTO SUPPORT ─────────────
      const photos = await ctx.telegram.getUserProfilePhotos(callerId, 0, 1);
      if (photos.total_count > 0) {
        return ctx.replyWithPhoto(photos.photos[0][0].file_id, {
          caption,
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        });
      }

      await ctx.reply(caption, {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message.message_id
      });

    } catch (err) {
      console.error("ARISERS ERROR:", err);
      await ctx.reply(
        `⚠️ <b>System Error</b>\n\n` +
        `«Scouting report interrupted. Regroup.»\n` +
        `— Mikasa`,
        { 
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id 
        }
      );
    }
  });
}