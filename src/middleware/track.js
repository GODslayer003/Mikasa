import { User } from "../models/User.js";
import { Chat } from "../models/Chat.js";
import { GroupMember } from "../models/GroupMember.js";

export async function trackActivity(ctx, next) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // ---- USER TRACKING ----
    if (ctx.from) {
      await User.updateOne(
        { telegramId: ctx.from.id },
        {
          $set: {
            username: ctx.from.username || null,
            firstName: ctx.from.first_name || null,
            lastSeenAt: now
          },
          $setOnInsert: {
            telegramId: ctx.from.id,
            balance: 1000,
            moons: 1000,
            firstSeenAt: now
          }
        },
        { upsert: true }
      );
    }
    
    // ---- GROUP MEMBER TRACKING ----
    if (ctx.from && ctx.chat && (ctx.chat.type === "group" || ctx.chat.type === "supergroup")) {
      await GroupMember.updateOne(
        { userId: ctx.from.id, groupId: ctx.chat.id },
        {
          $set: {
            firstName: ctx.from.first_name || null,
            username: ctx.from.username || null,
            lastSeenAt: new Date()
          }
        },
        { upsert: true }
      ).catch(e => console.error("GroupMember tracking error:", e));
    }


    // ---- CHAT / GROUP TRACKING ----
    if (ctx.chat) {
      await Chat.updateOne(
        { chatId: ctx.chat.id },
        {
          $set: {
            type: ctx.chat.type,
            title: ctx.chat.title || null,
            username: ctx.chat.username || null,
            lastSeenAt: now
          },
          $setOnInsert: {
            chatId: ctx.chat.id,
            firstSeenAt: now
          }
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error("Tracking error:", err);
  }

  return next();
}
