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
  "nigga", "nigger", "niga",
  "mc", "m*c", "m.c",
  "bsdk", "bhosadike", "bhosadi ke",
  "chutiya", "chutiye", "madarchod", "maderchod",
  "bhenchod", "bhen chod", "bhen ke lode",
  "randi", "raand", "kutti", "kuttiya",
  "suck my dick", "suck my", "fuck you",
  "gaand", "gandu", "gand",
  "laud", "lode", "loda"
];

function matchesList(text, list) {
  const lower = text.toLowerCase();
  return list.some((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (/^[a-z]+$/i.test(word)) {
      return new RegExp(`\\b${escaped}\\b`, "i").test(lower);
    }
    return lower.includes(escaped);
  });
}

async function ensureUser(telegramId, firstName) {
  let user = await User.findOne({ telegramId });
  if (!user) {
    user = await User.create({
      telegramId,
      firstName: firstName || "User",
      reputation: 0,
      firstSeenAt: Math.floor(Date.now() / 1000),
      lastSeenAt: Math.floor(Date.now() / 1000)
    });
  }
  if (typeof user.reputation !== "number") user.reputation = 0;
  return user;
}

export function reputationMiddleware(bot) {
  bot.on("message", async (ctx, next) => {
    try {
      if (!ctx.message?.text || !ctx.from || ctx.from.is_bot) return next();

      const text = ctx.message.text;
      const userId = ctx.from.id;
      const firstName = ctx.from.first_name || "User";
      const chatType = ctx.chat?.type;
      const now = Math.floor(Date.now() / 1000);

      const hasWarning = matchesList(text, WARNING_WORDS);

      if (hasWarning && (chatType === "group" || chatType === "supergroup")) {
        let user = await ensureUser(userId, firstName);
        user.reputation -= 10;
        user.lastSeenAt = now;
        await user.save();

        await ctx.reply(
          `Now, now... such a mouth on you, <a href="tg://user?id=${userId}">${firstName}</a>~ You lost <b>10 Karma</b>.\n` +
          `Total: <b>${user.reputation}</b>\n` +
          `— Sylus 🖤`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
        return next();
      }

      if (chatType !== "group" && chatType !== "supergroup") return next();

      const isReply = ctx.message.reply_to_message;
      if (!isReply) return next();

      const repliedUser = ctx.message.reply_to_message.from;
      if (!repliedUser || repliedUser.is_bot || repliedUser.id === userId) return next();

      const hasIncrement = matchesList(text, INCREMENT_WORDS);
      const hasDecrement = matchesList(text, DECREMENT_WORDS);

      if (hasIncrement && !hasDecrement) {
        let target = await ensureUser(repliedUser.id, repliedUser.first_name);
        target.reputation += 1;
        target.lastSeenAt = now;
        await target.save();

        const targetName = repliedUser.first_name || "User";
        const targetId = repliedUser.id;
        await ctx.reply(
          `Mmm, you've made quite the impression, darling~ <a href="tg://user?id=${targetId}">${targetName}</a> earned <b>+1 Karma</b>.\n` +
          `Total: <b>${target.reputation}</b>\n` +
          `— Sylus 🖤`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      } else if (hasDecrement && !hasIncrement) {
        let target = await ensureUser(repliedUser.id, repliedUser.first_name);
        target.reputation -= 1;
        target.lastSeenAt = now;
        await target.save();

        const targetName = repliedUser.first_name || "User";
        const targetId = repliedUser.id;
        await ctx.reply(
          `Not everyone can appreciate true elegance, it seems~ <a href="tg://user?id=${targetId}">${targetName}</a> lost <b>1 Karma</b>.\n` +
          `Total: <b>${target.reputation}</b>\n` +
          `— Sylus 🖤`,
          {
            parse_mode: "HTML",
            reply_to_message_id: ctx.message.message_id
          }
        );
      }
    } catch (err) {
      console.error("REPUTATION MIDDLEWARE ERROR:", err);
    }

    return next();
  });
}
