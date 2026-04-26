// models/Duel.js
import mongoose from "mongoose";

const DuelSchema = new mongoose.Schema({
  duelId: { type: String, unique: true },

  challengerId: Number,
  opponentId: Number,

  challengerCharIndex: Number,
  opponentCharIndex: Number,

  challengerHP: Number,
  opponentHP: Number,

  turn: { type: Number, enum: [1, 2] }, // 1 = challenger, 2 = opponent
  status: {
    type: String,
    enum: ["pending", "active", "finished"],
    default: "pending"
  },

  createdAt: Number
});

export const Duel = mongoose.model("Duel", DuelSchema);