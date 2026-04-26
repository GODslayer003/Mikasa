import { GroupMember } from "../models/GroupMember.js";
import { DailyDuo } from "../models/DailyDuo.js";
import { DateTime } from "luxon";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const Jimp = require("jimp");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get IST date string
function getISTDate() {
  return DateTime.now().setZone("Asia/Kolkata").toFormat("yyyy-MM-dd");
}

// Helper to get random members
async function pickRandomDuo(groupId) {
  const members = await GroupMember.find({ groupId }).limit(100); // Get up to 100 recent members
  if (members.length < 2) return null;

  const shuffled = members.sort(() => 0.5 - Math.random());
  return [shuffled[0], shuffled[1]];
}

// Helper to merge profile pictures
async function createDuoImage(bot, user1Id, user2Id) {
  const tempDir = path.join(__dirname, "..", "..", "scratch");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const outPath = path.join(tempDir, `duo_${user1Id}_${user2Id}.png`);

  try {
    // Get photos
    const getPhoto = async (userId) => {
      try {
        const photos = await bot.telegram.getUserProfilePhotos(userId, 0, 1);
        if (photos && photos.total_count > 0) {
          const fileId = photos.photos[0][photos.photos[0].length - 1].file_id;
          const link = await bot.telegram.getFileLink(fileId);
          return await Jimp.read(link.href);
        }
      } catch (e) {
        console.error("Error fetching photo for", userId, e);
      }
      // Fallback: simple gray square
      return new Jimp(400, 400, 0xccccccff);
    };

    const [img1, img2] = await Promise.all([getPhoto(user1Id), getPhoto(user2Id)]);

    img1.cover(400, 400);
    img2.cover(400, 400);

    const canvas = new Jimp(800, 400, 0x000000ff);
    canvas.composite(img1, 0, 0);
    canvas.composite(img2, 400, 0);

    // Optional: Add a simple heart in the middle (just a red square for now or skip)
    
    await canvas.writeAsync(outPath);
    return outPath;
  } catch (err) {
    console.error("Image processing error:", err);
    return null;
  }
}

export function loveCommand(bot) {
  // ─── /love ──────────────────────────────────
  bot.command("love", async (ctx) => {
    if (ctx.chat.type === "private") {
      return ctx.reply("🧣 «This command is for squads only.»\n— Mikasa");
    }

    try {
      const today = getISTDate();
      const groupId = ctx.chat.id;

      // Check if duo already exists for today
      let duo = await DailyDuo.findOne({ groupId, date: today });

      if (!duo) {
        const picked = await pickRandomDuo(groupId);
        if (!picked) {
          return ctx.reply("🧣 «Not enough scouts in this regiment to form a duo.»\n— Mikasa");
        }

        duo = await DailyDuo.create({
          groupId,
          date: today,
          user1: {
            userId: picked[0].userId,
            firstName: picked[0].firstName,
            username: picked[0].username
          },
          user2: {
            userId: picked[1].userId,
            firstName: picked[1].firstName,
            username: picked[1].username
          }
        });
      }

      const u1 = duo.user1;
      const u2 = duo.user2;

      // Mentions
      const m1 = `<a href="tg://user?id=${u1.userId}">${u1.firstName}</a>`;
      const m2 = `<a href="tg://user?id=${u2.userId}">${u2.firstName}</a>`;

      // Generate Image
      await ctx.sendChatAction("upload_photo");
      const imgPath = await createDuoImage(bot, u1.userId, u2.userId);

      const caption = 
        `🧣 <b>TODAY'S DUO WARRIORS</b>\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `⚔️ <b>${m1}</b> × <b>${m2}</b>\n\n` +
        `«Together, they are a force the Titans should fear.»\n` +
        `— Mikasa`;

      if (imgPath) {
        await ctx.replyWithPhoto({ source: imgPath }, {
          caption,
          parse_mode: "HTML"
        });
        // Clean up temp file
        setTimeout(() => fs.unlink(imgPath, () => {}), 5000);
      } else {
        await ctx.reply(caption, { parse_mode: "HTML" });
      }

    } catch (err) {
      console.error("Love command error:", err);
      ctx.reply("🧣 «The battlefield is too chaotic. Try again later.»\n— Mikasa");
    }
  });

  // ─── /lovers ────────────────────────────────
  bot.command("lovers", async (ctx) => {
    if (ctx.chat.type === "private") return;

    try {
      const history = await DailyDuo.find({ groupId: ctx.chat.id })
        .sort({ date: -1 })
        .limit(5);

      if (!history.length) {
        return ctx.reply("🧣 «No history of duos in this regiment yet.»\n— Mikasa");
      }

      let text = `🧣 <b>RECENT DUO RECORDS</b>\n━━━━━━━━━━━━━━\n\n`;
      history.forEach((h, i) => {
        text += `📅 <b>${h.date}</b>\n`;
        text += `└─ ${h.user1.firstName} × ${h.user2.firstName}\n\n`;
      });
      text += `«Records of our bonds.»\n— Mikasa`;

      ctx.reply(text, { parse_mode: "HTML" });
    } catch (err) {
      console.error("Lovers command error:", err);
    }
  });

  // ─── /toplove ───────────────────────────────
  bot.command("toplove", async (ctx) => {
    if (ctx.chat.type === "private") return;

    try {
      const duos = await DailyDuo.find({ groupId: ctx.chat.id });
      const counts = {};

      duos.forEach(d => {
        counts[d.user1.userId] = (counts[d.user1.userId] || { name: d.user1.firstName, count: 0 });
        counts[d.user1.userId].count++;
        
        counts[d.user2.userId] = (counts[d.user2.userId] || { name: d.user2.firstName, count: 0 });
        counts[d.user2.userId].count++;
      });

      const sorted = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10);

      if (!sorted.length) {
        return ctx.reply("🧣 «No one has been chosen for a duo yet.»\n— Mikasa");
      }

      let text = `🧣 <b>TOP DUO WARRIORS</b>\n━━━━━━━━━━━━━━\n\n`;
      sorted.forEach((u, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "⚔️";
        text += `${medal} <b>${u.name}</b> — ${u.count} times\n`;
      });
      text += `\n«The most reliable hearts in the squad.»\n— Mikasa`;

      ctx.reply(text, { parse_mode: "HTML" });
    } catch (err) {
      console.error("Toplove command error:", err);
    }
  });
}
