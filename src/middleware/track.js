import { User } from "../models/User.js";
import { Chat } from "../models/Chat.js";

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
            firstSeenAt: now
          }
        },
        { upsert: true }
      );
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