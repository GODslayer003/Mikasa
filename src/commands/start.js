// src/commands/start.js
import { START_TEXTS } from "../constants/startTexts.js";
import { getISTTimeData } from "../utils/time.js";
import { getRandomImage } from "../utils/randomImage.js";
import { Input } from "telegraf";
import { replyToUser } from "../utils/reply.js";

export function startCommand(bot) {
  bot.start(async (ctx) => {
    const { time, time_of_day, hour } = getISTTimeData();
    const template = START_TEXTS[Math.floor(Math.random() * START_TEXTS.length)];

    const mention = `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;

    const caption = template
      .replace("{user}", mention)
      .replace("{time}", time)
      .replace("{time_of_day}", time_of_day)
      .replace("{hour}", hour);

    const imagePath = getRandomImage("images");

    if (!imagePath) {
      return replyToUser(ctx, caption);
    }

    await ctx.replyWithPhoto(Input.fromLocalFile(imagePath), {
      caption,
      parse_mode: "HTML",
      reply_to_message_id: ctx.message?.message_id
    });
  });
}