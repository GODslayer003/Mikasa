// src/commands/unleash.js
import {
  blockedUsers,
  blockCooldowns
} from "../game/state.js";
import { replyToUser } from "../utils/reply.js";

const BLOCK_COOLDOWN = 600;

async function unleash(player, ctx, isCallback = false) {
  const userId = player.telegramId;
  const now = Math.floor(Date.now() / 1000);
  const mention = `<a href="tg://user?id=${userId}">${ctx.from.first_name}</a>`;

  if (!blockedUsers.has(userId)) {
    if (isCallback) {
      return ctx.answerCbQuery("Shield already dropped!");
    }
    return replyToUser(ctx, `😅 ${mention}, no shield is active.`);
  }

  blockedUsers.delete(userId);
  blockCooldowns.set(userId, now + BLOCK_COOLDOWN);
  player.blockStatus = "UnImmune";
  await player.save();

  if (isCallback) {
    await ctx.editMessageText(
      `⚔️ ${mention} shatters their <b>Shoulder Shield</b>!\n⏳ Cooldown: 10 minutes.`,
      { parse_mode: "HTML" }
    );
    return ctx.answerCbQuery("Shield dropped!");
  }

  return replyToUser(
    ctx,
    `⚔️ ${mention} drops their <b>Shoulder Shield</b>!\n⏳ Cooldown: 10 minutes.`
  );
}

export function unleashCommand(bot) {
  bot.command("unleash", async (ctx) => unleash(ctx.player, ctx, false));

  bot.action(/^unleash_(\d+)$/, async (ctx) => {
    const targetId = Number(ctx.match[1]);
    if (ctx.from.id !== targetId) {
      return ctx.answerCbQuery("Not your shield!", { show_alert: true });
    }
    return unleash(ctx.player, ctx, true);
  });
}