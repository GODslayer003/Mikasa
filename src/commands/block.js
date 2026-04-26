// src/commands/block.js
import { Markup } from "telegraf";
import {
  blockedUsers,
  blockCooldowns,
  playerDownCooldowns
} from "../game/state.js";
import { replyToUser } from "../utils/reply.js";

export function blockCommand(bot) {
  bot.command("block", async (ctx) => {
    const player = ctx.player;
    const userId = player.telegramId;
    const now = Math.floor(Date.now() / 1000);
    const mention = `<a href="tg://user?id=${userId}">${ctx.from.first_name}</a>`;

    // Down check
    if (
      playerDownCooldowns.has(userId) &&
      now < playerDownCooldowns.get(userId)
    ) {
      const mins = Math.ceil((playerDownCooldowns.get(userId) - now) / 60);
      return replyToUser(
        ctx,
        `💀 ${mention}, you are down!\n⏳ Recover in ${mins} minute(s).`
      );
    }

    if (blockedUsers.has(userId)) {
      return replyToUser(
        ctx,
        `🛡️ ${mention}, your <b>Shoulder Shield</b> is already active.`
      );
    }

    if (blockCooldowns.has(userId) && now < blockCooldowns.get(userId)) {
      const mins = Math.ceil((blockCooldowns.get(userId) - now) / 60);
      return replyToUser(
        ctx,
        `⏳ ${mention}, shield recharging.\n🕒 ${mins} minute(s) remaining.`
      );
    }

    blockedUsers.add(userId);
    player.blockStatus = "Immune";
    await player.save();

    return replyToUser(
      ctx,
      `🛡️ ${mention} summons a <b>Shoulder Shield</b>!\n` +
      `You are now <b>Immune</b> to attacks.\n\n` +
      `⚔️ Drop it anytime using <b>/unleash</b>.`,
      {
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback("Unleash ⚔️", `unleash_${userId}`)
        ])
      }
    );
  });
}