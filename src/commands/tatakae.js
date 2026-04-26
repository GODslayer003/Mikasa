// src/commands/tatakae.js
import { User } from "../models/User.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CONFIG ─────────────────────────────────
const FOLDER_CONFIG = {
  attack: { chance: 70, hpEffect: [-5, -1], coins: 0, cooldown: 0 },
  block: { chance: 10, hpEffect: [1, 5], coins: 0, cooldown: 60 }, // 1 minute
  sasageyo: { chance: 10, hpEffect: [-14, -7], coins: 0, cooldown: 0 },
  erwin: { chance: 15, hpEffect: [10, 10], coins: 0, cooldown: 0 },
  eren: { chance: 5, hpEffect: [-15, -15], coins: 500, cooldown: 0 },
  mikasa: { chance: 5, hpEffect: [0, 0], coins: 500, cooldown: 60 } // 1 minute protection
};

const MAX_HP = 100;
const DEFEAT_COOLDOWN = 24 * 60 * 60; // 24 hours
const SCARF_COOLDOWN = 10 * 60; // 10 minutes
const DEFEAT_REWARD = 1000; // Coins for defeating someone

// ─── HELPERS ────────────────────────────────
function getRandomFolder() {
  const rand = Math.random() * 100;
  let cumulative = 0;
  
  for (const [folder, config] of Object.entries(FOLDER_CONFIG)) {
    cumulative += config.chance;
    if (rand <= cumulative) {
      return folder;
    }
  }
  return 'attack'; // fallback
}

function getRandomImage(folderPath) {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Folder not found: ${folderPath}`);
  }
  
  const files = fs.readdirSync(folderPath)
    .filter(f => /\.(png|jpg|jpeg|gif)$/i.test(f));
  
  if (files.length === 0) {
    throw new Error(`No images in folder: ${folderPath}`);
  }
  
  const randomFile = files[Math.floor(Math.random() * files.length)];
  return path.join(folderPath, randomFile);
}

function getRandomHPEffect(hpEffectRange) {
  const [min, max] = hpEffectRange;
  return min === max ? min : Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function getHealthBar(hp) {
  const full = "█";
  const empty = "░";
  const totalBars = 10;
  const filledBars = Math.max(0, Math.floor((hp / MAX_HP) * totalBars));
  return full.repeat(filledBars) + empty.repeat(totalBars - filledBars);
}

// ─── COMMANDS ───────────────────────────────
export function tatakaeCommands(bot) {
  // ─── /tatakae command ──────────────────────
  bot.command("tatakae", async (ctx) => {
    try {
      // Check if in group
      if (!ctx.chat || ctx.chat.type === 'private') {
        return ctx.reply(
          `⚠️ <b>Group Only Command</b>\n\n` +
          `This command only works in groups.\n\n` +
          `«Battle requires opponents.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // Check if user replied to someone
      if (!ctx.message.reply_to_message) {
        return ctx.reply(
          `⚔️ <b>Invalid Target</b>\n\n` +
          `You must reply to someone's message to attack them.\n\n` +
          `«Choose your opponent wisely.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      const attackerId = ctx.from.id;
      const attackerName = ctx.from.first_name || "Soldier";
      const targetId = ctx.message.reply_to_message.from.id;
      const targetName = ctx.message.reply_to_message.from.first_name || "Opponent";

      // Can't attack yourself
      if (attackerId === targetId) {
        return ctx.reply(
          `❌ <b>Self-Harm Prevention</b>\n\n` +
          `You cannot attack yourself.\n\n` +
          `«The battlefield is for enemies, not yourself.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // Check if target is a bot
      if (ctx.message.reply_to_message.from.is_bot) {
        return ctx.reply(
          `🤖 <b>Invalid Target</b>\n\n` +
          `You cannot attack bots.\n\n` +
          `«Machines don't feel pain.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      const now = Math.floor(Date.now() / 1000);

      // ─── CHECK ATTACKER STATUS ─────────────
      let attacker = await User.findOne({ telegramId: attackerId });
      if (!attacker) {
        attacker = await User.create({
          telegramId: attackerId,
          firstName: attackerName,
          hp: MAX_HP,
          isScarfed: false,
          lastTatakaeAt: 0,
          tatakaeCooldown: 0, // Initialize cooldown
          scarfUsedAt: 0,
          defeatedAt: 0,
          moons: 1000
        });
      }

      // Check if attacker is defeated
      if (attacker.defeatedAt && (now - attacker.defeatedAt < DEFEAT_COOLDOWN)) {
        const remaining = DEFEAT_COOLDOWN - (now - attacker.defeatedAt);
        return ctx.reply(
          `💀 <b>You Are Defeated</b>\n\n` +
          `You cannot attack while recovering.\n` +
          `Wait ${formatTime(remaining)}.\n\n` +
          `«Heal your wounds first.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // Check if attacker is scarfed
      if (attacker.isScarfed) {
        return ctx.reply(
          `🧣 <b>Scarf Protection</b>\n\n` +
          `You are wearing Mikasa's scarf.\n` +
          `You cannot attack while protected.\n\n` +
          `«Use /shinzowosasageyo to remove scarf.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // Check attacker cooldown (from block) - FIXED: Only check if tatakaeCooldown > 0
      if (attacker.tatakaeCooldown > 0 && attacker.lastTatakaeAt && 
          (now - attacker.lastTatakaeAt < attacker.tatakaeCooldown)) {
        const remaining = attacker.tatakaeCooldown - (now - attacker.lastTatakaeAt);
        return ctx.reply(
          `⏳ <b>Cooldown Active</b>\n\n` +
          `You can attack again in ${formatTime(remaining)}.\n\n` +
          `«Wait for the right moment.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // ─── CHECK TARGET STATUS ───────────────
      let target = await User.findOne({ telegramId: targetId });
      if (!target) {
        target = await User.create({
          telegramId: targetId,
          firstName: targetName,
          hp: MAX_HP,
          isScarfed: false,
          lastTatakaeAt: 0,
          tatakaeCooldown: 0,
          scarfUsedAt: 0,
          defeatedAt: 0,
          moons: 1000
        });
      }

      // Check if target is defeated
      if (target.defeatedAt && (now - target.defeatedAt < DEFEAT_COOLDOWN)) {
        return ctx.reply(
          `💀 <b>Target Defeated</b>\n\n` +
          `${targetName} is already defeated.\n` +
          `They cannot be attacked.\n\n` +
          `«Don't attack the fallen.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // Check if target is scarfed
      if (target.isScarfed) {
        return ctx.reply(
          `🧣 <b>Protected Target</b>\n\n` +
          `${targetName} is wearing Mikasa's scarf.\n` +
          `They are protected from attacks.\n\n` +
          `«The scarf protects them.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // Check if target has Mikasa protection
      if (target.mikasaProtectionUntil && now < target.mikasaProtectionUntil) {
        return ctx.reply(
          `🛡️ <b>Mikasa's Protection</b>\n\n` +
          `${targetName} is under Mikasa's protection.\n` +
          `You cannot attack them yet.\n\n` +
          `«Mikasa watches over them.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // ─── ROLL RANDOM ACTION ────────────────
      const folder = getRandomFolder();
      const config = FOLDER_CONFIG[folder];
      const folderPath = path.join(__dirname, "..", "..", "assets", folder);
      
      const imagePath = getRandomImage(folderPath);
      const hpEffect = getRandomHPEffect(config.hpEffect);
      
      let caption = '';
      let attackerReward = 0;
      let targetDefeated = false;
      
      // Reset cooldown if not block (FIXED: Only set cooldown for block)
      if (folder !== 'block') {
        attacker.tatakaeCooldown = 0; // Clear any existing cooldown
      }
      
      // Update HP based on folder
      if (folder === 'erwin') {
        // Erwin: Attacker gains HP
        attacker.hp = Math.min(MAX_HP, attacker.hp + hpEffect);
        caption = `🎖️ <b>ERWIN'S SPEECH</b>\n\n` +
                 `${attackerName} gains <b>+${hpEffect} HP</b>!\n` +
                 `${getHealthBar(attacker.hp)} ${attacker.hp}/${MAX_HP}\n\n` +
                 `«SHINZOU WO SASAGEYO!»\n— Erwin Smith`;
        
      } else if (folder === 'mikasa') {
        // Mikasa: Attacker gets coins and protection
        attacker.moons = (attacker.moons || 0) + config.coins;
        attacker.mikasaProtectionUntil = now + config.cooldown;
        caption = `🧣 <b>MIKASA'S PROTECTION</b>\n\n` +
                 `${attackerName} receives Mikasa's protection!\n` +
                 `💰 +${config.coins} Moons\n` +
                 `🛡️ Protected for 1 minute\n` +
                 `${getHealthBar(attacker.hp)} ${attacker.hp}/${MAX_HP}\n\n` +
                 `«I'll protect you.»\n— Mikasa Ackerman`;
        attackerReward = config.coins;
        
      } else if (folder === 'block') {
        // Block: Target gains HP, attacker gets cooldown
        target.hp = Math.min(MAX_HP, target.hp + hpEffect);
        attacker.tatakaeCooldown = config.cooldown; // Only set cooldown for block
        caption = `🛡️ <b>SUCCESSFUL BLOCK</b>\n\n` +
                 `${targetName} blocks the attack!\n` +
                 `💚 +${hpEffect} HP for ${targetName}\n` +
                 `${getHealthBar(target.hp)} ${target.hp}/${MAX_HP}\n` +
                 `⏳ ${attackerName} cooldown: 1 minute\n\n` +
                 `«Your attack was deflected.»\n— Mikasa`;
                 
      } else {
        // Attack/Sasageyo/Eren: Target loses HP
        target.hp = Math.max(0, target.hp + hpEffect); // hpEffect is negative
        
        const actionName = folder === 'eren' ? 'EREN\'S RAGE' :
                          folder === 'sasageyo' ? 'SASAGEYO CHARGE' : 'ATTACK';
        
        caption = `⚔️ <b>${actionName}</b>\n\n` +
                 `${attackerName} attacks ${targetName}!\n` +
                 `💔 ${Math.abs(hpEffect)} HP to ${targetName}\n` +
                 `${getHealthBar(target.hp)} ${target.hp}/${MAX_HP}\n\n`;
        
        if (folder === 'eren') {
          attacker.moons = (attacker.moons || 0) + config.coins;
          caption += `💰 +${config.coins} Moons for ${attackerName}\n\n`;
          attackerReward = config.coins;
        }
        
        caption += `«Tatakae!»\n— ${folder === 'eren' ? 'Eren Yeager' : 'Mikasa'}`;
        
        // Check if target is defeated
        if (target.hp <= 0) {
          targetDefeated = true;
          target.hp = 0;
          target.defeatedAt = now;
          attacker.moons = (attacker.moons || 0) + DEFEAT_REWARD;
          caption += `\n\n💀 <b>DEFEAT!</b>\n` +
                    `${targetName} has been defeated!\n` +
                    `💰 ${attackerName} gains +${DEFEAT_REWARD} Moons\n` +
                    `⏳ ${targetName} is out for 24 hours`;
        }
      }

      // ─── UPDATE DATABASE ───────────────────
      attacker.lastTatakaeAt = now;
      await attacker.save();
      
      await target.save();

      // ─── SEND RESULT ───────────────────────
      await ctx.replyWithPhoto(
        { source: imagePath },
        {
          caption,
          parse_mode: "HTML",
          reply_to_message_id: ctx.message.message_id
        }
      );

    } catch (err) {
      console.error("TATAKAE ERROR:", err);
      await ctx.reply(
        `⚠️ <b>Battle Error</b>\n\n` +
        `«The battlefield is chaotic. Try again.»\n` +
        `— Mikasa`,
        { 
          parse_mode: "HTML", 
          reply_to_message_id: ctx.message.message_id 
        }
      );
    }
  });

  // ─── /scarf command ───────────────────────
  bot.command("scarf", async (ctx) => {
    try {
      const userId = ctx.from.id;
      const userName = ctx.from.first_name || "Soldier";
      const now = Math.floor(Date.now() / 1000);

      let user = await User.findOne({ telegramId: userId });
      if (!user) {
        user = await User.create({
          telegramId: userId,
          firstName: userName,
          hp: MAX_HP,
          isScarfed: false,
          lastTatakaeAt: 0,
          tatakaeCooldown: 0,
          scarfUsedAt: 0,
          defeatedAt: 0,
          moons: 1000
        });
      }

      // Check if recently used scarf
      if (user.scarfUsedAt && (now - user.scarfUsedAt < SCARF_COOLDOWN)) {
        const remaining = SCARF_COOLDOWN - (now - user.scarfUsedAt);
        return ctx.reply(
          `🧣 <b>Scarf Cooldown</b>\n\n` +
          `You recently used the scarf.\n` +
          `Wait ${formatTime(remaining)} before using again.\n\n` +
          `«The scarf needs time to recharge.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // Check if already scarfed
      if (user.isScarfed) {
        return ctx.reply(
          `🧣 <b>Already Protected</b>\n\n` +
          `You are already wearing Mikasa's scarf.\n\n` +
          `«You're already protected.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // Apply scarf
      user.isScarfed = true;
      user.scarfUsedAt = now;
      await user.save();

      await ctx.reply(
        `🧣 <b>Scarf Equipped</b>\n\n` +
        `${userName}, you are now wearing Mikasa's scarf.\n` +
        `⚔️ You cannot use /tatakae command\n` +
        `🛡️ Others cannot attack you\n` +
        `⏳ Use /shinzowosasageyo to remove scarf\n\n` +
        `«I give you my scarf. Stay safe.»\n` +
        `— Mikasa`,
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );

    } catch (err) {
      console.error("SCARF ERROR:", err);
      await ctx.reply(
        `⚠️ <b>Scarf Error</b>\n\n` +
        `«The scarf got tangled. Try again.»\n` +
        `— Mikasa`,
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    }
  });

  // ─── /shinzowosasageyo command ────────────
  bot.command("shinzowosasageyo", async (ctx) => {
    try {
      const userId = ctx.from.id;
      const userName = ctx.from.first_name || "Soldier";
      const now = Math.floor(Date.now() / 1000);

      let user = await User.findOne({ telegramId: userId });
      if (!user) {
        return ctx.reply(
          `❌ <b>No Scarf Found</b>\n\n` +
          `You don't have a scarf to remove.\n\n` +
          `«Use /scarf first to get protection.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // Check if wearing scarf
      if (!user.isScarfed) {
        return ctx.reply(
          `❌ <b>No Scarf Equipped</b>\n\n` +
          `You are not wearing Mikasa's scarf.\n\n` +
          `«You need to wear it first to remove it.»\n` +
          `— Mikasa`,
          { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
        );
      }

      // Remove scarf
      user.isScarfed = false;
      await user.save();

      await ctx.reply(
        `🎖️ <b>Scarf Removed</b>\n\n` +
        `${userName} removes Mikasa's scarf!\n` +
        `⚔️ You can now use /tatakae again\n` +
        `🎯 Others can now attack you\n` +
        `⏳ You can use /scarf again in 10 minutes\n\n` +
        `«Dedicate your hearts! SHINZOU WO SASAGEYO!»\n` +
        `— Erwin Smith`,
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );

    } catch (err) {
      console.error("SHINZOWOSASAGEYO ERROR:", err);
      await ctx.reply(
        `⚠️ <b>Command Error</b>\n\n` +
        `«The command failed. Try again.»\n` +
        `— Mikasa`,
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    }
  });

  // ─── /stats command ───────────────────────
  bot.command("stats", async (ctx) => {
    try {
      const userId = ctx.from.id;
      const userName = ctx.from.first_name || "Soldier";
      const now = Math.floor(Date.now() / 1000);

      let user = await User.findOne({ telegramId: userId });
      if (!user) {
        user = await User.create({
          telegramId: userId,
          firstName: userName,
          hp: MAX_HP,
          isScarfed: false,
          lastTatakaeAt: 0,
          tatakaeCooldown: 0,
          scarfUsedAt: 0,
          defeatedAt: 0,
          moons: 1000
        });
      }

      // Calculate status
      let status = `🟢 Active`;
      let statusDetails = '';
      
      if (user.defeatedAt && (now - user.defeatedAt < DEFEAT_COOLDOWN)) {
        const remaining = DEFEAT_COOLDOWN - (now - user.defeatedAt);
        status = `💀 Defeated`;
        statusDetails = `⏳ Back in: ${formatTime(remaining)}`;
      } else if (user.isScarfed) {
        status = `🧣 Protected`;
        statusDetails = `⚔️ Cannot attack/be attacked`;
      } else if (user.tatakaeCooldown > 0 && user.lastTatakaeAt && 
                (now - user.lastTatakaeAt < user.tatakaeCooldown)) {
        const remaining = user.tatakaeCooldown - (now - user.lastTatakaeAt);
        status = `⏳ Cooldown`;
        statusDetails = `Next attack in: ${formatTime(remaining)}`;
      }

      // Calculate protections
      let protections = [];
      if (user.mikasaProtectionUntil && now < user.mikasaProtectionUntil) {
        const remaining = user.mikasaProtectionUntil - now;
        protections.push(`🛡️ Mikasa: ${formatTime(remaining)}`);
      }
      
      if (user.isScarfed) {
        protections.push(`🧣 Scarf: Active`);
      }
      
      const protectionText = protections.length > 0 ? protections.join('\n') : 'None';

      await ctx.reply(
        `📊 <b>BATTLE STATISTICS</b>\n━━━━━━━━━━━━━━\n\n` +
        `👤 <b>${userName}</b>\n\n` +
        `💚 <b>Health Status</b>\n` +
        `${getHealthBar(user.hp)} ${user.hp}/${MAX_HP}\n\n` +
        `💰 <b>Economy</b>\n` +
        `├─ Moons: ${user.moons || 0} 🌙\n` +
        `└─ Total Coins: ${user.getTotalCoins ? user.getTotalCoins() : user.moons || 0} 🌙\n\n` +
        `🎯 <b>Battle Status</b>\n` +
        `├─ Status: ${status}\n` +
        `${statusDetails ? `├─ ${statusDetails}\n` : ''}` +
        `└─ Last Action: ${user.lastTatakaeAt ? formatTime(now - user.lastTatakaeAt) + ' ago' : 'Never'}\n\n` +
        `🛡️ <b>Protections</b>\n` +
        `${protectionText}\n\n` +
        `━━━━━━━━━━━━━━\n` +
        `«Your strength defines you.»\n` +
        `— Mikasa`,
        { 
          parse_mode: "HTML", 
          reply_to_message_id: ctx.message.message_id 
        }
      );

    } catch (err) {
      console.error("STATS ERROR:", err);
      await ctx.reply(
        `⚠️ <b>Status Error</b>\n\n` +
        `«Cannot check your status now.»\n` +
        `— Mikasa`,
        { 
          parse_mode: "HTML", 
          reply_to_message_id: ctx.message.message_id 
        }
      );
    }
  });
}