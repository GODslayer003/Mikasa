// src/commands/gamble.js
import fs from "fs";
import path from "path";
import { User } from "../models/User.js";
import { replyToUser } from "../utils/reply.js";

const GAMBLE_ON_DIR = "assets/GAMBLE ON";
const GAMBLE_OFF_DIR = "assets/GAMBLE OFF";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function randomGif(dir) {
  if (!fs.existsSync(dir)) return null;
  const gifs = fs.readdirSync(dir).filter(f => f.endsWith(".gif"));
  if (!gifs.length) return null;
  return path.join(dir, gifs[Math.floor(Math.random() * gifs.length)]);
}

export function gambleCommand(bot) {
  bot.command("gamble", async (ctx) => {
    try {
      if (!ctx.from) return;

      const userId = ctx.from.id;
      const mention = `<a href="tg://user?id=${userId}">${ctx.from.first_name}</a>`;

      const user = await User.findOneAndUpdate(
        { telegramId: userId },
        { $setOnInsert: { telegramId: userId, balance: 1000 } },
        { new: true, upsert: true }
      );

      const balance = user.balance;
      const minBet = Math.max(100, Math.floor(balance * 0.05));
      const amount = Number(ctx.message.text.split(" ")[1]);

      if (!amount || isNaN(amount)) {
        return replyToUser(
          ctx,
          `🎲 <b>GAMBLE RULES</b>\n\n` +
          `<code>/gamble &lt;amount&gt;</code>\n\n` +
          `💰 Balance: <b>${balance.toLocaleString()}</b>\n` +
          `🔻 Minimum Bet: <b>${minBet.toLocaleString()}</b>`
        );
      }

      if (amount < minBet) {
        return replyToUser(
          ctx,
          `❌ ${mention}, minimum bet is <b>${minBet.toLocaleString()}</b>.`
        );
      }

      if (amount > balance) {
        return replyToUser(
          ctx,
          `❌ ${mention}, insufficient balance.`
        );
      }

      const suspense = await replyToUser(ctx, `🎲 ${mention} tosses the dice...`);
      await sleep(1000);
      await ctx.telegram.editMessageText(ctx.chat.id, suspense.message_id, null, "🎰 Spinning...");
      await sleep(1000);
      await ctx.telegram.deleteMessage(ctx.chat.id, suspense.message_id);

      const roll = Math.random();
      let reward = 0, xp = 0, resultText = "";

      if (roll < 0.05) {
        reward = amount * 10; xp = 5; resultText = "🎉 JACKPOT!";
      } else if (roll < 0.20) {
        reward = amount * 2; xp = 2; resultText = "🎉 BIG WIN!";
      } else if (roll < 0.50) {
        reward = amount; xp = 1; resultText = "😊 BREAK EVEN";
      } else {
        reward = -amount; resultText = "💔 BUST!";
      }

      user.balance += reward;
      user.xp += xp;
      await user.save();

      const gif = reward >= 0 ? randomGif(GAMBLE_ON_DIR) : randomGif(GAMBLE_OFF_DIR);

      const caption =
        `<b>${resultText}</b>\n\n` +
        `👤 Player: ${mention}\n` +
        `💸 Bet: ${amount.toLocaleString()} Moon Coins\n` +
        `${reward >= 0 ? "💰 Profit" : "💀 Loss"}: ${Math.abs(reward).toLocaleString()}\n` +
        `🧠 XP Gained: ${xp}\n\n` +
        `🌙 Balance: <b>${user.balance.toLocaleString()}</b>`;

      if (gif) {
        await ctx.replyWithAnimation({ source: gif }, { caption, parse_mode: "HTML" });
      } else {
        await replyToUser(ctx, caption);
      }

    } catch (err) {
      console.error("Gamble error:", err);
      await replyToUser(ctx, "⚠️ The casino collapsed. Try again later.");
    }
  });
}