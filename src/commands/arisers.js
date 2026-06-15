import { User } from "../models/User.js";

export function registerArisers(bot) {
  bot.command("arisers", async (ctx) => {
    try {
      if (!ctx.message || !ctx.from) return;

      const userId = ctx.from.id;
      const firstName = ctx.from.first_name || "Hunter";

      const leaders = await User.find({ ariseCount: { $gt: 0 } })
        .sort({ ariseCount: -1 })
        .limit(10)
        .lean();

      const total = await User.countDocuments({ ariseCount: { $gt: 0 } });

      const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      const lines = leaders.map((u, i) => {
        const name = u.firstName || "Hunter";
        const count = u.ariseCount || 0;
        const mark = u.telegramId === userId ? " ← <b>You</b>" : "";
        return `${medals[i]} <b>${i + 1}.</b> <a href="tg://user?id=${u.telegramId}">${name}</a> — <b>${count}</b> Arises${mark}`;
      });

      const inTop10 = leaders.some(u => u.telegramId === userId);

      let rankLine = "";
      if (!inTop10) {
        const user = await User.findOne({ telegramId: userId });
        const userCount = user?.ariseCount || 0;
        if (userCount > 0) {
          const rank = await User.countDocuments({ ariseCount: { $gt: userCount } }) + 1;
          rankLine = `\n─── ⋆⋅☆⋅⋆ ───\nYour Rank: <b>#${rank}</b> of <b>${total}</b>`;
        } else {
          rankLine = `\n─── ⋆⋅☆⋅⋆ ───\nYou haven't Arised yet, <b>${firstName}</b>.`;
        }
      }

      const caption =
        `🗡️ <b>Shadow Monarch's Army</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `${lines.join("\n")}` +
        `${rankLine}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `— Sung Jin Woo 🗡️`;

      const photos = await ctx.telegram.getUserProfilePhotos(userId).catch(() => null);
      if (photos && photos.total_count > 0) {
        const fileId = photos.photos[0][0].file_id;
        await ctx.replyWithPhoto(fileId, {
          caption,
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        });
      } else {
        await ctx.reply(caption, {
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        });
      }
    } catch (err) {
      console.error("ARISERS ERROR:", err);
    }
  });
}
