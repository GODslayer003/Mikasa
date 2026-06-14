import { User } from "../models/User.js";
import { getDojkaQuote } from "../services/dojkaAssets.js";

const REASON_MAX = 100;

function formatDuration(seconds) {
  if (seconds < 60) return "just now";
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return `${m}m ago`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m ago`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d}d ${h}h ago`;
}

const BACK_PHRASES = [
  "✦ {name} has returned to the scenario.",
  "✦ {name} is back in the Star Stream.",
  "✦ The story continues — {name} has rejoined.",
  "✦ {name} is no longer AFK.",
  "✦ Welcome back, {name}.",
  "✦ {name} has logged back into the scenario.",
  "✦ {name} is back. Don't keep the constellations waiting.",
  "✦ {name} has returned from the void.",
  "✦ {name} is back in the chat. Probability restored.",
  "✦ A reader has returned. Turn the page — {name} is here.",
  "✦ {name} is no longer away. Resume your story.",
  "✦ {name} woke up. The scenarios can continue."
];

function getAfkReply(user, firstName) {
  const elapsed = Math.floor(Date.now() / 1000) - (user.afkSince || 0);
  const timeStr = formatDuration(elapsed);

  if (user.afkReason) {
    return (
      `╔══════════════════════════════╗\n` +
      `║      ✦   A F K   ✦         ║\n` +
      `╠══════════════════════════════╣\n` +
      `║                              ║\n` +
      `║  🌙  <b>${firstName}</b> is away.    ║\n` +
      `║                              ║\n` +
      `║  ─ Reason ─                  ║\n` +
      `║  <code>${user.afkReason}</code>            ║\n` +
      `║                              ║\n` +
      `║  ⏰ ${timeStr}                ║\n` +
      `║                              ║\n` +
      `╚══════════════════════════════╝`
    );
  }

  return (
    `╔══════════════════════════════╗\n` +
    `║      ✦   A F K   ✦         ║\n` +
    `╠══════════════════════════════╣\n` +
    `║                              ║\n` +
    `║  🌙  <b>${firstName}</b> is away.    ║\n` +
    `║                              ║\n` +
    `║  ⏰ ${timeStr}                ║\n` +
    `║                              ║\n` +
    `╚══════════════════════════════╝`
  );
}

export function registerAfk(bot) {
  // ─── /afk <reason> ────────────────────────────────
  bot.command("afk", async (ctx) => {
    try {
      if (!ctx.from || !ctx.message) return;
      if (ctx.from.is_bot) return;
      if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") return;

      const text = ctx.message.text;
      const parts = text.split(/\s+/);
      let reason = parts.slice(1).join(" ").trim();
      let notice = "";

      if (reason.length > REASON_MAX) {
        reason = reason.slice(0, REASON_MAX);
        notice = "\n\nYour AFK reason was shortened to 100 characters.";
      }

      const userId = ctx.from.id;
      const firstName = ctx.from.first_name || "User";

      await User.updateOne(
        { telegramId: userId },
        {
          $set: {
            isAfk: true,
            afkReason: reason || null,
            afkSince: Math.floor(Date.now() / 1000),
            lastSeenAt: Math.floor(Date.now() / 1000)
          },
          $setOnInsert: {
            firstName,
            telegramId: userId
          }
        },
        { upsert: true }
      );

      const msg = reason
        ? `🌙 <b>${firstName}</b> is now AFK.\nReason: <code>${reason}</code>${notice}`
        : `🌙 <b>${firstName}</b> is now AFK.${notice}`;

      await ctx.reply(msg, {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message.message_id
      });
    } catch (err) {
      console.error("AFK COMMAND ERROR:", err);
    }
  });

  // ─── brb <reason> (text trigger) ──────────────────
  bot.hears(/^brb\b/i, async (ctx) => {
    try {
      if (!ctx.from || !ctx.message) return;
      if (ctx.from.is_bot) return;
      if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") return;

      const text = ctx.message.text;
      const parts = text.split(/\s+/);
      let reason = parts.slice(1).join(" ").trim();
      let notice = "";

      if (reason.length > REASON_MAX) {
        reason = reason.slice(0, REASON_MAX);
        notice = "\n\nYour AFK reason was shortened to 100 characters.";
      }

      const userId = ctx.from.id;
      const firstName = ctx.from.first_name || "User";

      await User.updateOne(
        { telegramId: userId },
        {
          $set: {
            isAfk: true,
            afkReason: reason || null,
            afkSince: Math.floor(Date.now() / 1000),
            lastSeenAt: Math.floor(Date.now() / 1000)
          },
          $setOnInsert: {
            firstName,
            telegramId: userId
          }
        },
        { upsert: true }
      );

      const msg = reason
        ? `🌙 <b>${firstName}</b> is now AFK.\nReason: <code>${reason}</code>${notice}`
        : `🌙 <b>${firstName}</b> is now AFK.${notice}`;

      await ctx.reply(msg, {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message.message_id
      });
    } catch (err) {
      console.error("AFK BRB ERROR:", err);
    }
  });

  // ─── Auto-remove AFK + mention reply ──────────────
  // Must be registered AFTER the afk/brb handlers so it
  // does not fire on those messages.
  bot.on("message", async (ctx, next) => {
    try {
      if (!ctx.from || !ctx.message) return next();
      if (ctx.from.is_bot) return next();
      if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") return next();

      const userId = ctx.from.id;
      const now = Math.floor(Date.now() / 1000);

      // ── Auto-remove AFK ──────────────────────────
      // Only run for the message author, skip if it's a
      // new-chat-member event.
      if (!ctx.message.new_chat_members) {
        const result = await User.findOneAndUpdate(
          { telegramId: userId, isAfk: true },
          {
            $set: {
              isAfk: false,
              afkSince: 0,
              lastSeenAt: now
            },
            $unset: { afkReason: "" }
          },
          { new: true }
        );

        if (result) {
          const firstName = result.firstName || ctx.from.first_name || "User";
          const phrase = BACK_PHRASES[Math.floor(Math.random() * BACK_PHRASES.length)];
          await ctx.reply(
            phrase.replace("{name}", firstName),
            { reply_to_message_id: ctx.message.message_id }
          );
        }
      }

      // ── AFK mention/reply check ──────────────────
      const checked = new Set();
      const checkUser = async (targetId, targetName) => {
        if (checked.has(targetId)) return;
        if (targetId === userId) return;
        checked.add(targetId);

        const target = await User.findOne({ telegramId: targetId, isAfk: true });
        if (!target) return;

        const afkMsg = getAfkReply(target, targetName);
        await ctx.reply(afkMsg, {
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        });
      };

      // Check replied-to user
      if (ctx.message.reply_to_message?.from) {
        const rpl = ctx.message.reply_to_message.from;
        if (!rpl.is_bot) {
          await checkUser(rpl.id, rpl.first_name || "User");
        }
      }

      // Check @mentions and text mentions
      if (ctx.message.entities) {
        for (const entity of ctx.message.entities) {
          if (entity.type === "mention") {
            const mentionText = ctx.message.text.slice(
              entity.offset,
              entity.offset + entity.length
            );
            const mentionedUser = await User.findOne({ username: mentionText.replace("@", "") });
            if (mentionedUser) {
              await checkUser(
                mentionedUser.telegramId,
                mentionedUser.firstName || "User"
              );
            }
          } else if (entity.type === "text_mention" && entity.user) {
            await checkUser(entity.user.id, entity.user.first_name || "User");
          }
        }
      }
    } catch (err) {
      console.error("AFK AUTO/MENTION ERROR:", err);
    }

    return next();
  });
}
