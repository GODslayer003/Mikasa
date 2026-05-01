// src/commands/help.js
import { replyToUser } from "../utils/reply.js";

export function helpCommand(bot) {
    bot.command("help", async (ctx) => {
        const helpMessage = `
<b>🤖 MONSTER BOT COMMANDS</b>

<b>🌟 GENERAL</b>
• /start - Begin your journey.
• /help - Show this message.
• /profile - View your stats.
• /topper - Global leaderboard.

<b>⚔️ COMBAT & POWER</b>
• /train - Level up your power.
• /tatakae - Fight for glory.
• /warriors - Top 5 battle warriors.
• /duel - Challenge a player.
• /arise - Awaken inner power.
• /shadow - Enter shadow realm.
• /arisers - List of arisers.

<b>🎲 ECONOMY & LUCK</b>
• /wish - Make a cosmic wish.
• /gamble - Test your luck.
• /bet - Wager on events.
• /loot - Claim underworld rewards.
• /immune - Check immunity.

<b>🛡️ ADMIN (Staff Only)</b>
• /ban - Ban a user.
• /mute - Mute a user.
• /kick - Kick a user.
• /warn - Warn a user.

<i>Use these commands to rule the underworld!</i>`;

        await replyToUser(ctx, helpMessage);
    });
}
