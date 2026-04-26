// src/commands/ban.js
import { parseDuration } from "../utils/timeParser.js";
import { isAdmin } from "../utils/adminCheck.js";

const SUDOERS = ["ThyMonster", "RiverSung", "ThyFang", "ThyDivine", "ThyDemise"];
const MAX_TBAN = 99 * 86400; // 99 days

export function banCommand(bot) {
  bot.command(["ban", "dban", "tban"], async (ctx) => {
    const replyId = ctx.message.message_id;
    const issuer = ctx.from;
    const mentionIssuer = `<a href="tg://user?id=${issuer.id}">${issuer.first_name}</a>`;

    if (ctx.chat.type === "private") {
      return ctx.reply("🚬 Gun: \"This only works in groups.\"", {
        reply_to_message_id: replyId
      });
    }

    // ─── PERMISSION CHECK ───────────────────
    if (!(await isAdmin(ctx, issuer.id))) {
      return ctx.reply("🚫 You lack authority.", {
        reply_to_message_id: replyId
      });
    }

    const target =
      ctx.message.reply_to_message?.from ||
      (ctx.message.entities?.find(e => e.type === "text_mention")?.user);

    if (!target) {
      return ctx.reply(
        "🚬 Gun: \"Point out the rat. Reply or mention.\"",
        { reply_to_message_id: replyId }
      );
    }

    if (target.id === ctx.botInfo.id) {
      return ctx.reply(
        "🚬 Gun: \"I don't eliminate myself.\"",
        { reply_to_message_id: replyId }
      );
    }

    if (SUDOERS.includes(target.username)) {
      return ctx.reply(
        "🚬 Gun: \"That one is untouchable.\"",
        { reply_to_message_id: replyId }
      );
    }

    if (await isAdmin(ctx, target.id)) {
      return ctx.reply(
        "🚬 Gun: \"Can't touch another admin.\"",
        { reply_to_message_id: replyId }
      );
    }

    const mentionTarget = `<a href="tg://user?id=${target.id}">${target.first_name}</a>`;
    const args = ctx.message.text.split(" ").slice(1);

    // ─── DBAN ───────────────────────────────
    if (ctx.message.text.startsWith("/dban")) {
      if (ctx.message.reply_to_message) {
        try {
          await ctx.telegram.deleteMessage(
            ctx.chat.id,
            ctx.message.reply_to_message.message_id
          );
        } catch {}
      }
    }

    // ─── TEMP BAN ───────────────────────────
    if (ctx.message.text.startsWith("/tban")) {
      const duration = parseDuration(args[0]);
      const reason = args.slice(1).join(" ") || "No reason given";

      if (!duration || duration > MAX_TBAN) {
        return ctx.reply(
          "🚬 Gun: \"Invalid time. Use 5m / 2h / 1d (max 99d).\"",
          { reply_to_message_id: replyId }
        );
      }

      const until = Math.floor(Date.now() / 1000) + duration;

      await ctx.telegram.banChatMember(ctx.chat.id, target.id, {
        until_date: until
      });

      return ctx.reply(
        `⚖️ <b>TEMPORARY BAN</b>\n\n` +
        `🎯 Target: ${mentionTarget}\n` +
        `👮 Enforcer: ${mentionIssuer}\n` +
        `⏰ Duration: ${args[0]}\n` +
        `📝 Reason: ${reason}\n\n` +
        `🚬 Gun: "They’ll be back. Eventually."`,
        {
          parse_mode: "HTML",
          reply_to_message_id: replyId
        }
      );
    }

    // ─── PERMANENT BAN ──────────────────────
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);

    return ctx.reply(
      `🔨 <b>PERMANENT BAN</b>\n\n` +
      `🎯 Target: ${mentionTarget}\n` +
      `👮 Enforcer: ${mentionIssuer}\n` +
      `📝 Reason: ${args.join(" ") || "No reason given"}\n\n` +
      `🚬 Gun: "Eliminated. Permanently."`,
      {
        parse_mode: "HTML",
        reply_to_message_id: replyId
      }
    );
  });

  // ─── UNBAN ───────────────────────────────
  bot.command(["unban", "dunban"], async (ctx) => {
    const replyId = ctx.message.message_id;
    const issuer = ctx.from;

    if (!(await isAdmin(ctx, issuer.id))) {
      return ctx.reply("🚫 You lack authority.", {
        reply_to_message_id: replyId
      });
    }

    const target =
      ctx.message.reply_to_message?.from ||
      (ctx.message.entities?.find(e => e.type === "text_mention")?.user);

    if (!target) {
      return ctx.reply(
        "🚬 Gun: \"Who gets pardoned?\"",
        { reply_to_message_id: replyId }
      );
    }

    const mentionTarget = `<a href="tg://user?id=${target.id}">${target.first_name}</a>`;
    const mentionIssuer = `<a href="tg://user?id=${issuer.id}">${issuer.first_name}</a>`;

    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id, {
      only_if_banned: true
    });

    return ctx.reply(
      `✅ <b>UNBANNED</b>\n\n` +
      `🎯 User: ${mentionTarget}\n` +
      `👮 By: ${mentionIssuer}\n\n` +
      `🚬 Gun: "Second chance granted. Don’t waste it."`,
      {
        parse_mode: "HTML",
        reply_to_message_id: replyId
      }
    );
  });
}