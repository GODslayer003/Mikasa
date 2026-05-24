import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LLOYD_ASSETS_DIR = path.join(__dirname, "../..", "assets", "Lloyd");

// Cache Lloyd images and file IDs
let lloydImages = [];
const fileIdCache = new Map(); // Map<imagePath, telegramFileId>

/**
 * Initialize Lloyd assets on bot startup
 */
export function initLloydAssets() {
  try {
    if (!fs.existsSync(LLOYD_ASSETS_DIR)) {
      console.warn(`⚠️ Lloyd assets folder not found: ${LLOYD_ASSETS_DIR}`);
      return;
    }

    const files = fs.readdirSync(LLOYD_ASSETS_DIR);
    lloydImages = files.filter((file) => /\.(png|jpg|jpeg|gif)$/i.test(file));

    if (lloydImages.length === 0) {
      console.warn("⚠️ No Lloyd images found in assets/Lloyd/");
    } else {
      console.log(`✅ Loaded ${lloydImages.length} Lloyd images`);
    }
  } catch (err) {
    console.error("❌ Error loading Lloyd assets:", err.message);
  }
}

/**
 * Get a random Lloyd image path
 */
export function getRandomLloydImage() {
  if (lloydImages.length === 0) return null;
  const filename = lloydImages[Math.floor(Math.random() * lloydImages.length)];
  return path.join(LLOYD_ASSETS_DIR, filename);
}

/**
 * Get or set cached file_id for an image to avoid re-uploads
 */
export function getCachedFileId(imagePath) {
  return fileIdCache.get(imagePath);
}

export function setCachedFileId(imagePath, fileId) {
  fileIdCache.set(imagePath, fileId);
}

/**
 * Get a random Lloyd quote
 */
export function getLloydQuote() {
  const quotes = [
    "If it makes money, it's infrastructure. Fight me.",
    "Debt is just deferred profit. I read that somewhere.",
    "Javier, stop looking noble. People keep talking to you.",
    "Every betrayal is a cash flow problem in disguise.",
    "I didn't come back from death to lose a card game.",
    "The hamster has better business instincts than all of you.",
    "Trust is a liability. I've done the math.",
    "A good contractor always has a backup plan. This is plan F.",
    "Frontera County didn't build itself. Well, technically it did. I managed the project.",
    "Winning isn't everything. But the prize money is.",
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

/**
 * Build HP bar helper
 */
export function buildHpBar(hp) {
  const filled = Math.round(hp / 10);
  return "🟩".repeat(filled) + "⬜".repeat(10 - filled);
}
