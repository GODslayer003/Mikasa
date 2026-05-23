// src/commands/mikasa.js
// Lloyd Frontera - Gemini-powered chatbot with offline fallback.
import { askLloyd, GeminiError, isGloballyThrottled } from "../services/gemini.js";
import { replyToUser } from "../utils/reply.js";

const RATE_LIMIT_MS = 1_000;

const FALLBACK_QUOTES = [
  "Water is good. Lloyd is water. Lloyd is good. Now explain why your plan does not yet produce RP.",
  "A crisis is just unpaid infrastructure waiting for a genius with a shovel.",
  "If the budget is crying, comfort it with profit. That is estate management.",
  "Do not confuse kindness with free labor. I am generous, not bankrupt.",
  "Javier looks heroic. I look profitable. Together, the estate survives.",
  "Bad news: your plan is terrible. Good news: terrible plans are my specialty.",
  "Every disaster has three parts: panic, paperwork, and my invoice.",
  "If you cannot solve it with water, labor, or accounting, you have not billed enough.",
  "The estate does not run on dreams. It runs on RP, sweat, and my magnificent brain.",
  "Survival first, profit second, moral reflection never before lunch."
];

const DEFAULT_PROMPTS = [
  "Speak as Lloyd Frontera.",
  "Give me estate advice.",
  "Tell me why water is good.",
  "What should a worker know today?"
];

const lastCallMap = new Map();

function isRateLimited(chatId) {
  const last = lastCallMap.get(chatId);
  if (!last) return false;
  return Date.now() - last < RATE_LIMIT_MS;
}

function markCalled(chatId) {
  lastCallMap.set(chatId, Date.now());
}

function getFallbackQuote() {
  return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
}

async function sendLloydReply(ctx, userText) {
  const chatId = ctx.chat.id;

  if (isRateLimited(chatId)) return;
  markCalled(chatId);

  await ctx.sendChatAction("typing").catch(() => {});

  if (!isGloballyThrottled()) {
    try {
      const reply = await askLloyd(userText);
      return await replyToUser(ctx, reply);
    } catch (err) {
      if (err instanceof GeminiError) {
        console.error(`[Lloyd] Gemini error (chat ${chatId}):`, err.message);
      } else {
        console.error(`[Lloyd] Unexpected error (chat ${chatId}):`, err);
      }
    }
  }

  await replyToUser(ctx, getFallbackQuote());
}

export function mikasaCommand(bot) {
  bot.command(["lloyd", "llyod", "frontera", "mikasa"], async (ctx) => {
    const rawArgs = ctx.message?.text?.replace(/^\/(?:lloyd|llyod|frontera|mikasa)(@\S+)?/i, "").trim();
    const userText = rawArgs?.length
      ? rawArgs
      : DEFAULT_PROMPTS[Math.floor(Math.random() * DEFAULT_PROMPTS.length)];

    await sendLloydReply(ctx, userText);
  });

  bot.on("message", async (ctx, next) => {
    const text = ctx.message?.text;
    if (!text || text.startsWith("/")) return next();

    const botUsername = ctx.botInfo?.username;
    const isReplyToBot = ctx.message?.reply_to_message?.from?.id === ctx.botInfo?.id;
    const mentionsBot = botUsername && text.includes(`@${botUsername}`);
    const saysLloyd = /\b(lloyd|llyod|frontera|water is good)\b/i.test(text);

    if (!isReplyToBot && !mentionsBot && !saysLloyd) return next();

    await sendLloydReply(ctx, text);
    return next();
  });
}
