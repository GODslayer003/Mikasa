import { parseDuration } from "../utils/timeParser.js";

const H = {
  noUser: "Finger missing. I can't see a target to curse.",
  notAdmin: "You don't have the authority to command the King of Curses.",
  botNotAdmin: "Tsk. Give me admin rights, or watch me do nothing.",
  botNoRestrict: "I can't restrict anyone. Even a cursed finger has more power than this permission set.",
  protected: "That one belongs to someone else. Even I have standards.",
  self: "You want me to mute you? Fine by me. But it'll be boring.",
  bot: "You're trying to mute the King of Curses? Ha.",
  alreadyMuted: "They're already silenced. My shrine is already open.",
  notMuted: "They can already speak. Don't waste my time.",
  notInChat: "They're not even here. Useless.",
  muted:
    "◈ <b>Malevolent Shrine</b>\n" +
    "◈ Dismantle\n\n" +
    "<b>{user}</b> has been silenced.\n" +
    "<b>Reason:</b> {reason}",
  tempMuted:
    "◈ <b>Malevolent Shrine</b>\n" +
    "◈ Cleave\n\n" +
    "<b>{user}</b> silenced for <b>{time}</b>.",
  noTime: "You forgot the time. How long do you want them gone?",
  badTime: "That's not a valid time. Try <code>30m</code>, <code>2h</code>, or <code>1d</code>.",
  unmuted:
    "◈ <b>Rebuild</b>\n\n" +
    "<b>{user}</b> has been granted the right to speak again.\n" +
    "Don't make me open my Domain again.",
  error: "Tsk. Even my Domain Expansion failed. Try again."
};

function formatReason(r) {
  if (!r) return "No reason given.";
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
    const num = Number(args[0]);
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

async function isProtected(ctx, userId) {
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

const MUTE_PERMS = {
  can_send_messages: false,
  can_send_media_messages: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_send_polls: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false
};

const UNMUTE_PERMS = {
  can_send_messages: true,
  can_send_media_messages: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
  can_send_polls: true,
  can_change_info: true,
  can_invite_users: true,
  can_pin_messages: true
};

export function registerMutes(bot) {
  bot.command(["mute", "smute"], async (ctx) => {
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
      if (t.id === ctx.from.id) return ctx.reply(H.self, { reply_to_message_id: ctx.message.message_id });
      if (t.id === ctx.botInfo.id) return ctx.reply(H.bot, { reply_to_message_id: ctx.message.message_id });
      if (await isProtected(ctx, t.id)) return ctx.reply(H.protected, { reply_to_message_id: ctx.message.message_id });

      let member;
      try { member = await ctx.telegram.getChatMember(ctx.chat.id, t.id); } catch { return ctx.reply(H.noUser, { reply_to_message_id: ctx.message.message_id }); }

      if (member.can_send_messages === false) {
        return ctx.reply(H.alreadyMuted, { reply_to_message_id: ctx.message.message_id });
      }

      await ctx.telegram.restrictChatMember(ctx.chat.id, t.id, { permissions: MUTE_PERMS });

      await ctx.reply(
        H.muted.replace("{user}", t.name).replace("{reason}", formatReason(t.reason)),
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    } catch (err) {
      console.error("MUTE ERROR:", err);
      try { await ctx.reply(H.error, { reply_to_message_id: ctx.message.message_id }); } catch { /* */ }
    }
  });

  bot.command(["tmute", "tempmute"], async (ctx) => {
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
      if (t.id === ctx.from.id) return ctx.reply(H.self, { reply_to_message_id: ctx.message.message_id });
      if (t.id === ctx.botInfo.id) return ctx.reply(H.bot, { reply_to_message_id: ctx.message.message_id });
      if (await isProtected(ctx, t.id)) return ctx.reply(H.protected, { reply_to_message_id: ctx.message.message_id });

      let member;
      try { member = await ctx.telegram.getChatMember(ctx.chat.id, t.id); } catch { return ctx.reply(H.noUser, { reply_to_message_id: ctx.message.message_id }); }

      if (!t.reason) return ctx.reply(H.noTime, { reply_to_message_id: ctx.message.message_id });

      const parts = t.reason.split(/\s+/);
      const timeStr = parts[0];
      const secs = parseDuration(timeStr);
      if (!secs) return ctx.reply(H.badTime, { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id });

      if (member.can_send_messages === false) {
        return ctx.reply(H.alreadyMuted, { reply_to_message_id: ctx.message.message_id });
      }

      const until = Math.floor(Date.now() / 1000) + secs;
      await ctx.telegram.restrictChatMember(ctx.chat.id, t.id, {
        permissions: MUTE_PERMS,
        until_date: until
      });

      await ctx.reply(
        H.tempMuted.replace("{user}", t.name).replace("{time}", timeStr),
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    } catch (err) {
      console.error("TMUTE ERROR:", err);
      try { await ctx.reply(H.error, { reply_to_message_id: ctx.message.message_id }); } catch { /* */ }
    }
  });

  bot.command("unmute", async (ctx) => {
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

      let member;
      try { member = await ctx.telegram.getChatMember(ctx.chat.id, t.id); } catch { return ctx.reply(H.notInChat, { reply_to_message_id: ctx.message.message_id }); }

      if (member.status === "kicked" || member.status === "left") {
        return ctx.reply(H.notInChat, { reply_to_message_id: ctx.message.message_id });
      }

      if (member.can_send_messages !== false) {
        return ctx.reply(H.notMuted, { reply_to_message_id: ctx.message.message_id });
      }

      await ctx.telegram.restrictChatMember(ctx.chat.id, t.id, { permissions: UNMUTE_PERMS });

      await ctx.reply(
        H.unmuted.replace("{user}", t.name),
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    } catch (err) {
      console.error("UNMUTE ERROR:", err);
      try { await ctx.reply(H.error, { reply_to_message_id: ctx.message.message_id }); } catch { /* */ }
    }
  });
}
