import { User } from "./models/User.js";

export async function migrateLegacyCurrency() {
  const result = await User.updateMany(
    { stars: { $exists: false } },
    [
      {
        $set: {
          stars: {
            $cond: {
              if: { $and: [{ $gt: ["$rp", 0] }, { $ne: ["$rp", null] }] },
              then: "$rp",
              else: {
                $cond: {
                  if: { $and: [{ $gt: ["$balance", 0] }, { $ne: ["$balance", null] }] },
                  then: "$balance",
                  else: {
                    $cond: {
                      if: { $and: [{ $gt: ["$moons", 0] }, { $ne: ["$moons", null] }] },
                      then: "$moons",
                      else: 0
                    }
                  }
                }
              }
            }
          }
        }
      }
    ],
    { updatePipeline: true }
  );

  const zeroed = await User.updateMany(
    { stars: { $exists: false } },
    { $set: { stars: 0 } }
  );

  console.log(`Migration complete: ${result.modifiedCount} users received stars from legacy currency.`);
}
