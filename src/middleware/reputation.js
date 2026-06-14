import { User } from "../models/User.js";

const INCREMENT_WORDS = [
  "good", "nice", "great", "awesome", "amazing", "perfect",
  "excellent", "brilliant", "wonderful", "fantastic", "superb",
  "beautiful", "lovely", "incredible", "outstanding", "splendid",
  "magnificent", "marvelous", "legendary", "godly", "blessed",
  "goat", "king", "queen", "chad", "w", "based",
  "thanks", "thank", "thx", "ty", "appreciate", "grateful",
  "+", "👍", "👏", "🙌", "😊", "❤️", "💯", "🔥", "✅", "⭐",
  "wholesome", "chill", "respect", "respected", "humble", "grace",
  "solid", "clean", "smooth", "goated", "goated fr",
  "real one", "real one fr", "the real mvp", "mvp",
  "op", "goated af", "w person", "w human", "w rizz"
];

const DECREMENT_WORDS = [
  "bad", "terrible", "awful", "horrible", "worst",
  "ugly", "stupid", "idiot", "dumb", "hate", "sucks",
  "trash", "garbage", "useless", "pathetic", "disgusting",
  "lame", "cringe", "mid", "fraud", "fraudulent",
  "loser", "clown", "joke", "jokeman", "wannabe",
  "downbad", "down bad", "ratio", "L", "l",
  "-", "👎", "😡", "🤬", "💩", "🤡", "🚮",
  "cap", "mad cuz bad", "salty", "cry", "crybaby",
  "weirdo", "freak", "creep", "dusty", "brokeman"
];

const WARNING_WORDS = [
  "wtf", "fuck", "fck", "fukk", "fuk",
  "tf", "the fuck", "what the fuck",
  "nigga", "nigger", "niga", "niga",
  "mc", "m*c", "m.c",
  "bsdk", "bhosadike", "bhosadi ke",
  "chutiya", "chutiye", "madarchod", "maderchod",
  "bhenchod", "bhen chod", "bhen ke lode",
  "randi", "raand", "kutti", "kuttiya",
  "suck my dick", "suck my", "fuck you",
  "gaand", "gandu", "gand",
  "laud", "lode", "loda"
];

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s@+]|[\u{1F600}-\u{1FFFF}]/gu, "")
    .trim();
}

function matchesList(text, list) {
  const lower = text.toLowerCase();
  return list.some((word) => {
    if (word.length <= 2) return lower.includes(word);
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return regex.test(lower);
  });
}

export function reputationMiddleware(bot) {
  bot.on("message", async (ctx, next) => {
    try {
      if (!ctx.message?.text || !ctx.from || ctx.from.is_bot) return next();

      const text = ctx.message.text;
      const userId = ctx.from.id;
      const firstName = ctx.from.first_name || "User";
      const chatType = ctx.chat?.type;

      const hasWarning = matchesList(text, WARNING_WORDS);

      if (hasWarning && (chatType === "group" || chatType === "supergroup")) {
        await ctx.reply(
          `╔══════════════════════════════╗\n` +
          `║    ✦   M A N N E R S   ✦    ║\n` +
          `╠══════════════════════════════╣\n` +
          `║                              ║\n` +
          `║  ┏━ •❃• ━┓                  ║\n` +
          `║  ┃   ❛Manners Is Everything❜ ┃  ║\n` +
          `║  ┗━ •❃• ━┛                  ║\n` +
          `║                              ║\n` +
          `║  👑 Owner: @MoonsGC          ║\n` +
          `║                              ║\n` +
          `╚══════════════════════════════╝`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
        return;
      }

      if (chatType !== "group" && chatType !== "supergroup") return next();

      let user = await User.findOne({ telegramId: userId });
      if (!user) return next();
      if (typeof user.reputation !== "number") user.reputation = 0;

      const hasIncrement = matchesList(text, INCREMENT_WORDS);
      const hasDecrement = matchesList(text, DECREMENT_WORDS);

      if (hasIncrement && !hasDecrement) {
        user.reputation += 1;
        user.lastSeenAt = Math.floor(Date.now() / 1000);
        await user.save();
      } else if (hasDecrement && !hasIncrement) {
        user.reputation -= 1;
        user.lastSeenAt = Math.floor(Date.now() / 1000);
        await user.save();
      }
    } catch (err) {
      console.error("REPUTATION MIDDLEWARE ERROR:", err);
    }

    return next();
  });
}
