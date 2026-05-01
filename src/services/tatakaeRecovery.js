import { User } from "../models/User.js";

export const MAX_TATAKAE_HP = 100;
export const DEFEAT_RECOVERY_SECONDS = 10 * 60 * 60;
// export const DEFEAT_RECOVERY_SECONDS = 10 * 60 * 60;
const RECOVERY_SCAN_MS = 60 * 1000;
// const RECOVERY_SCAN_MS = 60 * 1000;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mentionUser(user) {
  const name = escapeHtml(user.firstName || "Warrior");
  return `<a href="tg://user?id=${user.telegramId}">${name}</a>`;
}

export function getDefeatRestoreDueAt(user) {
  if (!user?.defeatedAt) return 0;
  return user.healthRestoreDueAt || user.defeatedAt + DEFEAT_RECOVERY_SECONDS;
}

export function restoreExpiredDefeat(user, now = nowSeconds()) {
  if (!user?.defeatedAt) return false;

  const restoreDueAt = getDefeatRestoreDueAt(user);
  if (!restoreDueAt || now < restoreDueAt) return false;

  user.hp = MAX_TATAKAE_HP;
  user.defeatedAt = 0;
  user.healthRestoreDueAt = 0;
  user.healthRestoredAt = now;
  return true;
}

async function notifyHealthRestored(bot, user) {
  if (!user.defeatedChatId) return;

  await bot.telegram.sendMessage(
    user.defeatedChatId,
    `${mentionUser(user)}, your health has been restored to <b>${MAX_TATAKAE_HP}/${MAX_TATAKAE_HP} HP</b>.\n\n` +
    `You can return to the battlefield now.`,
    { parse_mode: "HTML" }
  );
}

export async function restoreDueDefeatedUsers(bot) {
  const now = nowSeconds();
  const dueUsers = await User.find({
    defeatedAt: { $gt: 0 },
    hp: { $lte: 0 },
    $or: [
      { healthRestoreDueAt: { $lte: now, $gt: 0 } },
      {
        healthRestoreDueAt: { $in: [0, null] },
        defeatedAt: { $lte: now - DEFEAT_RECOVERY_SECONDS }
      }
    ]
  }).limit(50);

  for (const user of dueUsers) {
    const result = await User.updateOne(
      {
        _id: user._id,
        defeatedAt: user.defeatedAt,
        hp: { $lte: 0 }
      },
      {
        $set: {
          hp: MAX_TATAKAE_HP,
          defeatedAt: 0,
          healthRestoreDueAt: 0,
          healthRestoredAt: now
        }
      }
    );

    if (!result.modifiedCount) continue;

    try {
      await notifyHealthRestored(bot, user);
    } catch (err) {
      console.error("Tatakae recovery notification error:", err);
    }
  }
}

export function startTatakaeRecoveryWorker(bot) {
  const run = () => {
    restoreDueDefeatedUsers(bot).catch((err) => {
      console.error("Tatakae recovery worker error:", err);
    });
  };

  run();
  const interval = setInterval(run, RECOVERY_SCAN_MS);
  interval.unref?.();
  return interval;
}
