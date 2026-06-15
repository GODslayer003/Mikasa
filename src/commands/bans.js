import { parseDuration } from "../utils/timeParser.js";

const H = {
  welcome: "Nah, I'd win.",
  protected: "You're weak. My Infinity won't let you touch them.",
  selfBan: "Are you the strongest because you're Gojo Satoru? Or are you Gojo Satoru because you're the strongest?... Wrong. You're neither.",
  selfPunch: "You're not him.",
  bot: "I'm the strongest. Try me.",
  noUser: "I can't see the target. Maybe you need these? *points at blindfold*",
  notAdmin: "You don't have the authority to use my Domain Expansion.",
  botNotAdmin: "I need admin privileges to use my Domain Expansion.",
  botNoRestrict: "I can't restrict members. Give me the permission, or watch me struggle.",
  banned:
    "◈ <b>Domain Expansion</b>\n" +
    "◈ Unlimited Void\n\n" +
    "<b>{user}</b> has been sealed in infinite information.\n" +
    "<b>Reason:</b> {reason}",
  tempBanned:
    "◈ <b>Prison Realm</b>\n\n" +
    "<b>{user}</b> has been sealed for <b>{time}</b>.\n" +
    "Like Toji in the Prison Realm.",
  noTime: "You forgot to specify the time. How many seconds do you think I have?",
  badTime: "That's not a valid time format. Try <code>30m</code>, <code>2h</code>, or <code>1d</code>.",
  unban:
    "◈ <b>Reverse Cursed Technique</b>\n\n" +
    "<b>{user}</b> has been unsealed.\n" +
    "They can return to the world of jujutsu.",
  unbanNotFound: "They're not sealed here. My Six Eyes can see that much.",
  punch:
    "◈ <b>Cursed Technique</b>\n\n" +
    "<b>{user}</b> was dispatched.\n" +
    "Like a disaster curse.",
  punchme: "You really just punched yourself out... You're not him.",
  punchmeAdmin: "I can't punch an admin out. That'd be bad for the story.",
  error: "Tsk. Something went wrong. Even the strongest has off days."
};

function formatReason(r) {
  if (!r) return "No reason provided.";
  return r.length > 200 ? r.slice(0, 200) + "..." : r;
}

async function extractTarget(ctx) {
  const msg = ctx.message;
  const args = ctx.message.text.split(/\s+/).slice(1).filter(Boolean);

  if (msg.reply_to_message?.from) {
    const f = msg.reply_to_message.from;
    return { id: f.id, name: f.first_name || "User", reason: args.join(" ") };
  }

  if (msg.entities) {
    for (const ent of msg.entities) {
      if (ent.type === "text_mention" && ent.user) {
        const rest = msg.text.slice(ent.offset + ent.length).trim();
        return { id: ent.user.id, name: ent.user.first_name || "User", reason: rest };
      }
    }
  }

  if (args.length > 0) {
    const first = args[0];
    const num = Number(first);
    if (Number.isFinite(num)) {
      return { id: num, name: "User", reason: args.slice(1).join(" ") };
    }
  }

  return null;
}

async function botPerms(ctx) {
  try {
    const me = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
    if (me.status !== "administrator") return "notAdmin";
    if (!me.can_restrict_members) return "noRestrict";
    return "ok";
  } catch {
    return "notAdmin";
  }
}

async function isProtectedTarget(ctx, userId) {
  if (userId === ctx.botInfo.id) return true;
  try {
    const m = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ["creator", "administrator"].includes(m.status);
  } catch {
    return false;
  }
}

async function isCallerAdmin(ctx) {
  try {
    const m = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return ["creator", "administrator"].includes(m.status);
  } catch {
    return false;
  }
}

function del(ctx, mid) {
  try { ctx.telegram.deleteMessage(ctx.chat.id, mid); } catch { /* */ }
}

export function registerBans(bot) {
  bot.command(["ban", "sban"], async (ctx) => {
    try {
      if (!ctx.message || !ctx.from) return;
      if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return;

      const isSilent = ctx.message.text.startsWith("/s");

      if (!(await isCallerAdmin(ctx))) {
        return ctx.reply(H.notAdmin, { reply_to_message_id: ctx.message.message_id });
      }

      const perms = await botPerms(ctx);
      if (perms !== "ok") {
        return ctx.reply(perms === "notAdmin" ? H.botNotAdmin : H.botNoRestrict, { reply_to_message_id: ctx.message.message_id });
      }

      const t = await extractTarget(ctx);
      if (!t) return ctx.reply(H.noUser, { reply_to_message_id: ctx.message.message_id });

      if (t.id === ctx.from.id) return ctx.reply(H.selfBan, { reply_to_message_id: ctx.message.message_id });
      if (t.id === ctx.botInfo.id) return ctx.reply(H.bot, { reply_to_message_id: ctx.message.message_id });
      if (await isProtectedTarget(ctx, t.id)) return ctx.reply(H.protected, { reply_to_message_id: ctx.message.message_id });

      const reason = formatReason(t.reason);

      await ctx.telegram.banChatMember(ctx.chat.id, t.id);

      if (isSilent) {
        del(ctx, ctx.message.message_id);
        if (ctx.message.reply_to_message) del(ctx, ctx.message.reply_to_message.message_id);
        return;
      }

      await ctx.reply(
        H.banned.replace("{user}", t.name).replace("{reason}", reason),
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    } catch (err) {
      console.error("BAN ERROR:", err);
      try { await ctx.reply(H.error, { reply_to_message_id: ctx.message.message_id }); } catch { /* */ }
    }
  });

  bot.command("tban", async (ctx) => {
    try {
      if (!ctx.message || !ctx.from) return;
      if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return;

      if (!(await isCallerAdmin(ctx))) {
        return ctx.reply(H.notAdmin, { reply_to_message_id: ctx.message.message_id });
      }

      const perms = await botPerms(ctx);
      if (perms !== "ok") {
        return ctx.reply(perms === "notAdmin" ? H.botNotAdmin : H.botNoRestrict, { reply_to_message_id: ctx.message.message_id });
      }

      const t = await extractTarget(ctx);
      if (!t) return ctx.reply(H.noUser, { reply_to_message_id: ctx.message.message_id });
      if (t.id === ctx.from.id) return ctx.reply(H.selfBan, { reply_to_message_id: ctx.message.message_id });
      if (t.id === ctx.botInfo.id) return ctx.reply(H.bot, { reply_to_message_id: ctx.message.message_id });
      if (await isProtectedTarget(ctx, t.id)) return ctx.reply(H.protected, { reply_to_message_id: ctx.message.message_id });

      if (!t.reason) return ctx.reply(H.noTime, { reply_to_message_id: ctx.message.message_id });

      const parts = t.reason.split(/\s+/);
      const timeStr = parts[0];
      const secs = parseDuration(timeStr);
      if (!secs) return ctx.reply(H.badTime, { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id });

      const until = Math.floor(Date.now() / 1000) + secs;
      await ctx.telegram.banChatMember(ctx.chat.id, t.id, { until_date: until });

      await ctx.reply(
        H.tempBanned.replace("{user}", t.name).replace("{time}", timeStr),
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    } catch (err) {
      console.error("TBAN ERROR:", err);
      try { await ctx.reply(H.error, { reply_to_message_id: ctx.message.message_id }); } catch { /* */ }
    }
  });

  bot.command("unban", async (ctx) => {
    try {
      if (!ctx.message || !ctx.from) return;
      if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return;

      if (!(await isCallerAdmin(ctx))) {
        return ctx.reply(H.notAdmin, { reply_to_message_id: ctx.message.message_id });
      }

      const perms = await botPerms(ctx);
      if (perms !== "ok") {
        return ctx.reply(perms === "notAdmin" ? H.botNotAdmin : H.botNoRestrict, { reply_to_message_id: ctx.message.message_id });
      }

      const t = await extractTarget(ctx);
      if (!t) return ctx.reply(H.unbanNotFound, { reply_to_message_id: ctx.message.message_id });

      await ctx.telegram.unbanChatMember(ctx.chat.id, t.id);

      await ctx.reply(
        H.unban.replace("{user}", t.name),
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    } catch (err) {
      console.error("UNBAN ERROR:", err);
      try { await ctx.reply(H.error, { reply_to_message_id: ctx.message.message_id }); } catch { /* */ }
    }
  });

  bot.command("punch", async (ctx) => {
    try {
      if (!ctx.message || !ctx.from) return;
      if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return;

      if (!(await isCallerAdmin(ctx))) {
        return ctx.reply(H.notAdmin, { reply_to_message_id: ctx.message.message_id });
      }

      const perms = await botPerms(ctx);
      if (perms !== "ok") {
        return ctx.reply(perms === "notAdmin" ? H.botNotAdmin : H.botNoRestrict, { reply_to_message_id: ctx.message.message_id });
      }

      const t = await extractTarget(ctx);
      if (!t) return ctx.reply(H.noUser, { reply_to_message_id: ctx.message.message_id });
      if (t.id === ctx.from.id) return ctx.reply(H.selfPunch, { reply_to_message_id: ctx.message.message_id });
      if (t.id === ctx.botInfo.id) return ctx.reply(H.bot, { reply_to_message_id: ctx.message.message_id });
      if (await isProtectedTarget(ctx, t.id)) return ctx.reply(H.protected, { reply_to_message_id: ctx.message.message_id });

      await ctx.telegram.banChatMember(ctx.chat.id, t.id);
      await ctx.telegram.unbanChatMember(ctx.chat.id, t.id);

      await ctx.reply(
        H.punch.replace("{user}", t.name),
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    } catch (err) {
      console.error("PUNCH ERROR:", err);
      try { await ctx.reply(H.error, { reply_to_message_id: ctx.message.message_id }); } catch { /* */ }
    }
  });

  bot.command("punchme", async (ctx) => {
    try {
      if (!ctx.message || !ctx.from) return;
      if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return;

      const perms = await botPerms(ctx);
      if (perms !== "ok") {
        return ctx.reply(perms === "notAdmin" ? H.botNotAdmin : H.botNoRestrict, { reply_to_message_id: ctx.message.message_id });
      }

      if (await isProtectedTarget(ctx, ctx.from.id)) {
        return ctx.reply(H.punchmeAdmin, { reply_to_message_id: ctx.message.message_id });
      }

      await ctx.telegram.banChatMember(ctx.chat.id, ctx.from.id);
      await ctx.telegram.unbanChatMember(ctx.chat.id, ctx.from.id);

      await ctx.reply(H.punchme, { reply_to_message_id: ctx.message.message_id });
    } catch (err) {
      console.error("PUNCHME ERROR:", err);
      try { await ctx.reply(H.error, { reply_to_message_id: ctx.message.message_id }); } catch { /* */ }
    }
  });
}
