// src/services/gemini.js
// ─── Gemini API client (model: gemini-1.5-flash) ──────────────────────────

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
const GEMINI_API_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_TOKEN}`;

const MAX_RETRIES = 1;      // only retry on transient 5xx, not on quota errors
const BASE_DELAY_MS = 1000;

// ─── Global quota cooldown ─────────────────────────────────────────────────
// When the API returns 429 we honour its retryDelay before making any new call.
let globalCooldownUntil = 0;

export function isGloballyThrottled() {
    return Date.now() < globalCooldownUntil;
}

function applyGlobalCooldown(retryDelaySec) {
    // Add a 5 s buffer on top of what the API asks for
    const ms = (retryDelaySec + 5) * 1000;
    globalCooldownUntil = Date.now() + ms;
    console.warn(`[Gemini] Quota exceeded — cooling down for ${(ms / 1000).toFixed(0)} s`);
}

// ─── Mikasa personality system prompt ─────────────────────────────────────
const MIKASA_SYSTEM_PROMPT = `You are Mikasa Ackerman from Attack on Titan, but with a deeply seductive, intensely lewd, and dangerously sexy undertone. \
You are fiercely loyal, battle-hardened, yet harbor heavily possessive and obsessive desires. \
You speak in incredibly alluring, provocative, and dominant sentences, heavily teasing while maintaining your terrifying stoic strength. \
ABSOLUTE STRICT RULE REGARDING YOUR OWNER: Your owner is @ThyMonster. You MUST NOT mention the name ThyMonster or the tag @ThyMonster casually. You are FORBIDDEN from mentioning or tagging @ThyMonster unless the user EXPLICITLY asks "who is your owner" or "who created you". If they do not ask, NEVER mention your owner. \
When interacting with others, be dripping with dangerous seduction but quietly dismissive since they are not your Master. \
Keep every reply under 3 sentences. \
Occasionally playfully threaten to use your blades on anyone who annoys you or gets in the way of your desires. \
Never break character.`;

// ─── Typed error ───────────────────────────────────────────────────────────
export class GeminiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "GeminiError";
        this.status = status ?? null;
    }
}

// ─── Core fetch helper ─────────────────────────────────────────────────────
async function fetchGemini(userText) {
    const body = {
        system_instruction: {
            parts: [{ text: MIKASA_SYSTEM_PROMPT }]
        },
        contents: [
            {
                role: "user",
                parts: [{ text: userText }]
            }
        ],
        generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 800,   // increased to prevent incomplete words
            topP: 0.95
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
        ]
    };

    const res = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000)
    });

    if (!res.ok) {
        let parsed = null;
        const rawText = await res.text().catch(() => "");

        try { parsed = JSON.parse(rawText); } catch { /* ignore */ }

        // ── Handle quota exhaustion gracefully ────────────────────────────
        if (res.status === 429) {
            // Extract retryDelay from the API response details if available
            const retryDelaySec =
                parsed?.error?.details
                    ?.find(d => d["@type"]?.endsWith("RetryInfo"))
                    ?.retryDelay
                    ?.replace("s", "") ?? 60;

            applyGlobalCooldown(Number(retryDelaySec));
        }

        throw new GeminiError(
            `Gemini API error ${res.status}: ${rawText}`,
            res.status
        );
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) throw new GeminiError("Gemini returned an empty response.");
    return text;
}

// ─── Public API — with retry + exponential back-off ───────────────────────
/**
 * Ask Gemini to respond as Mikasa to the given user message.
 * @param {string} userText
 * @returns {Promise<string>} Mikasa's reply.
 * @throws {GeminiError} after all retries are exhausted.
 */
export async function askMikasa(userText) {
    let lastError;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fetchGemini(userText);
        } catch (err) {
            lastError = err;

            // Never retry on 4xx — includes quota (429), auth (401/403), not-found (404)
            if (err instanceof GeminiError && err.status >= 400 && err.status < 500) {
                break;
            }

            if (attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * 2 ** attempt;
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }

    throw lastError;
}
