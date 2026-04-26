// src/services/duelResolver.js
import { Duel } from "../models/Duel.js";
import { User } from "../models/User.js";

export async function resolveDuel(ctx, duel) {
  const winnerId =
    duel.challengerHP > 0 ? duel.challengerId : duel.opponentId;
  const loserId =
    duel.challengerHP > 0 ? duel.opponentId : duel.challengerId;

  const winner = await User.findOne({ telegramId: winnerId });
  const loser = await User.findOne({ telegramId: loserId });

  // reward
  winner.balance += 10000;

  // remove losing character
  const losingIndex =
    loserId === duel.challengerId
      ? duel.challengerCharIndex
      : duel.opponentCharIndex;

  loser.shadows.splice(losingIndex, 1);

  await winner.save();
  await loser.save();

  await Duel.deleteOne({ duelId: duel.duelId });

  await ctx.reply(
    `🏆 DUEL FINISHED\n\n` +
    `Winner: ${winner.firstName}\n` +
    `💰 +10,000 Moon Coins\n\n` +
    `💀 Loser lost their character.`,
    { parse_mode: "HTML" }
  );
}