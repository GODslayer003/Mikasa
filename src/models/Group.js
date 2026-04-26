import mongoose from "mongoose";

const groupSchema = new mongoose.Schema({
  chatId: Number,
  title: String,
  type: String, // group / supergroup

  membersSeen: Number,
  firstSeenAt: Date,
  lastActiveAt: Date
});

export const Group = mongoose.model("Group", groupSchema);