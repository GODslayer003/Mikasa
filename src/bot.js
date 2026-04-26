import { Telegraf } from "telegraf";

export const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 300000, // 5 minutes - allows for long-running commands like /train
});