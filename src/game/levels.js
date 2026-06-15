// src/game/levels.js
export const LEVELS = {
  LOW: {
    label: "Low Level",
    folder: "Low Level",
    power: 30,
    stars: 1,
    emoji: "⚪"
  },
  MID: {
    label: "Mid Level",
    folder: "Mid Level",
    power: 50,
    stars: 2,
    emoji: "🟢"
  },
  TOP: {
    label: "Top Level",
    folder: "Top Level",
    power: 70,
    stars: 3,
    emoji: "🔵"
  },
  LEGEND: {
    label: "Legend Level",
    folder: "Legend Level",
    power: 90,
    stars: 4,
    emoji: "🟣"
  },
  ULTRA: {
    label: "Ultra Level",
    folder: "Ultra Level",
    power: 120,
    stars: 5,
    emoji: "🔴"
  },
  MOONS: {
    label: "Moons Limited",
    folder: "MOONS",
    power: 200,
    stars: 6,
    emoji: "💎"
  }
};

const NORMAL_KEYS = ["LOW", "MID", "TOP", "LEGEND"];

const NORMAL_CHANCES = {
  LOW: 40,
  MID: 30,
  TOP: 15,
  LEGEND: 15
};

export function rollRarity(pityCount) {
  if (pityCount >= 60) return "MOONS";

  const hardPity = pityCount >= 40;

  if (hardPity) {
    if (Math.random() * 100 < 5) return "MOONS";
    if (Math.random() * 100 < 10) return "ULTRA";
  } else {
    if (Math.random() * 100 < 1) return "MOONS";
    if (Math.random() * 100 < 5) return "ULTRA";
  }

  if (pityCount > 0 && pityCount % 10 === 0) {
    const roll = Math.random() * 100;
    if (roll < 2) return "MOONS";
    if (roll < 5) return "ULTRA";
    return "LEGEND";
  }

  const roll = Math.random() * 100;
  let sum = 0;
  for (const key of NORMAL_KEYS) {
    sum += NORMAL_CHANCES[key];
    if (roll <= sum) return key;
  }
  return "LOW";
}