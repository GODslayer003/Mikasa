export function noBotTargets(ctx, next) {
  const replyUser = ctx.message?.reply_to_message?.from;

  if (replyUser?.is_bot) {
    return ctx.reply("❌ You cannot interact with bots, kid.");
  }

  return next();
}