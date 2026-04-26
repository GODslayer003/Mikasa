import mongoose from "mongoose";

const dailyDuoSchema = new mongoose.Schema({
  groupId: { type: Number, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD (IST)
  user1: {
    userId: Number,
    firstName: String,
    username: String
  },
  user2: {
    userId: Number,
    firstName: String,
    username: String
  }
}, { timestamps: true });

dailyDuoSchema.index({ groupId: 1, date: 1 }, { unique: true });

export const DailyDuo = mongoose.model("DailyDuo", dailyDuoSchema);
