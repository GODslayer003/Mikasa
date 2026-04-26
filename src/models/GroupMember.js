import mongoose from "mongoose";

const groupMemberSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  groupId: { type: Number, required: true },
  firstName: String,
  username: String,
  lastSeenAt: Date
}, { timestamps: true });

groupMemberSchema.index({ userId: 1, groupId: 1 }, { unique: true });

export const GroupMember = mongoose.model("GroupMember", groupMemberSchema);
