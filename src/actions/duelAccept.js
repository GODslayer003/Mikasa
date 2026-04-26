// src/actions/duelAccept.js
import { Duel } from "../models/Duel.js";

export function duelAcceptActions(bot) {
  bot.action(/^duel_accept:(.+)/, async (ctx) => {
    const duel = await Duel.findOne({ duelId: ctx.match[1] });

    if (!duel || duel.status !== "pending") {
      return ctx.answerCbQuery("Duel expired.");
    }

    if (ctx.from.id !== duel.opponentId) {
      return ctx.answerCbQuery("Not your duel.", { show_alert: true });
    }

    duel.status = "active";
    duel.turn = 1;
    await duel.save();

    await ctx.editMessageText(
      "⚔️ Duel accepted!\n\n" +
      "Both players must choose a character:\n" +
      "Use `/choose <number>`",
      { parse_mode: "Markdown" }
    );
  });

  bot.action(/^duel_decline:(.+)/, async (ctx) => {
    await Duel.deleteOne({ duelId: ctx.match[1] });
    await ctx.editMessageText("❌ Duel declined.");
  });
}