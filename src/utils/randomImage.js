import fs from "fs";
import path from "path";

export function getRandomImage(folder) {
  const dir = path.join(process.cwd(), "assets", folder);

  if (!fs.existsSync(dir)) return null;

  const images = fs
    .readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith(".jpg"));

  if (!images.length) return null;

  return path.join(dir, images[Math.floor(Math.random() * images.length)]);
}