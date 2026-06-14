import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DOJKA_ASSETS_DIR = path.join(__dirname, "../..", "assets", "Dojka");

let dojkaImages = [];
const fileIdCache = new Map();

export function initDojkaAssets() {
  try {
    if (!fs.existsSync(DOJKA_ASSETS_DIR)) {
      console.warn(`Kim Dojka assets folder not found: ${DOJKA_ASSETS_DIR}`);
      return;
    }

    const files = fs.readdirSync(DOJKA_ASSETS_DIR);
    dojkaImages = files.filter((file) => /\.(png|jpg|jpeg|gif)$/i.test(file));

    if (dojkaImages.length === 0) {
      console.warn("No Kim Dojka images found in assets/Dojka/");
    } else {
      console.log(`Loaded ${dojkaImages.length} Kim Dojka images`);
    }
  } catch (err) {
    console.error("Error loading Kim Dojka assets:", err.message);
  }
}

export function getRandomDojkaImage() {
  if (dojkaImages.length === 0) return null;
  const filename = dojkaImages[Math.floor(Math.random() * dojkaImages.length)];
  return path.join(DOJKA_ASSETS_DIR, filename);
}

export function getCachedFileId(imagePath) {
  return fileIdCache.get(imagePath);
}

export function setCachedFileId(imagePath, fileId) {
  fileIdCache.set(imagePath, fileId);
}

export function getDojkaQuote() {
  const quotes = [
    "This story is for just one reader.",
    "I am the Oldest Dream.",
    "The probability is 0.001%.",
    "In that world, I was the reader.",
    "A reader's duty is to accompany the protagonist until the end.",
    "There are three ways to survive in a broken world.",
    "The constellations are watching.",
    "I'll kill you. I'll definitely kill you.",
    "You're not the protagonist of this story.",
    "The Star Stream never forgives, but it always pays.",
    "Kim Com doesn't run from scenarios. We rewrite them.",
    "Yoo Joonghyuk, stop looking so tragic. It ruins the mood.",
    "A constellation's worth is measured by their probability.",
    "Demon King of Salvation — that's my official title now.",
    "The abandoned reader becomes the darkest story.",
    "You think this is a game? This is salvation.",
    "I read this story already. I know every ending.",
    "The Dokkaebi are betting on you. Don't disappoint.",
    "A single reader can change the entire story.",
    "The Fourth Wall is thicker than your plot armor.",
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

export function buildHpBar(hp) {
  const filled = Math.round(hp / 10);
  return "▰".repeat(filled) + "▱".repeat(10 - filled);
}
