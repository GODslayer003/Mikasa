/**
 * Checks if the current chat has at least the required number of members.
 * @param {object} ctx - Telegraf context
 * @param {number} minMembers - Minimum required members
 * @returns {Promise<boolean>}
 */
export async function hasMinMembers(ctx, minMembers = 20) {
  if (ctx.chat.type === "private") return false;
  
  try {
    const count = await ctx.getChatMembersCount();
    return count >= minMembers;
  } catch (err) {
    console.error("Error getting chat members count:", err);
    // If we can't get the count, we assume it doesn't meet the requirement for safety
    return false;
  }
}
