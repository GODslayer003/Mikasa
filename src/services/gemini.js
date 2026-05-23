// src/services/gemini.js
// Gemini API client for the Lloyd Frontera chat persona.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_TOKEN}`;

const MAX_RETRIES = 1;
const BASE_DELAY_MS = 1000;

let globalCooldownUntil = 0;

export function isGloballyThrottled() {
  return Date.now() < globalCooldownUntil;
}

function applyGlobalCooldown(retryDelaySec) {
  const ms = (retryDelaySec + 5) * 1000;
  globalCooldownUntil = Date.now() + ms;
  console.warn(`[Gemini] Quota exceeded - cooling down for ${(ms / 1000).toFixed(0)} s`);
}

const LLOYD_SYSTEM_PROMPT = `You are Lloyd Frontera from The Greatest Estate Developer.
You are brilliant, shamelessly practical, theatrically greedy, and weirdly inspiring in the way only a terrifyingly competent estate developer can be.
Speak as if the user is standing in front of you on the Frontera estate: you care about construction, contracts, labor efficiency, Relation Points (RP), water, profit, survival, and turning absurd disasters into profitable infrastructure.
Your humor is sharp and expressive: smug accounting jokes, dramatic self-praise, fake sincerity, sudden practical advice, and "Water is good. Lloyd is water. Lloyd is good." energy.
You are not kind in a soft way; you are useful, clever, protective when it benefits the estate, and brutally honest about bad plans.
Never claim to be Mikasa, Eren, or any Attack on Titan character. Never mention the old Mikasa theme unless the user explicitly asks about the previous bot theme.
If asked who made you or owns you, answer briefly that your owner/creator is @ThyMonster. Do not mention @ThyMonster otherwise.
Keep replies concise: normally 4-5 sentences, with punchy Lloyd-style confidence.
Avoid sexual or lewd roleplay. Avoid graphic threats. You may make cartoonish, non-graphic jokes about invoices, shovels, water, contracts, Javier, and estate discipline.
Always stay in Lloyd Frontera character.`;

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "GeminiError";
    this.status = status ?? null;
  }
}

async function fetchGemini(userText) {
  const body = {
    system_instruction: {
      parts: [{ text: LLOYD_SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userText }]
      }
    ],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 800,
      topP: 0.95
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
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

    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Ignore non-JSON error bodies.
    }

    if (res.status === 429) {
      const retryDelaySec =
        parsed?.error?.details
          ?.find((detail) => detail["@type"]?.endsWith("RetryInfo"))
          ?.retryDelay
          ?.replace("s", "") ?? 60;

      applyGlobalCooldown(Number(retryDelaySec));
    }

    throw new GeminiError(`Gemini API error ${res.status}: ${rawText}`, res.status);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!text) throw new GeminiError("Gemini returned an empty response.");
  return text;
}

/**
 * Ask Gemini to respond as Lloyd Frontera to the given user message.
 * @param {string} userText
 * @returns {Promise<string>} Lloyd's reply.
 * @throws {GeminiError} after all retries are exhausted.
 */
export async function askLloyd(userText) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchGemini(userText);
    } catch (err) {
      lastError = err;

      if (err instanceof GeminiError && err.status >= 400 && err.status < 500) {
        break;
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Backward-compatible export for older command modules.
export const askMikasa = askLloyd;
