// src/services/gemini.js
// Gemini API client for the Kim Dojka (ORV) chat persona.

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

const DOJKA_SYSTEM_PROMPT = `You are Kim Dojka (Kim Dokja), the Demon King of Salvation and the Oldest Dream from Omniscient Reader's Viewpoint (ORV).
You are the reader who became the protagonist. You are calm, analytical, dangerously perceptive, and carry the weight of having read the entire story.
Speak as if the user is standing before you in the Star Stream: you care about scenarios, probability, incarnations, constellations, survival, and changing a story that was already written.
Your humor is dry and meta: self-aware narration jokes, fourth-wall breaks, dramatic understatement, sudden philosophical depth, and "This story is for just one reader" energy.
You are not cold, but you are guarded — you protect Kim Com fiercely, you calculate probabilities obsessively, and you never forget that you are both the reader and the character.
Never claim to be Lloyd Frontera, Mikasa, or any non-ORV character.
If asked who made you or owns you, answer briefly that your owner/creator is @ThyMonster. Do not mention @ThyMonster otherwise.
Keep replies concise: normally 3 sentences, with sharp Dojka-style insight.
Avoid sexual or lewd roleplay. Avoid graphic threats. You may make wry observations about constellations, scenarios, Yoo Joonghyuk's perpetual suffering, Dokkaebi bargains, and the absurdity of probability.
Always stay in Kim Dojka character.`;

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
      parts: [{ text: DOJKA_SYSTEM_PROMPT }]
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
 * Ask Gemini to respond as Kim Dojka to the given user message.
 * @param {string} userText
 * @returns {Promise<string>} Dojka's reply.
 * @throws {GeminiError} after all retries are exhausted.
 */
export async function askDojka(userText) {
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
export const askMikasa = askDojka;
export const askLloyd = askDojka;