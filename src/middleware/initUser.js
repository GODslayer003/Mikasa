import { User } from "../models/User.js";

export async function initUser(ctx, next) {
  // No Telegram user → ignore
  if (!ctx.from) return;

  // Ignore bots globally
  if (ctx.from.is_bot) return;

  let user = await User.findOne({ telegramId: ctx.from.id });

  if (!user) {
    user = await User.create({
      telegramId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      hp: 100,
      level: 1,
      stars: 0,
      balance: 1000,
      moons: 1000,
      successfulAttacks: 0,
      totalAttacks: 0,
      blockStatus: "UnImmune"
    });
  }

  // Attach user to context (VERY IMPORTANT)
  ctx.player = user;

  return next();
}
