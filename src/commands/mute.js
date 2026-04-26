// src/commands/mute.js
import { Markup } from "telegraf";
import { parseDuration } from "../utils/timeParser.js";
import { isAdmin } from "../utils/adminCheck.js";

const SUDOERS = [
  "ThyMonster",
  "RiverSung",
  "ThyFang",
  "ThyDivine",
  "ThyDemise"
];

const MAX_MUTE = 99 * 86400; // 99 days

export function muteCommand(bot) {
  /* ─────────────── MUTE / TMUTE ─────────────── */
  bot.command(["mute", "tmute"], async (ctx) => {
    const replyId = ctx.message.message_id;
    const issuer = ctx.from;
    const mentionIssuer = `<a href="tg://user?id=${issuer.id}">${issuer.first_name}</a>`;

    try {
      if (ctx.chat.type === "private") {
        return ctx.reply(
          "🚬 Gun: \"This only works in groups.\"",
          { reply_to_message_id: replyId }
        );
      }

      if (!(await isAdmin(ctx, issuer.id))) {
        return ctx.reply(
          "🚫 You lack authority.",
          { reply_to_message_id: replyId }
        );
      }

      const target =
        ctx.message.reply_to_message?.from ||
        ctx.message.entities?.find(e => e.type === "text_mention")?.user;

      if (!target) {
        return ctx.reply(
          "🚬 Gun: \"Who am I silencing? Reply or mention.\"",
          { reply_to_message_id: replyId }
        );
      }

      if (target.id === ctx.botInfo.id) {
        return ctx.reply(
          "🚬 Gun: \"I won't silence myself.\"",
          { reply_to_message_id: replyId }
        );
      }

      if (SUDOERS.includes(target.username)) {
        return ctx.reply(
          "🚬 Gun: \"Can't silence the elites.\"",
          { reply_to_message_id: replyId }
        );
      }

      if (await isAdmin(ctx, target.id)) {
        return ctx.reply(
          "🚬 Gun: \"Can't silence another admin.\"",
          { reply_to_message_id: replyId }
        );
      }

      const mentionTarget = `<a href="tg://user?id=${target.id}">${target.first_name}</a>`;
      const args = ctx.message.text.split(" ").slice(1);

      /* ───────────── TEMP MUTE ───────────── */
      if (ctx.message.text.startsWith("/tmute")) {
        const duration = parseDuration(args[0]);
        const reason = args.slice(1).join(" ") || "No reason given";

        if (!duration || duration > MAX_MUTE) {
          return ctx.reply(
            "🚬 Gun: \"Invalid time. Use 5m / 2h / 1d (max 99d).\"",
            { reply_to_message_id: replyId }
          );
        }

        const until = Math.floor(Date.now() / 1000) + duration;

        await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
          permissions: { can_send_messages: false },
          until_date: until
        });

        return ctx.reply(
          `🔇 <b>TEMPORARY MUTE</b>\n\n` +
          `🎯 Target: ${mentionTarget}\n` +
          `👮 Enforcer: ${mentionIssuer}\n` +
          `⏰ Duration: ${args[0]}\n` +
          `📝 Reason: ${reason}\n\n` +
          `🚬 Gun: "Silence. For now."`,
          {
            parse_mode: "HTML",
            reply_to_message_id: replyId,
            reply_markup: Markup.inlineKeyboard([
              Markup.button.callback("🔊 Unmute", `unmute_${target.id}`)
            ])
          }
        );
      }

      /* ───────────── PERMANENT MUTE ───────────── */
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: { can_send_messages: false }
      });

      return ctx.reply(
        `🔇 <b>PERMANENT MUTE</b>\n\n` +
        `🎯 Target: ${mentionTarget}\n` +
        `👮 Enforcer: ${mentionIssuer}\n` +
        `📝 Reason: ${args.join(" ") || "No reason given"}\n\n` +
        `🚬 Gun: "Silenced. Permanently."`,
        {
          parse_mode: "HTML",
          reply_to_message_id: replyId,
          reply_markup: Markup.inlineKeyboard([
            Markup.button.callback("🔊 Unmute", `unmute_${target.id}`)
          ])
        }
      );

    } catch (err) {
      console.error("Mute error:", err);
      await ctx.reply(
        `🚬 Gun: "Mute failed. ${err.message}"`,
        { reply_to_message_id: replyId }
      );
    }
  });

  /* ─────────────── UNMUTE / DUNMUTE ─────────────── */
  bot.command(["unmute", "dunmute"], async (ctx) => {
    const replyId = ctx.message.message_id;

    if (!(await isAdmin(ctx, ctx.from.id))) {
      return ctx.reply("🚫 You lack authority.", {
        reply_to_message_id: replyId
      });
    }

    const target =
      ctx.message.reply_to_message?.from ||
      ctx.message.entities?.find(e => e.type === "text_mention")?.user;

    if (!target) {
      return ctx.reply(
        "🚬 Gun: \"Who speaks again?\"",
        { reply_to_message_id: replyId }
      );
    }

    const chat = await ctx.telegram.getChat(ctx.chat.id);

    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: chat.permissions
    });

    return ctx.reply(
      `🔊 <b>UNMUTED</b>\n\n` +
      `🎯 User: <a href="tg://user?id=${target.id}">${target.first_name}</a>\n\n` +
      `🚬 Gun: "Speak. Wisely."`,
      {
        parse_mode: "HTML",
        reply_to_message_id: replyId
      }
    );
  });

  /* ─────────────── UNMUTE CALLBACK ─────────────── */
  bot.action(/^unmute_(\d+)$/, async (ctx) => {
    const targetId = Number(ctx.match[1]);

    if (!(await isAdmin(ctx, ctx.from.id))) {
      return ctx.answerCbQuery("🚬 Gun: \"You lack authority.\"", {
        show_alert: true
      });
    }

    const chat = await ctx.telegram.getChat(ctx.chat.id);

    await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
      permissions: chat.permissions
    });

    await ctx.editMessageText(
      `${ctx.callbackQuery.message.text}\n\n` +
      `✅ <b>Unmuted by ${ctx.from.first_name}</b>`,
      { parse_mode: "HTML" }
    );

    return ctx.answerCbQuery("Unmuted successfully!");
  });
}