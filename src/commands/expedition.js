// src/commands/expedition.js
// ─── Survey Corps Expedition — Interactive Titan Hunt ───────────────────────
import { User } from "../models/User.js";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const EXPEDITION_COOLDOWN = 2 * 60 * 60; // 2 hours
const SESSION_TIMEOUT = 10 * 60;      // 10 min — auto-expire idle sessions
const ODM_CHARGES = 2;            // charges per battle

// ─── TITAN TIERS ────────────────────────────────────────────────────────────
const TITANS = [
    {
        tier: "wanderer",
        label: "⚪ Wanderer Titan",
        emoji: "⚪",
        hp: 40,
        attack: [8, 16],
        reward: { moons: 120, xp: 20, score: 80 },
        weight: 40,
        description: "A mindless, shambling titan. Easy prey for a seasoned soldier.",
        quote: "«A stray titan. Finish it quickly.» — Mikasa"
    },
    {
        tier: "shifter",
        label: "🟢 Beast Scout Titan",
        emoji: "🟢",
        hp: 80,
        attack: [14, 22],
        reward: { moons: 280, xp: 45, score: 200 },
        weight: 30,
        description: "A titan with coordinated movement — potentially a shifter.",
        quote: "«Stay focused. This one thinks.» — Levi"
    },
    {
        tier: "armored",
        label: "🔵 Armored Titan",
        emoji: "🔵",
        hp: 130,
        attack: [20, 32],
        reward: { moons: 520, xp: 80, score: 420 },
        weight: 18,
        description: "Hardened plates cover its body. Your blades must find the gaps.",
        quote: "«Aim for the joints. Nowhere else.» — Hange"
    },
    {
        tier: "colossal",
        label: "🟣 Colossal Titan",
        emoji: "🟣",
        hp: 200,
        attack: [28, 42],
        reward: { moons: 950, xp: 120, score: 800 },
        weight: 10,
        description: "60 meters of destruction. Steam scalds you from 50 feet away.",
        quote: "«Do not hesitate. This is why we dedicate our hearts.» — Erwin"
    },
    {
        tier: "founding",
        label: "🔴 Founding Titan",
        emoji: "🔴",
        hp: 300,
        attack: [36, 55],
        reward: { moons: 1600, xp: 210, score: 1500 },
        weight: 2,
        description: "A primordial horror. Even veterans tremble at its presence.",
        quote: "«The world bows to the Founding Titan. Will you?» — Historia"
    }
];

// ─── IN-MEMORY BATTLE SESSIONS ──────────────────────────────────────────────
// key = userId, value = session object
const sessions = new Map();

// ─── HELPERS ────────────────────────────────────────────────────────────────
function pickTitan() {
    const roll = Math.random() * 100;
    let cumulative = 0;
    for (const titan of TITANS) {
        cumulative += titan.weight;
        if (roll < cumulative) return titan;
    }
    return TITANS[0];
}

function randBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function hpBar(current, max, length = 12) {
    const filled = Math.max(0, Math.round((current / max) * length));
    const empty = length - filled;
    return "█".repeat(filled) + "░".repeat(empty);
}

function formatTime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function medal(rank) {
    return ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][rank] ?? `${rank + 1}.`;
}

function streakLabel(streak) {
    if (streak >= 10) return `🌟 ×${streak}`;
    if (streak >= 5) return `🔥 ×${streak}`;
    if (streak >= 3) return `🔥 ×${streak}`;
    return "";
}

function getRankTitle(kills) {
    if (kills >= 50) return "👑 Titan Slayer Legend";
    if (kills >= 25) return "⭐ Elite Corps Member";
    if (kills >= 10) return "⚔️ Veteran Scout";
    if (kills >= 3) return "🛡️ Certified Soldier";
    return "🌱 Recruit";
}

function streakBonus(streak) {
    if (streak >= 10) return 0.40;
    if (streak >= 5) return 0.20;
    if (streak >= 3) return 0.10;
    return 0;
}

async function getSafeUser(telegramId, firstName) {
    let user = await User.findOne({ telegramId });
    if (!user) {
        user = await User.create({
            telegramId,
            firstName,
            balance: 1000,
            moons: 1000,
            xp: 0,
            expeditionKills: 0,
            expeditionScore: 0,
            expeditionWins: 0,
            expeditionLosses: 0,
            expeditionStreak: 0,
            lastExpeditionAt: 0
        });
    }
    // Ensure expedition fields exist on older records
    if (user.expeditionKills === undefined) user.expeditionKills = 0;
    if (user.expeditionScore === undefined) user.expeditionScore = 0;
    if (user.expeditionWins === undefined) user.expeditionWins = 0;
    if (user.expeditionLosses === undefined) user.expeditionLosses = 0;
    if (user.expeditionStreak === undefined) user.expeditionStreak = 0;
    if (user.lastExpeditionAt === undefined) user.lastExpeditionAt = 0;
    return user;
}

async function buildLeaderboard(requesterId) {
    const top = await User.find({ expeditionKills: { $gt: 0 } })
        .sort({ expeditionKills: -1, expeditionScore: -1 })
        .limit(5)
        .lean();

    if (!top.length) return `\n🏆 <b>EXPEDITION LEADERBOARD</b> — No kills yet. Be the first!\n`;

    let board = `\n🏆 <b>EXPEDITION LEADERBOARD — TOP 5</b>\n`;
    board += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    top.forEach((u, i) => {
        const name = u.firstName || "Unknown";
        const streak = streakLabel(u.expeditionStreak || 0);
        const mention = `<a href="tg://user?id=${u.telegramId}">${name}</a>`;
        board += `${medal(i)} ${mention}  ·  <b>${u.expeditionKills} kills</b>  ·  ${(u.expeditionScore || 0).toLocaleString()} pts${streak ? `  ${streak}` : ""}\n`;
    });

    board += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    // Show requester's position if not in top 5
    if (requesterId) {
        const requester = await User.findOne({ telegramId: requesterId }).lean();
        if (requester) {
            const above = await User.countDocuments({
                $or: [
                    { expeditionKills: { $gt: requester.expeditionKills || 0 } },
                    {
                        expeditionKills: requester.expeditionKills || 0,
                        expeditionScore: { $gt: requester.expeditionScore || 0 }
                    }
                ]
            });
            const userRank = above + 1;
            const inTop5 = top.some(u => u.telegramId === requesterId);
            if (!inTop5) {
                board += `📍 <b>Your rank: #${userRank}</b>  ·  ${requester.expeditionKills || 0} kills  ·  ${(requester.expeditionScore || 0).toLocaleString()} pts\n`;
            }
        }
    }

    return board;
}

// ─── BUILD BATTLE MESSAGE ───────────────────────────────────────────────────
function buildBattleMessage({ session, userName, mention, log = null }) {
    const { titan, titanHp, playerHp, round, odmCharges } = session;

    const titanBar = hpBar(titanHp, titan.hp);
    const playerBar = hpBar(playerHp, 100);
    const odmLabel = odmCharges > 0 ? `⚡ ODM (${odmCharges})` : "⚡ ODM (0)";

    let text =
        `⚔️ <b>EXPEDITION — ROUND ${round}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `${titan.emoji} <b>${titan.label}</b>\n` +
        `❤️ ${titanBar} ${titanHp}/${titan.hp}\n\n` +
        `🛡️ <b>Scout: ${mention}</b>\n` +
        `💚 ${playerBar} ${playerHp}/100\n\n`;

    if (log) {
        text += `📜 <i>${log}</i>\n\n`;
    } else {
        text += `${titan.description}\n${titan.quote}\n\n`;
    }

    text += `💬 Choose your action:`;
    return text;
}

// ─── COMBAT BUTTONS ─────────────────────────────────────────────────────────
function battleButtons(userId, odmCharges) {
    const odmText = odmCharges > 0 ? `⚡ ODM Gear (${odmCharges})` : "⚡ ODM (Empty)";
    return {
        inline_keyboard: [
            [
                { text: "⚔️ Attack", callback_data: `exp_attack_${userId}` },
                { text: "🛡️ Dodge", callback_data: `exp_dodge_${userId}` }
            ],
            [
                { text: odmText, callback_data: `exp_odm_${userId}` },
                { text: "🏃 Retreat", callback_data: `exp_retreat_${userId}` }
            ]
        ]
    };
}

// ─── EXPORT ─────────────────────────────────────────────────────────────────
export function expeditionCommand(bot) {

    // ─── /expedition ───────────────────────────────────────────────────────────
    bot.command("expedition", async (ctx) => {
        try {
            if (!ctx.from) return;

            const userId = ctx.from.id;
            const firstName = ctx.from.first_name || "Soldier";
            const mention = `<a href="tg://user?id=${userId}">${firstName}</a>`;
            const now = Math.floor(Date.now() / 1000);

            await ctx.replyWithChatAction("typing");

            // ── Already in a session? ──────────────────────────────
            if (sessions.has(userId)) {
                const existing = sessions.get(userId);
                // Auto-expire stale sessions
                if (now - existing.startAt > SESSION_TIMEOUT) {
                    sessions.delete(userId);
                } else {
                    return ctx.reply(
                        `⚔️ <b>Battle In Progress</b>\n\n` +
                        `${mention}, you're already on an expedition!\n` +
                        `Complete or retreat from your current battle first.\n\n` +
                        `«Focus, soldier. One fight at a time.» — Mikasa`,
                        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
                    );
                }
            }

            const user = await getSafeUser(userId, firstName);

            // ── Cooldown check ─────────────────────────────────────
            if (user.lastExpeditionAt && (now - user.lastExpeditionAt < EXPEDITION_COOLDOWN)) {
                const remaining = EXPEDITION_COOLDOWN - (now - user.lastExpeditionAt);
                const leaderboard = await buildLeaderboard(userId);
                const rankTitle = getRankTitle(user.expeditionKills);

                return ctx.reply(
                    `⏳ <b>EXPEDITION COOLDOWN</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `🛡️ Commander: ${mention}\n` +
                    `🏷️ Rank: ${rankTitle}\n\n` +
                    `🗡️ Titan Kills: <b>${user.expeditionKills}</b>\n` +
                    `📊 Score: <b>${(user.expeditionScore || 0).toLocaleString()}</b>\n` +
                    `🔥 Win Streak: <b>${user.expeditionStreak}</b>\n\n` +
                    `⏰ <b>Next expedition in: ${formatTime(remaining)}</b>\n\n` +
                    `«Rest, soldier. The titans will wait.» — Mikasa\n` +
                    leaderboard,
                    { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
                );
            }

            // ── Pick titan ─────────────────────────────────────────
            const titan = pickTitan();

            // Streak bonus → base player attack is buffed
            const streak = user.expeditionStreak || 0;
            const atkBonus = streak >= 5 ? 8 : streak >= 3 ? 4 : 0;

            // Store session in memory
            const session = {
                titan,
                titanHp: titan.hp,
                playerHp: 100,
                round: 1,
                odmCharges: ODM_CHARGES,
                atkBonus,
                startAt: now,
                chatId: ctx.chat.id
            };
            sessions.set(userId, session);

            // ── Send encounter message ─────────────────────────────
            const encounterText = buildBattleMessage({ session, userName: firstName, mention });

            const sentMsg = await ctx.reply(encounterText, {
                parse_mode: "HTML",
                reply_to_message_id: ctx.message.message_id,
                reply_markup: battleButtons(userId, session.odmCharges)
            });

            // Store message ID for later edits
            session.msgId = sentMsg.message_id;
            session.chatId = sentMsg.chat.id;

        } catch (err) {
            console.error("EXPEDITION START ERROR:", err);
            await ctx.reply(
                `⚠️ <b>Expedition Failed</b>\n\n` +
                `«The walls could not hold. Try again.» — Mikasa`,
                { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
            );
        }
    });

    // ─── COMBAT ACTION PROCESSOR ───────────────────────────────────────────────
    async function processAction(ctx, userId, action) {
        try {
            await ctx.answerCbQuery();

            const session = sessions.get(userId);
            if (!session) {
                return ctx.answerCbQuery("⚠️ No active battle found. Start a new expedition!", true);
            }

            // Only the owner can interact
            if (ctx.from.id !== userId) {
                return ctx.answerCbQuery("❌ This isn't your expedition!", true);
            }

            const firstName = ctx.from.first_name || "Soldier";
            const mention = `<a href="tg://user?id=${userId}">${firstName}</a>`;

            let { titan, titanHp, playerHp, round, odmCharges, atkBonus } = session;
            let playerDmg = 0;
            let titanDmg = 0;
            let playerDodged = false;
            let log = "";

            // ── Calculate action outcome ──────────────────────────
            if (action === "attack") {
                playerDmg = randBetween(15, 35) + atkBonus;
                titanDmg = randBetween(titan.attack[0], titan.attack[1]);
                log = `⚔️ You strike for <b>${playerDmg} DMG</b>! The titan retaliates for <b>${titanDmg} DMG</b>.`;

            } else if (action === "dodge") {
                playerDmg = randBetween(8, 18) + atkBonus;
                playerDodged = Math.random() < 0.60;
                if (playerDodged) {
                    titanDmg = 0;
                    log = `🛡️ You deal <b>${playerDmg} DMG</b> and dodge the counter-attack!`;
                } else {
                    titanDmg = Math.round(randBetween(titan.attack[0], titan.attack[1]) * 0.5);
                    log = `🛡️ You deal <b>${playerDmg} DMG</b> but only partially dodge — <b>${titanDmg} DMG</b> taken.`;
                }

            } else if (action === "odm") {
                if (odmCharges <= 0) {
                    await ctx.answerCbQuery("⚡ ODM gear is empty!", true);
                    return;
                }
                odmCharges--;
                playerDmg = randBetween(30, 55) + atkBonus;
                const dodgeRoll = Math.random() < 0.40;
                titanDmg = dodgeRoll ? 0 : Math.round(randBetween(titan.attack[0], titan.attack[1]) * 0.6);
                log = dodgeRoll
                    ? `⚡ ODM BURST! You slash for <b>${playerDmg} DMG</b> and evade entirely!`
                    : `⚡ ODM BURST! <b>${playerDmg} DMG</b> dealt — but the titan grazes you for <b>${titanDmg} DMG</b>.`;

            } else if (action === "retreat") {
                // Retreat — immediate resolution
                sessions.delete(userId);

                const partialMoons = Math.floor(titan.reward.moons * 0.35);
                const partialXP = Math.floor(titan.reward.xp * 0.25);

                const user = await getSafeUser(userId, firstName);
                user.balance = (user.balance || 0) + partialMoons;
                user.moons = (user.moons || 0) + partialMoons;
                user.xp = (user.xp || 0) + partialXP;
                user.expeditionLosses = (user.expeditionLosses || 0) + 1;
                user.expeditionStreak = 0;
                user.lastExpeditionAt = Math.floor(Date.now() / 1000);
                await user.save();

                const leaderboard = await buildLeaderboard(userId);

                await ctx.editMessageText(
                    `🏃 <b>RETREAT</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `${mention} retreats from the ${titan.label}!\n\n` +
                    `📦 <b>Salvage Collected</b>\n` +
                    `├─ Moons: +${partialMoons} 🌙\n` +
                    `└─ XP: +${partialXP}\n\n` +
                    `⚠️ Streak reset — lost all consecutive wins.\n\n` +
                    `«Retreating is not cowardice. It is survival.» — Armin\n` +
                    leaderboard +
                    `⏰ <i>Cooldown: 2 hours</i>`,
                    { parse_mode: "HTML" }
                );
                return;
            }

            // ── Apply damage ──────────────────────────────────────
            titanHp = Math.max(0, titanHp - playerDmg);
            playerHp = Math.max(0, playerHp - titanDmg);
            round++;

            session.titanHp = titanHp;
            session.playerHp = playerHp;
            session.round = round;
            session.odmCharges = odmCharges;

            // ── VICTORY ───────────────────────────────────────────
            if (titanHp <= 0) {
                sessions.delete(userId);

                const user = await getSafeUser(userId, firstName);
                const streak = (user.expeditionStreak || 0) + 1;
                const bonus = streakBonus(streak);
                const moonGain = Math.floor(titan.reward.moons * (1 + bonus));
                const xpGain = titan.reward.xp;
                const scoreGain = titan.reward.score;

                user.balance = (user.balance || 0) + moonGain;
                user.moons = (user.moons || 0) + moonGain;
                user.xp = (user.xp || 0) + xpGain;
                user.expeditionKills = (user.expeditionKills || 0) + 1;
                user.expeditionScore = (user.expeditionScore || 0) + scoreGain;
                user.expeditionWins = (user.expeditionWins || 0) + 1;
                user.expeditionStreak = streak;
                user.lastExpeditionAt = Math.floor(Date.now() / 1000);

                // Item drops
                let dropLine = "";
                const dropRoll = Math.random();
                if (dropRoll < 0.05) {
                    dropLine = `\n🧣 <b>RARE DROP:</b> Mikasa's Scarf Fragment! (+5 HP next expedition)`;
                } else if (dropRoll < 0.15) {
                    dropLine = `\n⚡ <b>DROP:</b> ODM Upgrade! (+1 ODM charge next expedition)`;
                }

                await user.save();

                const streakBonusText = bonus > 0 ? ` (+${Math.round(bonus * 100)}% streak bonus!)` : "";
                const leaderboard = await buildLeaderboard(userId);
                const rankTitle = getRankTitle(user.expeditionKills);

                await ctx.editMessageText(
                    `🏆 <b>TITAN SLAIN!</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `⚔️ ${mention} defeats the <b>${titan.label}</b>!\n\n` +
                    `💀 Final blow dealt in Round ${round - 1}.\n\n` +
                    `🎁 <b>REWARDS</b>\n` +
                    `├─ Moons: +${moonGain} 🌙${streakBonusText}\n` +
                    `├─ XP: +${xpGain}\n` +
                    `└─ Score: +${scoreGain}\n` +
                    `${dropLine}\n\n` +
                    `📊 <b>YOUR STATS</b>\n` +
                    `├─ Rank: ${rankTitle}\n` +
                    `├─ Total Kills: ${user.expeditionKills}\n` +
                    `├─ Win Streak: 🔥 ${streak}\n` +
                    `└─ Total Score: ${(user.expeditionScore).toLocaleString()}\n\n` +
                    `${titan.quote}\n` +
                    leaderboard +
                    `⏰ <i>Cooldown: 2 hours  ·  /expedition to go again</i>`,
                    { parse_mode: "HTML" }
                );
                return;
            }

            // ── DEFEAT ────────────────────────────────────────────
            if (playerHp <= 0) {
                sessions.delete(userId);

                const user = await getSafeUser(userId, firstName);
                const consolationMoons = Math.floor(titan.reward.moons * 0.15);
                const consolationXP = Math.floor(titan.reward.xp * 0.10);

                user.balance = (user.balance || 0) + consolationMoons;
                user.moons = (user.moons || 0) + consolationMoons;
                user.xp = (user.xp || 0) + consolationXP;
                user.expeditionLosses = (user.expeditionLosses || 0) + 1;
                user.expeditionStreak = 0;
                user.lastExpeditionAt = Math.floor(Date.now() / 1000);
                await user.save();

                const leaderboard = await buildLeaderboard(userId);

                await ctx.editMessageText(
                    `💀 <b>DEFEATED</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `The <b>${titan.label}</b> overpowers ${mention}!\n\n` +
                    `💔 Fell in Round ${round - 1}.\n\n` +
                    `📦 <b>Consolation</b>\n` +
                    `├─ Moons: +${consolationMoons} 🌙\n` +
                    `└─ XP: +${consolationXP}\n\n` +
                    `⚠️ Win streak has been reset.\n\n` +
                    `«Stand up, soldier. The mission is not over.» — Mikasa\n` +
                    leaderboard +
                    `⏰ <i>Cooldown: 2 hours  ·  /expedition to try again</i>`,
                    { parse_mode: "HTML" }
                );
                return;
            }

            // ── Battle continues — update message ─────────────────
            const updatedText = buildBattleMessage({
                session,
                userName: firstName,
                mention,
                log
            });

            await ctx.editMessageText(updatedText, {
                parse_mode: "HTML",
                reply_markup: battleButtons(userId, odmCharges)
            });

        } catch (err) {
            console.error("EXPEDITION ACTION ERROR:", err);
            try { await ctx.answerCbQuery("⚠️ Error — try again!"); } catch { }
        }
    }

    // ─── CALLBACK BINDINGS ─────────────────────────────────────────────────────
    bot.action(/^exp_attack_(\d+)$/, (ctx) => processAction(ctx, parseInt(ctx.match[1]), "attack"));
    bot.action(/^exp_dodge_(\d+)$/, (ctx) => processAction(ctx, parseInt(ctx.match[1]), "dodge"));
    bot.action(/^exp_odm_(\d+)$/, (ctx) => processAction(ctx, parseInt(ctx.match[1]), "odm"));
    bot.action(/^exp_retreat_(\d+)$/, (ctx) => processAction(ctx, parseInt(ctx.match[1]), "retreat"));

    // ─── SESSION JANITOR (clean up stale sessions every 5 min) ─────────────────
    setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        for (const [userId, session] of sessions) {
            if (now - session.startAt > SESSION_TIMEOUT) {
                sessions.delete(userId);
            }
        }
    }, 5 * 60 * 1000);
}
