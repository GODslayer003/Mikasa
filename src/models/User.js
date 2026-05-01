// src/models/User.js
import mongoose from "mongoose";

/**
 * ─── SHADOW / CHARACTER SCHEMA ─────────────────────────
 * Stored exactly as received from /arise
 */
const shadowSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    level: { type: String, required: true }, // LOW | MID | TOP | LEGEND | ULTRA
    power: { type: Number, default: 0 },
    stars: { type: Number, default: 0 },
    imagePath: { type: String, default: null }
  },
  { _id: false }
);

/**
 * ─── USER SCHEMA ───────────────────────────────────────
 */
const userSchema = new mongoose.Schema(
  {
    // ─── IDENTITY ─────────────────────────────────────
    telegramId: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },

    username: { type: String, default: null },
    firstName: { type: String, default: null },

    // ─── CORE PROGRESSION ─────────────────────────────
    level: { type: Number, default: 1 },       // Player level
    xp: { type: Number, default: 0 },          // Experience points
    hp: { type: Number, default: 100 },

    // ─── TATAKAE BATTLE SYSTEM ───────────────────────
    isScarfed: { type: Boolean, default: false }, // Wearing Mikasa's scarf
    lastTatakaeAt: { type: Number, default: 0 }, // Last /tatakae command use
    tatakaeCooldown: { type: Number, default: 0 }, // Cooldown from block
    scarfUsedAt: { type: Number, default: 0 }, // Last /scarf command use
    defeatedAt: { type: Number, default: 0 }, // When HP reached 0
    healthRestoreDueAt: { type: Number, default: 0, index: true },
    healthRestoredAt: { type: Number, default: 0 },
    defeatedChatId: { type: Number, default: null },
    defeatedChatTitle: { type: String, default: null },
    mikasaProtectionUntil: { type: Number, default: 0 }, // Protection from Mikasa image

    // ─── ECONOMY ─────────────────────────────────────
    balance: { type: Number, default: 1000 },  // 🌙 Moons Coins (legacy - use moons)
    moons: { type: Number, default: 1000 },    // 🌙 Moons Coins (main currency)
    lastLootAt: { type: Number, default: 0 },
    immuneUntil: { type: Number, default: 0 },
    immuneCooldownUntil: { type: Number, default: 0 },
    stars: { type: Number, default: 0 },       // Optional legacy/global stars

    // ─── SHADOW SYSTEM (CRITICAL) ─────────────────────
    shadows: { type: [shadowSchema], default: [] },
    totalStars: { type: Number, default: 0 },
    totalPower: { type: Number, default: 0 },
    lastAriseAt: { type: Number, default: 0 },

    // ─── TRAINING SYSTEM ──────────────────────────────
    trainingWins: { type: Number, default: 0 },
    trainingLosses: { type: Number, default: 0 },
    lastTrainAt: { type: Number, default: 0 },

    // ─── COMBAT (FUTURE PVP) ──────────────────────────
    successfulAttacks: { type: Number, default: 0 },
    totalAttacks: { type: Number, default: 0 },
    totalBlocks: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0, index: true },

    // ─── DEFENSE ──────────────────────────────────────
    blockStatus: {
      type: String,
      enum: ["Immune", "UnImmune"],
      default: "UnImmune"
    },

    // ─── WISH SYSTEM (KEPT, NOT SHOWN IN PROFILE) ─────
    wishCount: { type: Number, default: 0 },
    wishSuccess: { type: Number, default: 0 },
    lastWishAt: { type: Number, default: 0 },

    // ─── ACTIVITY TRACKING ────────────────────────────
    firstSeenAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000)
    },
    lastSeenAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000)
    },

    // ─── EXPEDITION SYSTEM ──────────────────────────────
    expeditionKills: { type: Number, default: 0 },  // titan kills (leaderboard)
    expeditionScore: { type: Number, default: 0 },  // total score
    expeditionWins: { type: Number, default: 0 },
    expeditionLosses: { type: Number, default: 0 },
    expeditionStreak: { type: Number, default: 0 },  // consecutive wins
    lastExpeditionAt: { type: Number, default: 0 },  // cooldown anchor

    // ─── SAFETY ───────────────────────────────────────
    isBanned: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

/**
 * Helper method to get user's display name
 */
userSchema.methods.getDisplayName = function () {
  return this.firstName || "Soldier";
};

/**
 * Helper method to check if user can use tatakae
 */
userSchema.methods.canUseTatakae = function () {
  const now = Math.floor(Date.now() / 1000);

  // Check if defeated
  const restoreDueAt = this.healthRestoreDueAt || (this.defeatedAt ? this.defeatedAt + 10 * 60 * 60 : 0);
  if (this.defeatedAt && now < restoreDueAt) {
    return false;
  }

  // Check if scarfed
  if (this.isScarfed) {
    return false;
  }

  // Check if in cooldown
  if (this.lastTatakaeAt && this.tatakaeCooldown &&
    (now - this.lastTatakaeAt < this.tatakaeCooldown)) {
    return false;
  }

  // Check if immune
  if (this.immuneUntil && now < this.immuneUntil) {
    return false;
  }

  return true;
};

/**
 * Helper method to check if user can be attacked
 */
userSchema.methods.canBeAttacked = function () {
  const now = Math.floor(Date.now() / 1000);

  // Check if defeated
  const restoreDueAt = this.healthRestoreDueAt || (this.defeatedAt ? this.defeatedAt + 10 * 60 * 60 : 0);
  if (this.defeatedAt && now < restoreDueAt) {
    return false;
  }

  // Check if scarfed
  if (this.isScarfed) {
    return false;
  }

  // Check if under Mikasa's protection
  if (this.mikasaProtectionUntil && now < this.mikasaProtectionUntil) {
    return false;
  }

  // Check if immune
  if (this.immuneUntil && now < this.immuneUntil) {
    return false;
  }

  return true;
};

/**
 * Helper method to get time left for scarf cooldown
 */
userSchema.methods.getScarfCooldown = function () {
  const now = Math.floor(Date.now() / 1000);
  if (!this.scarfUsedAt) return 0;

  const cooldown = 10 * 60; // 10 minutes
  const elapsed = now - this.scarfUsedAt;
  return Math.max(0, cooldown - elapsed);
};

/**
 * Helper method to get time left for defeat cooldown
 */
userSchema.methods.getDefeatCooldown = function () {
  const now = Math.floor(Date.now() / 1000);
  if (!this.defeatedAt) return 0;

  const restoreDueAt = this.healthRestoreDueAt || (this.defeatedAt + 10 * 60 * 60);
  return Math.max(0, restoreDueAt - now);
};

/**
 * Helper method to get current HP percentage
 */
userSchema.methods.getHPPercentage = function () {
  const maxHP = 100;
  return Math.round((this.hp / maxHP) * 100);
};

/**
 * Helper method to get total coins (moons + balance for backward compatibility)
 */
userSchema.methods.getTotalCoins = function () {
  if (typeof this.moons === "number") return this.moons;
  return this.balance || 0;
};

export const User = mongoose.model("User", userSchema);
