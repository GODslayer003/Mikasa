import { replyToUser } from "../utils/reply.js";

export function helpCommand(bot) {
  bot.command("help", async (ctx) => {
    const helpMessage = `
<b>Frontera Estate Commands</b>

<b>Economy & Profile</b>
• /start - Register with Lloyd's estate.
• /rank - View your RP, rank, HP, workers, and game stats.
• /collect - Claim passive RP from workers.
• /lullaby - Restore worker morale after a strike.
• /gg - View your game ledger and top winners.

<b>Combat & Defense</b>
• /shovel - Reply to a user to deal HP damage.
• /javier - Summon Javier for protection.
• /unleash - Dismiss Javier and become vulnerable.
• /scam - Reply to a user to start worker PvP RP theft.

<b>Workers & Shop</b>
• /worker - Hire a random worker.
• /workers - Browse your workforce.
• /shop - Buy estate items with RP.

<b>Group Game</b>
• /bonus - Start The Frontera Bonus.
• /fstart - Force-start a lobby with 3+ players.

<i>Water is good. Lloyd is water. Lloyd is good.</i>`;

    await replyToUser(ctx, helpMessage);
  });
}
