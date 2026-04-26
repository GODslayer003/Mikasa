// src/commands/train.js
import { User } from "../models/User.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Markup } from "telegraf";

// ─── PATH SETUP ─────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CONFIG ─────────────────────────────────
const TRAIN_COOLDOWN = 60 * 60 * 6; // 6 hours
const DELAY_BETWEEN_PHASES = 9000; // 10 seconds between phases
const DELAY_BEFORE_START = 7000; // 7 seconds before battle
const DELAY_BETWEEN_MESSAGES = 7000; // 3 seconds for short messages

const PHASES = [
  { 
    stars: 1, 
    win: 75, 
    xp: 10, 
    coins: 50, 
    folder: "Low Level",
    title: "Scouting Grounds",
    description: "Basic combat training with weak enemies",
    emoji: "⚪"
  },
  { 
    stars: 2, 
    win: 50, 
    xp: 25, 
    coins: 100, 
    folder: "Mid Level",
    title: "Training Field",
    description: "Moderate challenges for skill refinement",
    emoji: "🟢"
  },
  { 
    stars: 3, 
    win: 30, 
    xp: 50, 
    coins: 200, 
    folder: "Top Level",
    title: "Elite Arena",
    description: "Fight against experienced warriors",
    emoji: "🔵"
  },
  { 
    stars: 4, 
    win: 15, 
    xp: 100, 
    coins: 400, 
    folder: "Legend Level",
    title: "Legend's Trial",
    description: "Face legendary opponents",
    emoji: "🟣"
  },
  { 
    stars: 5, 
    win: 8, 
    xp: 200, 
    coins: 800, 
    folder: "Ultra Level",
    title: "Supreme Battlefield",
    description: "The ultimate test of strength",
    emoji: "🔴"
  }
];

// ─── MIKA'S ENCOURAGEMENT PHRASES ──────────
const MIKA_PHRASES = [
  "«Stay focused. The next one is stronger.»",
  "«Don't let your guard down. More await.»",
  "«Prepare yourself. Greater challenges ahead.»",
  "«Your strength is growing. Keep moving.»",
  "«The training intensifies. Are you ready?»",
  "«Every victory brings tougher opponents.»",
  "«Conserve your energy. More battles to come.»",
  "«Well fought. But the hardest is yet to come.»",
  "«You're adapting well. The next phase awaits.»",
  "«Good work. Prepare for increased difficulty.»"
];

const VICTORY_PHRASES = [
  "«Good. You're learning.»",
  "«Excellent technique.»",
  "«You're improving.»",
  "«Well executed.»",
  "«Your training shows.»",
  "«That was clean.»",
  "«Impressive.»",
  "«Well fought.»",
  "«You've grown.»",
  "«Perfect.»"
];

const DEFEAT_PHRASES = [
  "«Get up. Try again later.»",
  "«You need more training.»",
  "«Learn from this.»",
  "«Stand up, soldier.»",
  "«Rest and recover.»",
  "«Failure is a lesson.»",
  "«We'll try again.»",
  "«Don't give up.»",
  "«You'll improve.»",
  "«Retreat for now.»"
];

// ─── HELPERS ────────────────────────────────
function rollWin(chance) {
  return Math.random() * 100 < chance;
}

function getRandomPhrase(phrases) {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function pickOpponent(folder) {
  const dir = path.join(__dirname, "..", "..", "assets", folder);

  if (!fs.existsSync(dir)) {
    console.error("❌ TRAIN FOLDER MISSING:", dir);
    return null;
  }

  const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
  if (!files.length) return null;

  const file = files[Math.floor(Math.random() * files.length)];
  return {
    name: path.parse(file).name,
    imagePath: path.join(dir, file)
  };
}

// ─── DELETE MESSAGE SAFELY ─────────────────
async function deleteMessageSafely(ctx, messageId) {
  try {
    if (messageId && ctx.chat && ctx.chat.id) {
      await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
    }
  } catch (err) {
    // Message might already be deleted or inaccessible
  }
}

// ─── SEND AND TRACK MESSAGE ────────────────
async function sendAndTrackMessage(ctx, content, options = {}) {
  try {
    if (content.imagePath) {
      const msg = await ctx.replyWithPhoto(
        { source: content.imagePath },
        {
          caption: content.text,
          parse_mode: "HTML",
          ...options
        }
      );
      return msg.message_id;
    } else {
      const msg = await ctx.reply(content.text, {
        parse_mode: "HTML",
        ...options
      });
      return msg.message_id;
    }
  } catch (err) {
    console.error("Message send error:", err);
    return null;
  }
}

// ─── TRAINING COMMAND ──────────────────────
export function trainCommand(bot) {
  bot.command("train", async (ctx) => {
    try {
      if (!ctx.from) return;

      const userId = ctx.from.id;
      const firstName = ctx.from.first_name || "Soldier";
      const mention = `<a href="tg://user?id=${userId}">${firstName}</a>`;
      const now = Math.floor(Date.now() / 1000);

      // Reply immediately to acknowledge command
      await ctx.replyWithChatAction("typing");

      let user;
      try {
        user = await User.findOne({ telegramId: userId }).maxTimeMS(10000);
      } catch (dbErr) {
        console.error("Database query timeout:", dbErr);
        return ctx.reply(
          `⚠️ <b>DATABASE ERROR</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `«System connection failed. Try again in a moment.»\n` +
          `— Mikasa`,
          { 
            parse_mode: "HTML", 
            reply_to_message_id: ctx.message.message_id 
          }
        );
      }

      if (!user || !Array.isArray(user.shadows) || user.shadows.length === 0) {
        return ctx.reply(
          `🛡️ <b>MILITARY TRAINING GROUNDS</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📊 <b>No soldiers available for training</b>\n\n` +
          `«First, recruit soldiers with /arise.»\n` +
          `— Mikasa`,
          { 
            parse_mode: "HTML", 
            reply_to_message_id: ctx.message.message_id 
          }
        );
      }

      // ─── SAFETY INIT ───────────────────────
      user.xp = user.xp || 0;
      user.balance = user.balance || 0;
      user.lastTrainAt = user.lastTrainAt || 0;
      user.trainingWins = user.trainingWins || 0;
      user.trainingLosses = user.trainingLosses || 0;

      // ─── COOLDOWN CHECK ────────────────────
      if (now - user.lastTrainAt < TRAIN_COOLDOWN) {
        const left = TRAIN_COOLDOWN - (now - user.lastTrainAt);
        const hours = Math.floor(left / 3600);
        const minutes = Math.ceil((left % 3600) / 60);
        
        return ctx.reply(
          `⏳ <b>TRAINING COOLDOWN</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🛡️ <b>Commander:</b> ${mention}\n\n` +
          `⏰ <b>Next training available in:</b>\n` +
          `• ${hours > 0 ? `${hours}h ` : ''}${minutes}m\n\n` +
          `«Soldiers need rest to recover strength.»\n` +
          `— Mikasa`,
          { 
            parse_mode: "HTML", 
            reply_to_message_id: ctx.message.message_id 
          }
        );
      }

      // ─── START TRAINING SESSION ────────────
      let totalXP = 0;
      let totalCoins = 0;
      let currentPhase = 0;
      let phasesWon = 0;
      let lastMessageId = null;

      // Initial training message
      const startMsg = await ctx.reply(
        `⚔️ <b>INITIATING TRAINING SESSION</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🛡️ <b>Commander:</b> ${mention}\n` +
        `👥 <b>Soldiers Ready:</b> ${user.shadows.length}\n` +
        `⚡ <b>Regiment Power:</b> ${user.totalPower}\n\n` +
        `«Preparing for combat simulation...»\n` +
        `— Mikasa`,
        { 
          parse_mode: "HTML", 
          reply_to_message_id: ctx.message.message_id 
        }
      );

      lastMessageId = startMsg.message_id;
      await delay(DELAY_BETWEEN_MESSAGES);

      // ─── TRAINING LOOP ─────────────────────
      for (let phaseIndex = 0; phaseIndex < PHASES.length; phaseIndex++) {
        const phase = PHASES[phaseIndex];
        currentPhase = phaseIndex + 1;
        
        const opponent = pickOpponent(phase.folder);
        if (!opponent) {
          // If no opponent found, skip this phase
          continue;
        }

        // Delete previous message
        await deleteMessageSafely(ctx, lastMessageId);

        // ─── PHASE INTRODUCTION ──────────────
        const phaseMsg = await sendAndTrackMessage(ctx, {
          imagePath: opponent.imagePath,
          text: 
            `⚔️ <b>PHASE ${currentPhase}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📛 <b>${phase.title}</b>\n` +
            `└─ ${phase.description}\n\n` +
            `👹 <b>OPPONENT:</b> ${opponent.name}\n` +
            `⚠️ <b>THREAT LEVEL:</b> ${"★".repeat(phase.stars)}\n` +
            `🎯 <b>VICTORY CHANCE:</b> ${phase.win}%\n\n` +
            `🏆 <b>REWARDS ON VICTORY</b>\n` +
            `├─ XP: +${phase.xp}\n` +
            `└─ Moons: +${phase.coins} 🌙\n\n` +
            `⏳ <i>Battle begins in 7 seconds...</i>\n\n` +
            `«Prepare yourself.»\n` +
            `— Mikasa`
        });

        lastMessageId = phaseMsg;
        await delay(DELAY_BEFORE_START);

        // ─── BATTLE RESULT ───────────────────
        const victory = rollWin(phase.win);
        
        if (!victory) {
          // DEFEAT - Delete phase message
          await deleteMessageSafely(ctx, lastMessageId);
          
          const defeatMsg = await ctx.reply(
            `💥 <b>BATTLE LOST</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🛡️ <b>Commander:</b> ${mention}\n\n` +
            `⚔️ <b>Phase ${currentPhase}: Failed</b>\n` +
            `👹 <b>Defeated by:</b> ${opponent.name}\n\n` +
            `📊 <b>TRAINING SUMMARY</b>\n` +
            `├─ Phases Completed: ${phaseIndex}\n` +
            `├─ Total XP Earned: ${totalXP}\n` +
            `└─ Total Moons Earned: ${totalCoins} 🌙\n\n` +
            `${getRandomPhrase(DEFEAT_PHRASES)}\n` +
            `— Mikasa\n\n` +
            `⏰ <i>Training cooldown: 6 hours</i>`,
            { parse_mode: "HTML" }
          );
          
          lastMessageId = defeatMsg.message_id;
          
          // Update training losses
          user.trainingLosses += 1;
          break;
        }

        // VICTORY
        totalXP += phase.xp;
        totalCoins += phase.coins;
        phasesWon += 1;
        
        // Delete phase message
        await deleteMessageSafely(ctx, lastMessageId);
        
        const victoryMsg = await ctx.reply(
          `✅ <b>VICTORY ACHIEVED</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🛡️ <b>Commander:</b> ${mention}\n\n` +
          `⚔️ <b>Phase ${currentPhase}: Complete</b>\n` +
          `👹 <b>Defeated:</b> ${opponent.name}\n\n` +
          `🏆 <b>REWARDS EARNED</b>\n` +
          `├─ XP: +${phase.xp}\n` +
          `└─ Moons: +${phase.coins} 🌙\n\n` +
          `📊 <b>CURRENT PROGRESS</b>\n` +
          `├─ Total XP: ${totalXP}\n` +
          `└─ Total Moons: ${totalCoins} 🌙\n\n` +
          `${getRandomPhrase(VICTORY_PHRASES)}\n` +
          `— Mikasa`,
          { parse_mode: "HTML" }
        );
        
        lastMessageId = victoryMsg.message_id;

        // Check if this is the last phase
        if (currentPhase === PHASES.length) {
          await delay(DELAY_BETWEEN_MESSAGES);
          await deleteMessageSafely(ctx, lastMessageId);
          
          const completeMsg = await ctx.reply(
            `🏆 <b>TRAINING COMPLETE</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🛡️ <b>Commander:</b> ${mention}\n\n` +
            `⚔️ <b>All Phases Conquered!</b>\n` +
            `✅ ${PHASES.length} phases completed\n\n` +
            `📊 <b>FINAL RESULTS</b>\n` +
            `├─ Total XP Earned: ${totalXP}\n` +
            `└─ Total Moons Earned: ${totalCoins} 🌙\n\n` +
            `🎖️ <b>BONUS REWARDS</b>\n` +
            `├─ Bonus XP: +100\n` +
            `└─ Bonus Moons: +200 🌙\n\n` +
            `«You've proven your strength. Well done.»\n` +
            `— Mikasa\n\n` +
            `⏰ <i>Training cooldown: 6 hours</i>`,
            { parse_mode: "HTML" }
          );
          
          totalXP += 100;
          totalCoins += 200;
          lastMessageId = completeMsg.message_id;
          break;
        }

        // ─── BETWEEN PHASES MESSAGE ──────────
        await delay(DELAY_BETWEEN_MESSAGES);
        await deleteMessageSafely(ctx, lastMessageId);
        
        const intermissionMsg = await ctx.reply(
          `⚔️ <b>PREPARING NEXT PHASE</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🛡️ <b>Commander:</b> ${mention}\n\n` +
          `📈 <b>Progress:</b> ${currentPhase}/${PHASES.length} phases\n\n` +
          `⚠️ <b>Next Phase: ${PHASES[currentPhase].title}</b>\n` +
          `└─ ${PHASES[currentPhase].description}\n\n` +
          `📊 <b>Current Stats</b>\n` +
          `├─ Total XP: ${totalXP}\n` +
          `└─ Total Moons: ${totalCoins} 🌙\n\n` +
          `${getRandomPhrase(MIKA_PHRASES)}\n` +
          `— Mikasa\n\n` +
          `⏳ <i>Next phase in 10 seconds...</i>`,
          { parse_mode: "HTML" }
        );
        
        lastMessageId = intermissionMsg.message_id;
        await delay(DELAY_BETWEEN_PHASES);
      }

      // ─── SAVE PROGRESS ─────────────────────
      // Update wins based on phases completed
      if (phasesWon > 0) {
        user.trainingWins += phasesWon;
      }
      
      // Update XP and balance
      user.xp += totalXP;
      user.balance += totalCoins;
      user.lastTrainAt = now;
      
      // Add XP bonus for completing more phases
      if (phasesWon > 3) {
        const bonus = phasesWon * 25;
        user.xp += bonus;
        totalXP += bonus;
      }
      
      try {
        await user.save({ timeout: 10000 });
      } catch (saveErr) {
        console.error("Database save error:", saveErr);
        await ctx.reply(
          `⚠️ <b>SAVE ERROR</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Rewards were earned but failed to save.\n\n` +
          `«Try the command again to retry.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML" }
        );
        throw saveErr;
      }


      // ─── FINAL SUMMARY ─────────────────────
      await delay(DELAY_BETWEEN_MESSAGES);
      
      // Only delete last message if it's not the final complete message
      if (phasesWon < PHASES.length) {
        await deleteMessageSafely(ctx, lastMessageId);
      }
      
      const finalButtons = Markup.inlineKeyboard([
        [Markup.button.callback('📊 View Profile', `view_profile_${userId}`)],
        [Markup.button.callback('👥 View Soldiers', `view_soldiers_${userId}`)],
        [Markup.button.callback('🏆 Leaderboard', `view_leaderboard_${userId}`)]
      ]);
      
      await ctx.reply(
        `📋 <b>TRAINING REPORT</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🛡️ <b>Commander:</b> ${mention}\n` +
        `⚔️ <b>Phases Completed:</b> ${phasesWon}/${PHASES.length}\n\n` +
        `🏆 <b>REWARDS SUMMARY</b>\n` +
        `├─ XP Earned: ${totalXP}\n` +
        `└─ Moons Earned: ${totalCoins} 🌙\n\n` +
        `📈 <b>NEW TOTALS</b>\n` +
        `├─ Total XP: ${user.xp}\n` +
        `├─ Total Moons: ${user.balance} 🌙\n` +
        `└─ Regiment Power: ${user.totalPower} ⚡\n\n` +
        `⚔️ <b>TRAINING STATS</b>\n` +
        `├─ Victories: ${user.trainingWins}\n` +
        `└─ Defeats: ${user.trainingLosses}\n\n` +
        `«Your soldiers have grown stronger.»\n` +
        `— Mikasa\n\n` +
        `⏰ <b>Next training available in 6 hours</b>\n` +
        `📊 Check progress with /profile`,
        { 
          parse_mode: "HTML",
          reply_markup: finalButtons.reply_markup,
          reply_to_message_id: ctx.message.message_id
        }
      );

    } catch (err) {
      console.error("TRAIN ERROR:", err);
      await ctx.reply(
        `⚠️ <b>TRAINING INTERRUPTED</b>\n\n` +
        `«Combat simulation failed. Regroup and try again.»\n` +
        `— Mikasa`,
        { 
          parse_mode: "HTML", 
          reply_to_message_id: ctx.message.message_id 
        }
      );
    }
  });

  // ─── CALLBACK HANDLERS ────────────────────
  bot.action(/^view_profile_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.match[1];
      const user = await User.findOne({ telegramId: userId });
      
      if (!user) return;
      
      const firstName = ctx.from.first_name || 'Commander';
      const mention = `<a href="tg://user?id=${userId}">${firstName}</a>`;
      const winRate = user.trainingWins + user.trainingLosses > 0 
        ? Math.round((user.trainingWins / (user.trainingWins + user.trainingLosses)) * 100)
        : 0;
      
      await ctx.reply(
        `📊 <b>SOLDIER PROFILE</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🛡️ <b>${firstName}</b>\n\n` +
        `📈 <b>STATISTICS</b>\n` +
        `├─ Total XP: ${user.xp || 0}\n` +
        `├─ Moons Balance: ${user.balance || 0} 🌙\n` +
        `├─ Soldiers: ${user.shadows.length}\n` +
        `├─ Regiment Power: ${user.totalPower} ⚡\n` +
        `└─ Total Stars: ${user.totalStars} ⭐\n\n` +
        `⚔️ <b>TRAINING RECORD</b>\n` +
        `├─ Victories: ${user.trainingWins || 0}\n` +
        `├─ Defeats: ${user.trainingLosses || 0}\n` +
        `└─ Win Rate: ${winRate}%\n\n` +
        `📅 <b>Last Training:</b> ${user.lastTrainAt ? new Date(user.lastTrainAt * 1000).toLocaleDateString() : 'Never'}\n` +
        `📅 <b>First Seen:</b> ${new Date(user.firstSeenAt * 1000).toLocaleDateString()}\n\n` +
        `«Your journey continues.»\n` +
        `— Mikasa`,
        { 
          parse_mode: "HTML",
          reply_to_message_id: ctx.message?.message_id 
        }
      );
    } catch (err) {
      console.error("Profile view error:", err);
      await ctx.answerCbQuery("Error loading profile");
    }
  });

  bot.action(/^view_soldiers_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.match[1];
      const user = await User.findOne({ telegramId: userId });
      
      if (!user || !user.shadows || user.shadows.length === 0) {
        await ctx.reply(
          `No soldiers available. Use /arise to recruit soldiers.`,
          { reply_to_message_id: ctx.message?.message_id }
        );
        return;
      }
      
      await ctx.reply(
        `👥 <b>SOLDIERS ROSTER</b>\n\n` +
        `Total Soldiers: ${user.shadows.length}\n` +
        `Use /shadow to view all your soldiers.`,
        { 
          parse_mode: "HTML",
          reply_to_message_id: ctx.message?.message_id 
        }
      );
    } catch (err) {
      console.error("Soldiers view error:", err);
      await ctx.answerCbQuery("Error loading soldiers");
    }
  });

  bot.action(/^view_leaderboard_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.reply(
        `Use /arisers to view the global leaderboard rankings.`,
        { reply_to_message_id: ctx.message?.message_id }
      );
    } catch (err) {
      console.error("Leaderboard error:", err);
      await ctx.answerCbQuery("Error loading leaderboard");
    }
  });
}