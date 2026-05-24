import { User } from "../models/User.js";

const ALLOWED_TOPPERS = [
  "ThyMonster",
  "RiverSung",
  "ThyFang",
  "ThyDivine",
  "ThyDemise"
];

function rpOf(user) {
  if (typeof user.rp === "number") return user.rp;
  if (typeof user.moons === "number") return user.moons;
  if (typeof user.balance === "number") return user.balance;
  return 0;
}

export function topperCommand(bot) {
  bot.command("topper", async (ctx) => {
    try {
      if (!ctx.from?.username || !ALLOWED_TOPPERS.includes(ctx.from.username)) {
        return ctx.reply("Access denied. Lloyd does not open the treasury for spectators.", {
          reply_to_message_id: ctx.message?.message_id
        });
      }

      const topUsers = await User.find({}).sort({ rp: -1, balance: -1 }).limit(5);

      if (!topUsers.length) {
        return ctx.reply("No estate ledgers available.", {
          reply_to_message_id: ctx.message?.message_id
        });
      }

      const rows = topUsers.map((user, index) => {
        const mention = `<a href="tg://user?id=${user.telegramId}">${user.firstName || "Unknown"}</a>`;
        return `${index + 1}. ${mention}\nRP: <b>${rpOf(user).toLocaleString()}</b>`;
      }).join("\n\n");

      await ctx.reply(
        `<b>Frontera Treasury Top 5</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `${rows}\n\n` +
          `<i>Lloyd: "Money is not everything. It is merely the part I count first."</i>`,
        {
          parse_mode: "HTML",
          reply_to_message_id: ctx.message?.message_id
        }
      );
    } catch (err) {
      console.error("Topper error:", err);
      await ctx.reply("Unable to fetch the treasury ledger.", {
        reply_to_message_id: ctx.message?.message_id
      });
    }
  });
}
