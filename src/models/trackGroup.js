import { Group } from "../models/Group.js";

export async function trackGroup(ctx, next) {
  if (!ctx.chat || ctx.chat.type === "private") return next();

  let group = await Group.findOne({ chatId: ctx.chat.id });

  if (!group) {
    group = await Group.create({
      chatId: ctx.chat.id,
      title: ctx.chat.title,
      type: ctx.chat.type,
      membersSeen: 0,
      firstSeenAt: new Date(),
      lastActiveAt: new Date()
    });
  }

  group.lastActiveAt = new Date();
  await group.save();

  return next();
}