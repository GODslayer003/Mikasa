import { User } from "../models/User.js";

export async function ensureUser(telegramUser) {
  let user = await User.findOne({ telegramId: telegramUser.id });

  if (!user) {
    user = await User.create({
      telegramId: telegramUser.id,
      username: telegramUser.username,
      firstName: telegramUser.first_name
    });
  }

  return user;
}