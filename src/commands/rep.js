import { User } from "../models/User.js";
import { getDojkaQuote } from "../services/dojkaAssets.js";

function repBadge(rep) {
  if (rep >= 100) return "✦ Star Stream Legend ✦";
  if (rep >= 50) return "✦ Revered Constellation ✦";
  if (rep >= 25) return "✦ Honoured Incarnation ✦";
  if (rep >= 10) return "✦ Respected Reader ✦";
  if (rep >= 5) return "✦ Rising Follower ✦";
  if (rep >= 1) return "✦ Known Entity ✦";
  if (rep === 0) return "✦ Unranked ✦";
  if (rep >= -5) return "✧ Dimmed Spark ✧";
  if (rep >= -25) return "✧ Forgotten Page ✧";
  if (rep >= -50) return "✧ Fallen Constellation ✧";
  return "✧ Erased from the Story ✧";
}

function repBar(rep) {
  const total = 20;
  const filled = Math.min(total, Math.max(0, Math.round((rep + 50) / 100 * total)));
  const bar = "▓".repeat(filled) + "░".repeat(total - filled);
  return bar;
}

function repEmoji(rep) {
  if (rep >= 100) return "🌟";
  if (rep >= 25) return "⭐";
  if (rep >= 5) return "✨";
  if (rep >= 1) return "💫";
  if (rep === 0) return "🌑";
  if (rep >= -10) return "☁️";
  if (rep >= -30) return "🌧️";
  return "⛈️";
}

export function repCommand(bot) {
  bot.command("rep", async (ctx) => {
    try {
      if (!ctx.message) return;

      const now = Math.floor(Date.now() / 1000);
      const isReply = ctx.message.reply_to_message;
      const targetId = isReply
        ? ctx.message.reply_to_message.from.id
        : ctx.from.id;
      const targetFirstName = isReply
        ? ctx.message.reply_to_message.from.first_name || "User"
        : ctx.from.first_name || "User";
      const requesterId = ctx.from.id;

      let user = await User.findOne({ telegramId: targetId });

      if (!user) {
        user = await User.create({
          telegramId: targetId,
          firstName: targetFirstName,
          reputation: 0,
          firstSeenAt: now,
          lastSeenAt: now
        });
      }

      if (typeof user.reputation !== "number") user.reputation = 0;

      const rep = user.reputation;
      const badge = repBadge(rep);
      const bar = repBar(rep);
      const emoji = repEmoji(rep);

      const lines = [
        `╔══════════════════════════════╗`,
        `║   ✦   R E P U T A T I O N   ✦   ║`,
        `╠══════════════════════════════╣`,
        `║                              ║`,
        `║  ${emoji}  <b>${targetFirstName}</b>`,
        `║                              ║`,
        `║  ${bar}`,
        `║  <b>${rep >= 0 ? "+" : ""}${rep}</b>  ·  ${badge}`,
        `║                              ║`,
        `╚══════════════════════════════╝`,
        ``,
        `“${getDojkaQuote()}”`
      ];

      await ctx.reply(lines.join("\n"), {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message.message_id
      });
    } catch (err) {
      console.error("REP ERROR:", err);
    }
  });
}
