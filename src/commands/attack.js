// src/commands/attack.js
import {
  blockedUsers,
  attackCooldowns,
  playerDownCooldowns
} from "../game/state.js";
import { getHealthBar } from "../utils/healthBar.js";
import { replyToUser } from "../utils/reply.js";

export function attackCommand(bot) {
  bot.command("attack", async (ctx) => {
    const mention = `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;

    // Must reply to someone
    if (!ctx.message.reply_to_message) {
      return replyToUser(ctx, `🎯 ${mention}, reply to someone to attack.`);
    }

    const attacker = ctx.player;
    const defender = ctx.message.reply_to_message.player;

    if (!defender) {
      return replyToUser(ctx, `⚠️ ${mention}, target not initialized.`);
    }

    if (attacker.telegramId === defender.telegramId) {
      return replyToUser(ctx, `🤔 ${mention}, you can’t attack yourself.`);
    }

    const now = Math.floor(Date.now() / 1000);

    if (blockedUsers.has(defender.telegramId)) {
      return replyToUser(
        ctx,
        `🛡️ ${mention}, your attack was blocked by a shield!`
      );
    }

    const success = Math.random() < 0.8;
    let resultText;

    if (success) {
      const damage = Math.random() < 0.2 ? 10 : 5;
      defender.hp = Math.max(0, defender.hp - damage);
      attacker.successfulAttacks++;

      resultText = `⚔️ ${mention} lands a hit! (-${damage} HP)`;
    } else {
      defender.hp = Math.min(100, defender.hp + 5);
      attackCooldowns.set(attacker.telegramId, now + 180);

      resultText = `🛡️ ${mention}, your attack failed!`;
    }

    if (defender.hp <= 0) {
      playerDownCooldowns.set(defender.telegramId, now + 86400);
      resultText += `\n💀 Defender is DOWN for 24 hours!`;
    }

    await attacker.save();
    await defender.save();

    return replyToUser(
      ctx,
      `${resultText}\n\n🩺 HP: ${getHealthBar(defender.hp)} (${defender.hp}/100)`
    );
  });
}