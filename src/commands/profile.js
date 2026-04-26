// src/commands/profile.js
import { User } from "../models/User.js";

/**
 * Calculate win percentage safely
 */
function winRate(wins = 0, losses = 0) {
  const total = wins + losses;
  if (total === 0) return "0%";
  return `${Math.round((wins / total) * 100)}%`;
}

/**
 * Calculate level from XP
 */
function calculateLevel(xp = 0) {
  // XP required for each level: level * 100
  let level = 1;
  let xpNeeded = 100; // Level 2 needs 100 XP
  
  while (xp >= xpNeeded) {
    level++;
    xp -= xpNeeded;
    xpNeeded = level * 100;
  }
  
  const nextLevelXP = xpNeeded;
  const progress = xp;
  const progressPercent = Math.round((progress / nextLevelXP) * 100);
  
  return { level, progress, nextLevelXP, progressPercent };
}

/**
 * Get training cooldown status
 */
function getTrainingCooldown(lastTrainAt) {
  const TRAIN_COOLDOWN = 60 * 60 * 6; // 6 hours
  const now = Math.floor(Date.now() / 1000);
  
  if (!lastTrainAt) {
    return { available: true, remaining: 0, display: "Ready" };
  }
  
  const remaining = TRAIN_COOLDOWN - (now - lastTrainAt);
  
  if (remaining <= 0) {
    return { available: true, remaining: 0, display: "Ready" };
  }
  
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.ceil((remaining % 3600) / 60);
  
  let display = "";
  if (hours > 0) display += `${hours}h `;
  display += `${minutes}m`;
  
  return {
    available: false,
    remaining,
    display
  };
}

/**
 * Get rank title based on level
 */
function getRankTitle(level) {
  if (level >= 50) return "🏆 Supreme Commander";
  if (level >= 30) return "⭐ Elite Veteran";
  if (level >= 20) return "⚔️ Battle Captain";
  if (level >= 10) return "🛡️ Seasoned Soldier";
  if (level >= 5) return "🎖️ Trained Recruit";
  return "👤 New Recruit";
}

/**
 * Get training status based on wins/losses
 */
function getTrainingStatus(wins, losses) {
  const total = wins + losses;
  if (total === 0) return "Untested";
  if (wins === 0) return "Novice";
  if (losses === 0) return "Undefeated";
  
  const ratio = wins / total;
  if (ratio >= 0.8) return "Elite";
  if (ratio >= 0.6) return "Veteran";
  if (ratio >= 0.4) return "Competent";
  return "Learning";
}

/**
 * Format date for display
 */
function formatDate(timestamp) {
  if (!timestamp) return "Never";
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Create progress bar
 */
function createProgressBar(percent, length = 10) {
  const filled = Math.round((percent / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export function profileCommand(bot) {
  bot.command("profile", async (ctx) => {
    try {
      if (!ctx.from) return;

      const userId = ctx.from.id;
      const name = ctx.from.first_name || "Scout";
      const username = ctx.from.username ? `@${ctx.from.username}` : "Not set";
      const mention = `<a href="tg://user?id=${userId}">${name}</a>`;

      // ─── FETCH USER DATA ───────────────────
      let user = await User.findOne({ telegramId: userId });

      if (!user) {
        // Create new user if doesn't exist
        user = new User({
          telegramId: userId,
          firstName: name,
          username: ctx.from.username,
          xp: 0,
          balance: 1000,
          level: 1,
          shadows: [],
          totalStars: 0,
          totalPower: 0,
          trainingWins: 0,
          trainingLosses: 0,
          lastTrainAt: 0,
          firstSeenAt: Math.floor(Date.now() / 1000),
          lastSeenAt: Math.floor(Date.now() / 1000)
        });
        await user.save();
      }

      // Update last seen
      user.lastSeenAt = Math.floor(Date.now() / 1000);
      await user.save();

      // ─── CALCULATE METRICS ────────────────
      const levelInfo = calculateLevel(user.xp || 0);
      const cooldown = getTrainingCooldown(user.lastTrainAt || 0);
      const rankTitle = getRankTitle(levelInfo.level);
      const trainingStatus = getTrainingStatus(user.trainingWins || 0, user.trainingLosses || 0);
      const winRatePercent = winRate(user.trainingWins || 0, user.trainingLosses || 0);
      
      // Progress bar for level
      const levelProgressBar = createProgressBar(levelInfo.progressPercent);
      
      // Progress bar for training win rate
      const winRateNumber = parseInt(winRatePercent);
      const trainingProgressBar = createProgressBar(winRateNumber);

      // ─── BUILD PROFILE CAPTION ────────────
      const caption =
        `🛡️ <b>SURVEY CORPS PROFILE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        
        `👤 <b>COMMANDER INFORMATION</b>\n` +
        `├─ Name: ${mention}\n` +
        `├─ Username: ${username}\n` +
        `├─ ID: <code>${userId}</code>\n` +
        `└─ Rank: ${rankTitle}\n\n` +
        
        `📊 <b>PROGRESSION SYSTEM</b>\n` +
        `├─ Level: <b>${levelInfo.level}</b>\n` +
        `├─ XP: ${user.xp || 0}/${levelInfo.nextLevelXP}\n` +
        `└─ Progress: ${levelProgressBar} ${levelInfo.progressPercent}%\n\n` +
        
        `💰 <b>ECONOMY STATUS</b>\n` +
        `├─ Moons Balance: <b>${user.balance || 0} 🌙</b>\n` +
        `├─ Daily Income: ~${Math.floor((user.xp || 0) / 10)} 🌙\n` +
        `└─ Wealth Status: ${user.balance >= 10000 ? "Rich" : user.balance >= 5000 ? "Wealthy" : user.balance >= 1000 ? "Stable" : "Developing"}\n\n` +
        
        `⚔️ <b>MILITARY STRENGTH</b>\n` +
        `├─ Soldiers: <b>${user.shadows?.length || 0}</b>\n` +
        `├─ Total Power: ${user.totalPower || 0} ⚡\n` +
        `└─ Total Stars: ${user.totalStars || 0} ⭐\n\n` +
        
        `🎯 <b>TRAINING STATISTICS</b>\n` +
        `├─ Victories: ${user.trainingWins || 0}\n` +
        `├─ Defeats: ${user.trainingLosses || 0}\n` +
        `├─ Win Rate: ${winRatePercent}\n` +
        `├─ Performance: ${trainingProgressBar}\n` +
        `└─ Status: ${trainingStatus}\n\n` +
        
        `⏰ <b>TRAINING AVAILABILITY</b>\n` +
        (user.shadows?.length === 0 ?
          `└─ ⚠️ No soldiers available\n` +
          `   Use /arise to recruit first\n` :
          cooldown.available ?
          `└─ ✅ <b>Ready for training!</b>\n` +
          `   Use /train to begin\n` :
          `└─ ⏳ Available in: ${cooldown.display}\n` +
          `   ${formatDate(user.lastTrainAt)}\n`)
        + `\n` +
        
        `📅 <b>ACTIVITY LOG</b>\n` +
        `├─ First Seen: ${formatDate(user.firstSeenAt)}\n` +
        `├─ Last Active: ${formatDate(user.lastSeenAt)}\n` +
        `└─ Days Active: ${Math.floor((user.lastSeenAt - user.firstSeenAt) / (60 * 60 * 24)) || 1}\n\n` +
        
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `«Your strength is measured by your will.»\n` +
        `— Mikasa`;

      // ─── CREATE INTERACTIVE BUTTONS ────────
      const buttons = [];
      
      // Primary action row
      const primaryRow = [];
      if (user.shadows?.length > 0 && cooldown.available) {
        primaryRow.push({ text: '⚔️ Start Training', callback_data: 'start_training' });
      } else {
        primaryRow.push({ text: '📊 View Stats', callback_data: 'view_detailed_stats' });
      }
      
      if (user.shadows?.length > 0) {
        primaryRow.push({ text: '👥 View Soldiers', callback_data: 'view_soldiers_list' });
      }
      
      if (primaryRow.length > 0) {
        buttons.push(primaryRow);
      }
      
      // Secondary action row
      buttons.push([
        { text: '🏆 Leaderboard', callback_data: 'view_leaderboard' },
        { text: '💰 Moon Shop', callback_data: 'view_moon_shop' }
      ]);
      
      // Profile management row
      buttons.push([
        { text: '🔄 Refresh', callback_data: 'refresh_profile' },
        { text: '📈 Progress', callback_data: 'view_progress' }
      ]);

      // ─── SEND PROFILE WITH PHOTO ───────────
      try {
        const photos = await ctx.telegram.getUserProfilePhotos(userId, 0, 1);
        
        if (photos.total_count > 0 && photos.photos[0] && photos.photos[0][0]) {
          const fileId = photos.photos[0][0].file_id;
          return ctx.replyWithPhoto(fileId, {
            caption,
            parse_mode: "HTML",
            reply_to_message_id: ctx.message?.message_id,
            reply_markup: { inline_keyboard: buttons }
          });
        }
      } catch (photoErr) {
        console.log("Profile photo error:", photoErr);
        // Continue without photo
      }

      // ─── FALLBACK: TEXT ONLY ──────────────
      await ctx.reply(caption, {
        parse_mode: "HTML",
        reply_to_message_id: ctx.message?.message_id,
        reply_markup: { inline_keyboard: buttons }
      });

    } catch (err) {
      console.error("PROFILE ERROR:", err);
      await ctx.reply(
        `⚠️ <b>Profile Error</b>\n\n` +
        `«System malfunction. Report to command.»\n` +
        `— Mikasa`,
        { 
          parse_mode: "HTML", 
          reply_to_message_id: ctx.message?.message_id 
        }
      );
    }
  });

  // ─── CALLBACK HANDLERS ────────────────────
  bot.action('start_training', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      // Redirect to /train command
      await ctx.reply(
        `⚔️ <b>REDIRECTING TO TRAINING</b>\n\n` +
        `Use the command /train to begin your training session.\n\n` +
        `«Prepare your soldiers for battle.»\n` +
        `— Mikasa`,
        { parse_mode: "HTML" }
      );
      
    } catch (err) {
      console.error("Training redirect error:", err);
      await ctx.answerCbQuery("Error starting training");
    }
  });

  bot.action('view_soldiers_list', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.reply(
        `Use /shadow to view your complete soldiers roster.`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      console.error("Soldiers list error:", err);
    }
  });

  bot.action('view_leaderboard', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.reply(
        `Use /arisers to view the global leaderboard rankings.`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      console.error("Leaderboard error:", err);
    }
  });

  bot.action('view_moon_shop', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.reply(
        `🏪 <b>MOON COINS SHOP</b>\n\n` +
        `Shop system under development!\n\n` +
        `«Save your moons for future upgrades.»\n` +
        `— Mikasa`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      console.error("Shop error:", err);
    }
  });

  bot.action('view_detailed_stats', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const user = await User.findOne({ telegramId: ctx.from.id });
      if (!user) return;
      
      await ctx.reply(
        `📈 <b>DETAILED STATISTICS</b>\n━━━━━━━━━━━━━━\n\n` +
        `📊 <b>Combat Metrics</b>\n` +
        `├─ Attack Success: ${user.successfulAttacks || 0}/${user.totalAttacks || 0}\n` +
        `├─ Defense Status: ${user.blockStatus || "UnImmune"}\n` +
        `└─ Wish Success: ${user.wishSuccess || 0}/${user.wishCount || 0}\n\n` +
        `📅 <b>Activity Metrics</b>\n` +
        `├─ First Arise: ${formatDate(user.firstSeenAt)}\n` +
        `├─ Last Arise: ${formatDate(user.lastAriseAt)}\n` +
        `└─ Training Sessions: ${(user.trainingWins || 0) + (user.trainingLosses || 0)}\n\n` +
        `⚡ <b>Performance Index</b>\n` +
        `├─ Power per Soldier: ${user.shadows?.length > 0 ? Math.round(user.totalPower / user.shadows.length) : 0} ⚡\n` +
        `├─ Stars per Soldier: ${user.shadows?.length > 0 ? (user.totalStars / user.shadows.length).toFixed(1) : 0} ⭐\n` +
        `└─ Efficiency Rating: ${Math.round((user.xp || 0) / Math.max(1, (user.trainingWins || 0) + (user.trainingLosses || 0)))} XP/session\n\n` +
        `«Numbers tell only part of the story.»\n` +
        `— Mikasa`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      console.error("Detailed stats error:", err);
    }
  });

  bot.action('view_progress', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const user = await User.findOne({ telegramId: ctx.from.id });
      if (!user) return;
      
      const levelInfo = calculateLevel(user.xp || 0);
      
      await ctx.reply(
        `📊 <b>PROGRESS TRACKER</b>\n━━━━━━━━━━━━━━\n\n` +
        `🎯 <b>Level Progress</b>\n` +
        `├─ Current Level: ${levelInfo.level}\n` +
        `├─ XP Collected: ${user.xp || 0}\n` +
        `├─ XP to Next Level: ${levelInfo.progress}/${levelInfo.nextLevelXP}\n` +
        `└─ Completion: ${levelInfo.progressPercent}%\n\n` +
        `🏆 <b>Next Level Rewards</b>\n` +
        `├─ Moons: +${levelInfo.level * 100} 🌙\n` +
        `├─ XP Boost: +10%\n` +
        `└─ New Rank: ${getRankTitle(levelInfo.level + 1)}\n\n` +
        `📈 <b>Milestones</b>\n` +
        `Level 5: ${levelInfo.level >= 5 ? '✅' : '❌'} Trained Recruit\n` +
        `Level 10: ${levelInfo.level >= 10 ? '✅' : '❌'} Seasoned Soldier\n` +
        `Level 20: ${levelInfo.level >= 20 ? '✅' : '❌'} Battle Captain\n` +
        `Level 30: ${levelInfo.level >= 30 ? '✅' : '❌'} Elite Veteran\n` +
        `Level 50: ${levelInfo.level >= 50 ? '✅' : '❌'} Supreme Commander\n\n` +
        `«Every level brings new strength.»\n` +
        `— Mikasa`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      console.error("Progress error:", err);
    }
  });

  bot.action('refresh_profile', async (ctx) => {
    try {
      await ctx.answerCbQuery("Refreshing profile...");
      
      // Update last seen
      const user = await User.findOne({ telegramId: ctx.from.id });
      if (user) {
        user.lastSeenAt = Math.floor(Date.now() / 1000);
        await user.save();
      }
      
      // Delete old message and show updated profile
      try {
        await ctx.deleteMessage();
      } catch (e) {}
      
      // Trigger profile command again
      const name = ctx.from.first_name || "Scout";
      const mention = `<a href="tg://user?id=${ctx.from.id}">${name}</a>`;
      
      await ctx.reply(
        `🔄 <b>PROFILE REFRESHED</b>\n\n` +
        `${mention}, your profile has been updated.\n\n` +
        `«Current status confirmed.»\n` +
        `— Mikasa`,
        { parse_mode: "HTML" }
      );
      
    } catch (err) {
      console.error("Refresh error:", err);
      await ctx.answerCbQuery("Refresh failed");
    }
  });
}