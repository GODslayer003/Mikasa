// src/commands/choose.js
import { Duel } from "../models/Duel.js";
import { User } from "../models/User.js";
import { startTurn } from "../services/duelEngine.js";

export function chooseCommand(bot) {
  bot.command("choose", async (ctx) => {
    const index = Number(ctx.message.text.split(" ")[1]) - 1;
    if (isNaN(index)) return ctx.reply("❌ Usage: /choose <number>");

    const duel = await Duel.findOne({
      status: "active",
      $or: [
        { challengerId: ctx.from.id },
        { opponentId: ctx.from.id }
      ]
    });

    if (!duel) return ctx.reply("❌ No active duel.");

    const user = await User.findOne({ telegramId: ctx.from.id });
    const character = user.shadows[index];
    if (!character) return ctx.reply("❌ Invalid character.");

    if (ctx.from.id === duel.challengerId) {
      duel.challengerCharIndex = index;
      duel.challengerHP = character.hp;
    } else {
      duel.opponentCharIndex = index;
      duel.opponentHP = character.hp;
    }

    await duel.save();

    if (
      duel.challengerCharIndex !== undefined &&
      duel.opponentCharIndex !== undefined
    ) {
      await startTurn(ctx, duel);
    } else {
      ctx.reply("✅ Character locked. Waiting for opponent...");
    }
  });
}