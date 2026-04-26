import fs from "fs";
import path from "path";

export function getRandomFile(relativeDir) {
  const dir = path.join(process.cwd(), "assets", relativeDir);
  const files = fs.readdirSync(dir).filter(f =>
    f.endsWith(".jpg") || f.endsWith(".png") || f.endsWith(".gif")
  );

  if (!files.length) return null;
  return path.join(dir, files[Math.floor(Math.random() * files.length)]);
}