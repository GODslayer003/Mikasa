// src/commands/warn.js
import { Markup } from "telegraf";
import { warnData } from "../game/warnState.js";
import { isAdmin } from "../utils/adminCheck.js";

const MAX_WARNS = 3;
const SUDOERS = [
  "ThyMonster",
  "RiverSung",
  "ThyFang",
  "ThyDivine",
  "ThyDemise"
];

export function warnCommand(bot) {

  /* ─────────────── WARN / DWARN ─────────────── */
  bot.command(["warn", "dwarn"], async (ctx) => {
    const replyId = ctx.message.message_id;
    const issuer = ctx.from;

    if (ctx.chat.type === "private") {
      return ctx.reply("🚬 Gun: \"This works only in groups.\"", {
        reply_to_message_id: replyId
      });
    }

    if (!(await isAdmin(ctx, issuer.id))) {
      return ctx.reply("🚫 You lack authority.", {
        reply_to_message_id: replyId
      });
    }

    const target =
      ctx.message.reply_to_message?.from ||
      ctx.message.entities?.find(e => e.type === "text_mention")?.user;

    if (!target) {
      return ctx.reply(
        "🚬 Gun: \"Who needs a warning? Reply or mention.\"",
        { reply_to_message_id: replyId }
      );
    }

    if (target.id === ctx.botInfo.id) {
      return ctx.reply("🚬 Gun: \"I don't warn myself.\"", {
        reply_to_message_id: replyId
      });
    }

    if (SUDOERS.includes(target.username)) {
      return ctx.reply("🚬 Gun: \"Can't warn the elites.\"", {
        reply_to_message_id: replyId
      });
    }

    if (await isAdmin(ctx, target.id)) {
      return ctx.reply("🚬 Gun: \"Can't warn another admin.\"", {
        reply_to_message_id: replyId
      });
    }

    const chatId = ctx.chat.id;
    const userId = target.id;

    if (!warnData.has(chatId)) {
      warnData.set(chatId, new Map());
    }

    const chatWarns = warnData.get(chatId);
    const currentWarns = chatWarns.get(userId) || 0;
    const newWarns = currentWarns + 1;

    // Delete message if dwarn
    if (
      ctx.message.text.startsWith("/dwarn") &&
      ctx.message.reply_to_message
    ) {
      try {
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          ctx.message.reply_to_message.message_id
        );
      } catch {}
    }

    const mentionTarget = `<a href="tg://user?id=${userId}">${target.first_name}</a>`;
    const mentionIssuer = `<a href="tg://user?id=${issuer.id}">${issuer.first_name}</a>`;
    const reason =
      ctx.message.text.split(" ").slice(1).join(" ") || "No reason given";

    /* ───────────── AUTO BAN ───────────── */
    if (newWarns >= MAX_WARNS) {
      try {
        await ctx.telegram.banChatMember(ctx.chat.id, userId);
        chatWarns.set(userId, 0);

        return ctx.reply(
          `🔨 <b>AUTO-BAN</b>\n\n` +
          `🎯 Target: ${mentionTarget}\n` +
          `⚠️ Warns: 3/3\n\n` +
          `🚬 Gun: "Three strikes. You're out."`,
          {
            parse_mode: "HTML",
            reply_to_message_id: replyId
          }
        );
      } catch (err) {
        return ctx.reply(
          `🚬 Gun: "Ban failed. ${err.message}"`,
          { reply_to_message_id: replyId }
        );
      }
    }

    /* ───────────── NORMAL WARN ───────────── */
    chatWarns.set(userId, newWarns);

    return ctx.reply(
      `⚠️ <b>WARNING ISSUED</b>\n\n` +
      `🎯 Target: ${mentionTarget}\n` +
      `👮 Enforcer: ${mentionIssuer}\n` +
      `📝 Reason: ${reason}\n` +
      `⚠️ Warns: ${newWarns}/3\n\n` +
      `🚬 Gun: "${MAX_WARNS - newWarns} more and you're done."`,
      {
        parse_mode: "HTML",
        reply_to_message_id: replyId,
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback("❌ Remove Warn", `unwarn_${chatId}_${userId}`)
        ])
      }
    );
  });

  /* ─────────────── UNWARN CALLBACK ─────────────── */
  bot.action(/^unwarn_(\-?\d+)_(\d+)$/, async (ctx) => {
    const chatId = Number(ctx.match[1]);
    const userId = Number(ctx.match[2]);

    if (!(await isAdmin(ctx, ctx.from.id))) {
      return ctx.answerCbQuery(
        "🚬 Gun: \"You lack authority.\"",
        { show_alert: true }
      );
    }

    if (!warnData.has(chatId)) {
      return ctx.answerCbQuery("No warnings found.", { show_alert: true });
    }

    const chatWarns = warnData.get(chatId);
    const current = chatWarns.get(userId) || 0;

    if (current <= 0) {
      return ctx.answerCbQuery("User has no warnings.", { show_alert: true });
    }

    chatWarns.set(userId, current - 1);

    await ctx.editMessageText(
      `${ctx.callbackQuery.message.text}\n\n` +
      `✅ <b>Warning removed by ${ctx.from.first_name}</b>\n` +
      `⚠️ Current Warns: ${current - 1}/3`,
      { parse_mode: "HTML" }
    );

    return ctx.answerCbQuery("Warning removed!");
  });

  /* ─────────────── RMWARNS ─────────────── */
  bot.command("rmwarns", async (ctx) => {
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
        "🚬 Gun: \"Whose slate gets cleaned?\"",
        { reply_to_message_id: replyId }
      );
    }

    const chatId = ctx.chat.id;

    if (!warnData.has(chatId)) warnData.set(chatId, new Map());
    warnData.get(chatId).set(target.id, 0);

    return ctx.reply(
      `✅ <b>WARNINGS CLEARED</b>\n\n` +
      `🎯 User: <a href="tg://user?id=${target.id}">${target.first_name}</a>\n\n` +
      `🚬 Gun: "Clean slate. Don't mess it up."`,
      {
        parse_mode: "HTML",
        reply_to_message_id: replyId
      }
    );
  });

  /* ─────────────── WARNS ─────────────── */
  bot.command("warns", async (ctx) => {
    const replyId = ctx.message.message_id;

    const target =
      ctx.message.reply_to_message?.from ||
      ctx.message.entities?.find(e => e.type === "text_mention")?.user;

    if (!target) {
      return ctx.reply(
        "🚬 Gun: \"Who am I checking?\"",
        { reply_to_message_id: replyId }
      );
    }

    const chatWarns = warnData.get(ctx.chat.id);
    const warns = chatWarns?.get(target.id) || 0;

    const gunLine =
      warns === 0
        ? '🚬 Gun: "Clean record."'
        : `🚬 Gun: "${MAX_WARNS - warns} more and you're banned."`;

    return ctx.reply(
      `⚠️ <b>WARNING STATUS</b>\n\n` +
      `🎯 User: <a href="tg://user?id=${target.id}">${target.first_name}</a>\n` +
      `⚠️ Warns: ${warns}/3\n\n` +
      gunLine,
      {
        parse_mode: "HTML",
        reply_to_message_id: replyId
      }
    );
  });
}