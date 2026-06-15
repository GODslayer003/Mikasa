import { User } from "../models/User.js";

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
  "蛊 {name} has emerged from seclusion, a new Gu refined.",
  "蛊 {name} returns — the path of cultivation continues.",
  "蛊 {name} has finished their secluded cultivation and rejoins the world.",
  "蛊 The Gu have been tamed — {name} is back.",
  "蛊 {name} returns from the mountains, their Dao strengthened.",
  "蛊 A period of meditation complete — {name} has returned.",
  "蛊 {name} steps back into the mortal realm, Gu in hand.",
  "蛊 The teachings persist — {name} has returned from cultivation.",
  "蛊 {name} is no longer in seclusion. The world awaits.",
  "蛊 Having gained insight, {name} returns from their journey.",
  "蛊 {name} returns, will unshaken, Gu ready.",
  "蛊 Another cycle of cultivation complete — {name} has returned."
];

function getAfkReply(user, firstName) {
  const elapsed = Math.floor(Date.now() / 1000) - (user.afkSince || 0);
  const timeStr = formatDuration(elapsed);

  if (user.afkReason) {
    return (
      `𖤍 <b>${firstName}</b> is in secluded cultivation.\n` +
      `<b>Reason:</b> <code>${user.afkReason}</code>\n` +
      `⏰ ${timeStr}`
    );
  }

  return (
    `𖤍 <b>${firstName}</b> is in secluded cultivation.\n` +
    `⏰ ${timeStr}`
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
        ? `𖤍 <b>${firstName}</b> has entered secluded cultivation.\n<b>Reason:</b> <code>${reason}</code>${notice}`
        : `𖤍 <b>${firstName}</b> has entered secluded cultivation.${notice}`;

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
        ? `𖤍 <b>${firstName}</b> has entered secluded cultivation.\n<b>Reason:</b> <code>${reason}</code>${notice}`
        : `𖤍 <b>${firstName}</b> has entered secluded cultivation.${notice}`;

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
