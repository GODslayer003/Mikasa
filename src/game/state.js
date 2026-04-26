// ---- COOLDOWNS (seconds) ----
export const WISH_COOLDOWN = 60; // 1 hour
export const BLOCK_COOLDOWN = 10 * 60; // 10 minutes
export const ATTACK_COOLDOWN = 3 * 60; // 3 minutes
export const PLAYER_DOWN_COOLDOWN = 24 * 60 * 60; // 24 hours

// ---- IN-MEMORY GAME STATE ----
export const blockedUsers = new Set();
export const blockCooldowns = new Map();
export const playerDownCooldowns = new Map();
export const attackCooldowns = new Map();