// src/commands/kick.js
import { isAdmin } from "../utils/adminCheck.js";

const SUDOERS = [
  "ThyMonster",
  "RiverSung",
  "ThyFang",
  "ThyDivine",
  "ThyDemise"
];

export function kickCommand(bot) {
  bot.command(["kick", "dkick"], async (ctx) => {
    const replyId = ctx.message.message_id;
    const issuer = ctx.from;
    const mentionIssuer = `<a href="tg://user?id=${issuer.id}">${issuer.first_name}</a>`;

    try {
      // ─── GROUP ONLY ───────────────────────
      if (ctx.chat.type === "private") {
        return ctx.reply(
          "🚬 Gun: \"This only works in groups.\"",
          { reply_to_message_id: replyId }
        );
      }

      // ─── ADMIN CHECK ──────────────────────
      if (!(await isAdmin(ctx, issuer.id))) {
        return ctx.reply(
          "🚫 You don't have authority.",
          { reply_to_message_id: replyId }
        );
      }

      // ─── TARGET DETECTION ─────────────────
      const target =
        ctx.message.reply_to_message?.from ||
        ctx.message.entities?.find(e => e.type === "text_mention")?.user;

      if (!target) {
        return ctx.reply(
          "🚬 Gun: \"Point out the rat. Reply or mention.\"",
          { reply_to_message_id: replyId }
        );
      }

      // ─── PROTECTIONS ──────────────────────
      if (target.id === ctx.botInfo.id) {
        return ctx.reply(
          "🚬 Gun: \"I don't kick myself out.\"",
          { reply_to_message_id: replyId }
        );
      }

      if (target.id === issuer.id) {
        return ctx.reply(
          "🤡 You trying to kick yourself?",
          { reply_to_message_id: replyId }
        );
      }

      if (SUDOERS.includes(target.username)) {
        return ctx.reply(
          "🚬 Gun: \"That one's elite. Untouchable.\"",
          { reply_to_message_id: replyId }
        );
      }

      if (await isAdmin(ctx, target.id)) {
        return ctx.reply(
          "🚬 Gun: \"Can't kick another admin.\"",
          { reply_to_message_id: replyId }
        );
      }

      const mentionTarget = `<a href="tg://user?id=${target.id}">${target.first_name}</a>`;
      const reason =
        ctx.message.text.split(" ").slice(1).join(" ") || "No reason given";

      // ─── DELETE MESSAGE (dkick) ───────────
      if (
        ctx.message.text.startsWith("/dkick") &&
        ctx.message.reply_to_message
      ) {
        try {
          await ctx.telegram.deleteMessage(
            ctx.chat.id,
            ctx.message.reply_to_message.message_id
          );
        } catch {}
      }

      // ─── KICK (BAN + UNBAN) ───────────────
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);

      await ctx.reply(
        `👢 <b>KICKED OUT</b>\n\n` +
        `🎯 Target: ${mentionTarget}\n` +
        `👮 Enforcer: ${mentionIssuer}\n` +
        `📝 Reason: ${reason}\n\n` +
        `🚬 Gun: "Get out of my sight."`,
        {
          parse_mode: "HTML",
          reply_to_message_id: replyId
        }
      );

      // Unban after short delay so user can rejoin
      setTimeout(async () => {
        try {
          await ctx.telegram.unbanChatMember(ctx.chat.id, target.id, {
            only_if_banned: true
          });
        } catch {}
      }, 1000);

    } catch (err) {
      console.error("Kick error:", err);
      await ctx.reply(
        `🚬 Gun: "Kick failed. ${err.message}"`,
        { reply_to_message_id: replyId }
      );
    }
  });
}