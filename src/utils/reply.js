export async function replyToUser(ctx, text, extra = {}) {
  return ctx.telegram.sendMessage(
    ctx.chat.id,
    text,
    {
      parse_mode: "HTML",
      reply_to_message_id: ctx.message?.message_id,
      ...extra
    }
  );
}