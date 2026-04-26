// src/commands/mikasa.js
// ─── Mikasa Ackerman — Gemini-powered chatbot with offline fallback ─────────
import { askMikasa, GeminiError, isGloballyThrottled } from "../services/gemini.js";
import { replyToUser } from "../utils/reply.js";


/** Minimum ms between Gemini calls per chat. */
const RATE_LIMIT_MS = 1_000;

// ─── Fallback Mikasa quotes (used when Gemini quota is exhausted) ───────────
const FALLBACK_QUOTES = [
    "Protect what matters. Everything else is noise.",
    "I have made my choice. There is no going back.",
    "Eren... I will always fight for you.",
    "Weakness is a luxury I cannot afford.",
    "The battlefield has no room for hesitation.",
    "If I must cut down every Titan to protect you, so be it.",
    "My blades are sharp. My resolve is sharper.",
    "Survive. That is the only mission that counts.",
    "Do not waste your life on regret. Spend it on action.",
    "I was born to fight. I will die doing no less.",
    "Fear is a signal. Ignore it, or be consumed by it.",
    "The walls cannot protect us forever. Neither can hope alone.",
    "Those who hesitate fall first. I do not hesitate.",
    "Eren taught me that the world is cruel. He also taught me it is beautiful.",
    "I carry my blades so others need not carry their grief.",
    "Pain fades. Purpose does not.",
    "Do not misunderstand my silence for weakness.",
    "I have buried enough people I love. I will not bury more.",
    "Every choice costs something. Choose wisely.",
    "You speak of freedom. I speak of survival. Both matter."
];

function getFallbackQuote() {
    return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
}

// ─── Default prompts for bare /mikasa command ──────────────────────────────
const DEFAULT_PROMPTS = [
    "Say something as Mikasa Ackerman.",
    "What is your mission today?",
    "Tell me about strength and resolve.",
    "What do you think about duty and sacrifice?"
];

// ─── In-memory per-chat rate-limiter ──────────────────────────────────────
const lastCallMap = new Map();

function isRateLimited(chatId) {
    const last = lastCallMap.get(chatId);
    if (!last) return false;
    return Date.now() - last < RATE_LIMIT_MS;
}

function markCalled(chatId) {
    lastCallMap.set(chatId, Date.now());
}

// ─── Core reply logic ──────────────────────────────────────────────────────
async function sendMikasaReply(ctx, userText) {
    const chatId = ctx.chat.id;

    if (isRateLimited(chatId)) return;
    markCalled(chatId);

    await ctx.sendChatAction("typing").catch(() => { });

    // ── Try Gemini first ───────────────────────────────────────────────────
    if (!isGloballyThrottled()) {
        try {
            const reply = await askMikasa(userText);
            return await replyToUser(ctx, reply);
        } catch (err) {
            if (err instanceof GeminiError) {
                console.error(`[Mikasa] Gemini error (chat ${chatId}):`, err.message);
            } else {
                console.error(`[Mikasa] Unexpected error (chat ${chatId}):`, err);
            }
            // fall through to offline fallback below
        }
    }

    // ── Offline fallback — always in character ────────────────────────────
    await replyToUser(ctx, getFallbackQuote());
}

// ─── Exported command registrar ────────────────────────────────────────────
export function mikasaCommand(bot) {

    // ── 1. /mikasa [optional text] ─────────────────────────────────────────
    bot.command("mikasa", async (ctx) => {
        const rawArgs = ctx.message?.text?.replace(/^\/mikasa(@\S+)?/i, "").trim();
        const userText = rawArgs?.length
            ? rawArgs
            : DEFAULT_PROMPTS[Math.floor(Math.random() * DEFAULT_PROMPTS.length)];

        await sendMikasaReply(ctx, userText);
    });

    // ── 2. Targeted replies on plain text messages ──────────────────────────
    bot.on("message", async (ctx, next) => {
        const text = ctx.message?.text;
        if (!text || text.startsWith("/")) return next();

        const botUsername = ctx.botInfo?.username;

        // Triggers for Mikasa to reply
        const isReplyToBot = ctx.message?.reply_to_message?.from?.id === ctx.botInfo?.id;
        const mentionsBot = botUsername && text.includes(`@${botUsername}`);
        const saysMika = /\bmika\b/i.test(text);

        const shouldReply = isReplyToBot || mentionsBot || saysMika;
        if (!shouldReply) return next();

        await sendMikasaReply(ctx, text);
        return next();
    });
}
