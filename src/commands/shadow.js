// src/commands/shadow.js
import { User } from "../models/User.js";
import { LEVELS } from "../game/levels.js";
import fs from "fs";

// ─── CONFIG ─────────────────────────────────
const MAX_ITEMS_PER_PAGE = 10; // 2 columns × 5 rows = 10 items per page (2 items per row)

// ─── HELPERS ────────────────────────────────
function normalizeLevel(level) {
  if (!level) return "LOW";
  const map = {
    "Low Level": "LOW",
    "Mid Level": "MID",
    "Top Level": "TOP",
    "Legend Level": "LEGEND",
    "Ultra Level": "ULTRA",
    LOW: "LOW",
    MID: "MID",
    TOP: "TOP",
    LEGEND: "LEGEND",
    ULTRA: "ULTRA"
  };
  return map[level] || "LOW";
}

function getLevelInfo(levelKey) {
  return LEVELS[levelKey] || LEVELS.LOW;
}

function getLevelColor(levelKey) {
  switch (levelKey) {
    case "ULTRA": return "🔴";
    case "LEGEND": return "🟣";
    case "TOP": return "🔵";
    case "MID": return "🟢";
    default: return "⚪";
  }
}

function truncateName(name, maxLength = 10) {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength - 1) + "…";
}

function create2ColumnGrid(pageItems, start, userId) {
  const buttons = [];
  const totalItems = pageItems.length;
  
  if (totalItems === 0) return buttons;
  
  // Calculate number of rows needed (max 5 rows, 2 items per row)
  const maxRows = 5;
  const rowsNeeded = Math.min(maxRows, Math.ceil(totalItems / 2));
  
  // Create rows with 2 items each
  for (let row = 0; row < rowsNeeded; row++) {
    const buttonRow = [];
    
    // First column in this row
    const firstIndex = row * 2;
    if (firstIndex < totalItems) {
      const globalIndex = start + firstIndex;
      const char = pageItems[firstIndex];
      const levelKey = normalizeLevel(char.level);
      const levelColor = getLevelColor(levelKey);
      
      const displayNumber = firstIndex + 1;
      const truncatedName = truncateName(char.name, 8);
      const buttonText = `${displayNumber}.${levelColor}${truncatedName}`;
      
      buttonRow.push({
        text: buttonText,
        callback_data: `shadow_detail_${userId}_${globalIndex}`
      });
    }
    
    // Second column in this row (if exists)
    const secondIndex = row * 2 + 1;
    if (secondIndex < totalItems) {
      const globalIndex = start + secondIndex;
      const char = pageItems[secondIndex];
      const levelKey = normalizeLevel(char.level);
      const levelColor = getLevelColor(levelKey);
      
      const displayNumber = secondIndex + 1;
      const truncatedName = truncateName(char.name, 8);
      const buttonText = `${displayNumber}.${levelColor}${truncatedName}`;
      
      buttonRow.push({
        text: buttonText,
        callback_data: `shadow_detail_${userId}_${globalIndex}`
      });
    }
    
    // If only one item in this row and we have empty slots, add empty button
    if (buttonRow.length === 1 && totalItems < (row + 1) * 2) {
      buttonRow.push({ text: '─', callback_data: 'no_action' });
    }
    
    if (buttonRow.length > 0) {
      buttons.push(buttonRow);
    }
  }
  
  // Fill remaining rows with empty slots if we have less than 5 rows
  const currentRows = buttons.length;
  for (let row = currentRows; row < maxRows; row++) {
    buttons.push([
      { text: '─', callback_data: 'no_action' },
      { text: '─', callback_data: 'no_action' }
    ]);
  }
  
  return buttons;
}

export function shadowCommand(bot) {
  // Main /shadow command
  bot.command("shadow", async (ctx) => {
    try {
      const userId = ctx.from.id;
      const userName = ctx.from.first_name || "Commander";
      const user = await User.findOne({ telegramId: userId });

      if (!user || !Array.isArray(user.shadows) || user.shadows.length === 0) {
        return ctx.reply(
          `🛡️ <b>YOUR REGIMENT</b>\n━━━━━━━━━━━━━━\n\n` +
          `No soldiers recruited yet.\n\n` +
          `«Use /arise to summon your first soldier.»\n` +
          `— Mikasa`,
          { 
            parse_mode: "HTML", 
            reply_to_message_id: ctx.message?.message_id 
          }
        );
      }

      // Start gallery from page 0
      await sendGalleryPage(ctx, user, userName, 0);

    } catch (err) {
      console.error("SHADOW ERROR:", err);
      await ctx.reply(
        `⚠️ <b>System Error</b>\n\n` +
        `«Failed to access regiment database.»\n` +
        `— Mikasa`,
        { 
          parse_mode: "HTML", 
          reply_to_message_id: ctx.message?.message_id 
        }
      );
    }
  });
  // ─── CALLBACK HANDLERS ────────────────────
  
  // Gallery pagination
  bot.action(/^shadow_gallery_(\d+)_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const page = parseInt(ctx.match[1]);
      const ownerId = parseInt(ctx.match[2]);
      const callerId = ctx.from.id;
      
      // Security check: Only owner can navigate their own gallery
      if (callerId !== ownerId) {
        return ctx.answerCbQuery("❌ This is not your gallery!");
      }
      
      const userName = ctx.from.first_name || "Commander";
      const user = await User.findOne({ telegramId: callerId });
      if (!user) return;
      
      await sendGalleryPage(ctx, user, userName, page);
    } catch (err) {
      console.error("Gallery page error:", err);
      try {
        await ctx.answerCbQuery("Error loading gallery");
      } catch (e) {
        // Ignore old callback query errors
      }
    }
  });

  // View character detail - SECURED WITH USER ID
  bot.action(/^shadow_detail_(\d+)_(\d+)$/, async (ctx) => {
    try {
      // Answer callback query first
      try {
        await ctx.answerCbQuery();
      } catch (e) {
        // Ignore if callback query is too old
      }
      
      const ownerId = parseInt(ctx.match[1]);
      const charIndex = parseInt(ctx.match[2]);
      const callerId = ctx.from.id;
      
      // Security check: Only owner can view their own characters
      if (callerId !== ownerId) {
        return ctx.answerCbQuery("❌ These soldiers belong to another commander!");
      }
      
      const userName = ctx.from.first_name || "Commander";
      const user = await User.findOne({ telegramId: callerId });
      if (!user || !user.shadows[charIndex]) {
        // Send a new message if user not found
        return ctx.reply(
          `⚠️ <b>Character Not Found</b>\n\n` +
          `«This soldier is no longer in your regiment.»\n` +
          `— Mikasa`,
          { 
            parse_mode: "HTML",
            reply_to_message_id: ctx.callbackQuery?.message?.message_id 
          }
        );
      }
      
      await sendCharacterDetail(ctx, user, userName, charIndex);
    } catch (err) {
      console.error("Character detail error:", err);
      // Don't try to answer callback query if it's already answered or too old
    }
  });

  // Back to gallery from detail view - SECURED WITH USER ID
  bot.action(/^shadow_back_gallery_(\d+)_(\d+)$/, async (ctx) => {
    try {
      try {
        await ctx.answerCbQuery();
      } catch (e) {
        // Ignore if callback query is too old
      }
      
      const page = parseInt(ctx.match[1]);
      const ownerId = parseInt(ctx.match[2]);
      const callerId = ctx.from.id;
      
      // Security check: Only owner can navigate back to their gallery
      if (callerId !== ownerId) {
        return ctx.answerCbQuery("❌ This is not your gallery!");
      }
      
      const userName = ctx.from.first_name || "Commander";
      const user = await User.findOne({ telegramId: callerId });
      if (!user) return;
      
      await sendGalleryPage(ctx, user, userName, page);
    } catch (err) {
      console.error("Back to gallery error:", err);
    }
  });

  // Dummy action handler
  bot.action('no_action', async (ctx) => {
    try {
      await ctx.answerCbQuery();
    } catch (e) {
      // Ignore old callback query errors
    }
  });
}

// ─── GALLERY VIEW ──────────────────────────
async function sendGalleryPage(ctx, user, userName, page = 0) {
  const userId = user.telegramId;
  const totalPages = Math.ceil(user.shadows.length / MAX_ITEMS_PER_PAGE);
  page = Math.max(0, Math.min(page, totalPages - 1));
  
  const start = page * MAX_ITEMS_PER_PAGE;
  const end = Math.min(start + MAX_ITEMS_PER_PAGE, user.shadows.length);
  const pageItems = user.shadows.slice(start, end);

  // Build caption
  const caption =
    `🖼️ <b>SOLDIER GALLERY</b>\n━━━━━━━━━━━━━━\n\n` +
    `<b>Regiment size:</b> ${user.shadows.length}\n` +
    `<b>Total Power:</b> ${user.totalPower} ⚡\n` +
    `<b>Total Stars:</b> ${user.totalStars} ⭐\n\n` +
    `📄 Page ${page + 1}/${totalPages}\n\n` +
    `«Tap on a soldier to view details.»\n` +
    `— Mikasa`;

  // Create 2-column grid buttons with user ID for security
  const buttons = create2ColumnGrid(pageItems, start, userId);
  
  // Add navigation buttons only if we have multiple pages
  if (totalPages > 1) {
    const navRow = [];
    
    if (page > 0) {
      navRow.push({ 
        text: '◀ Prev', 
        callback_data: `shadow_gallery_${page - 1}_${userId}` 
      });
    } else {
      navRow.push({ text: '⏹️', callback_data: 'no_action' });
    }
    
    navRow.push({ 
      text: `${page + 1}/${totalPages}`, 
      callback_data: 'no_action' 
    });
    
    if (page < totalPages - 1) {
      navRow.push({ 
        text: 'Next ▶', 
        callback_data: `shadow_gallery_${page + 1}_${userId}` 
      });
    } else {
      navRow.push({ text: '⏹️', callback_data: 'no_action' });
    }
    
    buttons.push(navRow);
  }

  const messageOptions = {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  };

  try {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(caption, messageOptions);
    } else {
      await ctx.reply(caption, {
        ...messageOptions,
        reply_to_message_id: ctx.message?.message_id
      });
    }
  } catch (error) {
    console.error("Edit message error:", error);
    // If editing fails (message too old), send new message
    if (!ctx.callbackQuery) throw error;
    
    // Send new message instead of editing
    await ctx.reply(caption, {
      ...messageOptions
    });
  }
}

// ─── SEND CHARACTER DETAIL ─────────────────
async function sendCharacterDetail(ctx, user, userName, charIndex) {
  const character = user.shadows[charIndex];
  
  if (!character) {
    // Send error message and return
    return ctx.reply(
      `⚠️ <b>Character Not Found</b>\n\n` +
      `«This soldier is no longer available.»\n` +
      `— Mikasa`,
      { 
        parse_mode: "HTML",
        reply_to_message_id: ctx.callbackQuery?.message?.message_id 
      }
    );
  }

  const levelKey = normalizeLevel(character.level);
  const levelInfo = getLevelInfo(levelKey);
  
  // Count total owned of this character
  const totalOwned = user.shadows.filter(s => 
    s.name === character.name && normalizeLevel(s.level) === levelKey
  ).length;

  // Count all versions (different levels) of this character
  const allVersions = user.shadows.filter(s => s.name === character.name);
  
  // Stars display
  const stars = "★".repeat(levelInfo.stars) + "☆".repeat(5 - levelInfo.stars);
  
  // Create user mention
  const userMention = `<a href="tg://user?id=${ctx.from.id}">${userName}</a>`;
  
  const caption =
    `🧣 <b>${userMention}'s Soldier Details</b>\n━━━━━━━━━━━━━━\n\n` +
    `${levelInfo.emoji} <b>${character.name}</b>\n\n` +
    `📋 <b>Military File</b>\n` +
    `├─ Rank: <b>${levelInfo.label}</b>\n` +
    `├─ Stars: ${stars}\n` +
    `├─ Power: ${character.power} ⚡\n` +
    `├─ Collection: ${totalOwned}x\n` +
    `└─ All Versions: ${allVersions.length}x\n\n` +
    `🏆 <b>Collection Status</b>\n` +
    `└─ Soldier #${charIndex + 1} in ${userName}'s regiment\n\n` +
    `━━━━━━━━━━━━━━\n` +
    `«This soldier stands with ${userName}.»\n— Mikasa`;

  try {
    // Try to send with image if available
    if (character.imagePath && fs.existsSync(character.imagePath)) {
      await ctx.replyWithPhoto(
        { source: fs.createReadStream(character.imagePath) },
        {
          caption,
          parse_mode: "HTML",
          reply_to_message_id: ctx.callbackQuery?.message?.message_id
        }
      );
    } else {
      // Fallback to text only - ALWAYS REPLY TO USER'S MESSAGE
      await ctx.reply(caption, {
        parse_mode: "HTML",
        reply_to_message_id: ctx.callbackQuery?.message?.message_id || ctx.message?.message_id
      });
    }
  } catch (error) {
    console.error("Photo error:", error);
    // If photo fails, send text only - ALWAYS REPLY TO USER'S MESSAGE
    await ctx.reply(caption, {
      parse_mode: "HTML",
      reply_to_message_id: ctx.callbackQuery?.message?.message_id || ctx.message?.message_id
    });
  }
}