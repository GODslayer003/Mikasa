// src/commands/bet.js
import { User } from "../models/User.js";
import { BET_COOLDOWN, PREMIUM_GROUP_USERNAME } from "../game/constants.js";
import { replyToUser } from "../utils/reply.js";

const betCooldowns = new Map();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function betCommand(bot) {
  bot.command("bet", async (ctx) => {
    try {
      if (!ctx.from || !ctx.chat) return;

      const userId = ctx.from.id;
      const mention = `<a href="tg://user?id=${userId}">${ctx.from.first_name}</a>`;
      const now = Math.floor(Date.now() / 1000);

      // Premium group only
      if (
        ctx.chat.type === "private" ||
        ctx.chat.username !== PREMIUM_GROUP_USERNAME
      ) {
        return replyToUser(
          ctx,
          `🔒 <b>Premium Command</b>\n\n🪙 ${mention}, <b>/bet</b> can only be used in <b>@MoonsGC</b>.`
        );
      }

      // Cooldown
      if (betCooldowns.has(userId) && now < betCooldowns.get(userId)) {
        const left = betCooldowns.get(userId) - now;
        return replyToUser(
          ctx,
          `🚬 ${mention}, slow down.\n⏳ Try again in <b>${left}s</b>.`
        );
      }

      // Parse args
      const args = ctx.message.text.split(" ");
      if (args.length !== 3) {
        return replyToUser(
          ctx,
          `🎯 <b>How to Bet</b>\n\n` +
          `<code>/bet &lt;amount&gt; &lt;H/T&gt;</code>\n\n` +
          `Examples:\n` +
          `• <code>/bet 5000 H</code>\n` +
          `• <code>/bet 10000 T</code>`
        );
      }

      const amount = Number(args[1]);
      const choice = args[2].toUpperCase();

      if (!amount || amount <= 0 || isNaN(amount)) {
        return replyToUser(ctx, `❌ ${mention}, bet a valid amount.`);
      }

      if (!["H", "T"].includes(choice)) {
        return replyToUser(
          ctx,
          `❌ ${mention}, choose <b>H</b> (Heads) or <b>T</b> (Tails).`
        );
      }

      // Fetch user
      const user = await User.findOne({ telegramId: userId });
      if (!user) {
        return replyToUser(ctx, `❌ ${mention}, use /start first.`);
      }

      const minBet = Math.max(1000, Math.floor(user.balance * 0.01));

      if (amount < minBet) {
        return replyToUser(
          ctx,
          `🚬 ${mention}, minimum bet is <b>${minBet.toLocaleString()}</b> Moon Coins.`
        );
      }

      if (amount > user.balance) {
        return replyToUser(
          ctx,
          `💸 ${mention}, you only have <b>${user.balance.toLocaleString()}</b> Moon Coins.`
        );
      }

      // Deduct first
      user.balance -= amount;
      await user.save();

      // Cinematic
      const msg = await replyToUser(
        ctx,
        `🪙 ${mention} bets <b>${amount.toLocaleString()}</b> on <b>${choice === "H" ? "Heads" : "Tails"}</b>...`
      );

      await sleep(1200);
      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "🌪️ The coin spins...");
      await sleep(1800);

      // Toss
      const result = Math.random() < 0.5 ? "H" : "T";
      const resultText = result === "H" ? "Heads" : "Tails";

      let caption;
      let xpGain = 1;

      if (choice === result) {
        const winnings = amount * 2;
        user.balance += winnings;
        xpGain = 3;

        caption =
          `🎉 <b>YOU WIN!</b>\n\n` +
          `🪙 Coin landed on <b>${resultText}</b>\n\n` +
          `💰 <b>Won</b>: ${winnings.toLocaleString()} coins\n` +
          `📊 <b>+${xpGain} XP</b>\n\n` +
          `🌙 <b>Balance</b>: ${user.balance.toLocaleString()} Moon Coins`;
      } else {
        caption =
          `💔 <b>YOU LOSE!</b>\n\n` +
          `🪙 Coin landed on <b>${resultText}</b>\n\n` +
          `💸 <b>Lost</b>: ${amount.toLocaleString()} coins\n` +
          `📊 <b>+${xpGain} XP</b>\n\n` +
          `🌙 <b>Balance</b>: ${user.balance.toLocaleString()} Moon Coins`;
      }

      user.xp += xpGain;
      await user.save();

      betCooldowns.set(userId, now + BET_COOLDOWN);

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        msg.message_id,
        null,
        caption,
        { parse_mode: "HTML" }
      );

    } catch (err) {
      console.error("Bet error:", err);
      await replyToUser(ctx, "⚠️ Casino malfunction. Try again later.");
    }
  });
}