import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    chatId: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },

    type: {
      type: String,
      enum: ["private", "group", "supergroup"],
      required: true
    },

    title: {
      type: String,
      default: null
    },

    username: {
      type: String,
      default: null
    },

    // ─── ACTIVITY ─────────────────────────────
    firstSeenAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000)
    },

    lastSeenAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000)
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export const Chat = mongoose.model("Chat", chatSchema);