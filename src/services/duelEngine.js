// src/services/duelEngine.js
import { Duel } from "../models/Duel.js";
import { User } from "../models/User.js";
import { resolveDuel } from "./duelResolver.js";

export async function startTurn(ctx, duel) {
  const attackerId = duel.turn === 1 ? duel.challengerId : duel.opponentId;
  const defenderId = duel.turn === 1 ? duel.opponentId : duel.challengerId;

  const attacker = await User.findOne({ telegramId: attackerId });
  const defender = await User.findOne({ telegramId: defenderId });

  const atkChar = attacker.shadows[
    duel.turn === 1 ? duel.challengerCharIndex : duel.opponentCharIndex
  ];
  const defChar = defender.shadows[
    duel.turn === 1 ? duel.opponentCharIndex : duel.challengerCharIndex
  ];

  const damage = Math.max(
    5,
    atkChar.attack - defChar.defense * 0.4
  );

  if (duel.turn === 1) {
    duel.opponentHP -= damage;
  } else {
    duel.challengerHP -= damage;
  }

  duel.turn = duel.turn === 1 ? 2 : 1;

  await duel.save();

  await ctx.reply(
    `⚔️ ${atkChar.name} hits ${defChar.name}\n` +
    `💥 Damage: ${Math.floor(damage)}`
  );

  if (duel.challengerHP <= 0 || duel.opponentHP <= 0) {
    await resolveDuel(ctx, duel);
  }
}