import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI is not set in .env');
  process.exit(1);
}

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', userSchema);

(async () => {
  try {
    await mongoose.connect(uri, { maxPoolSize: 5 });
    console.log('Connected to MongoDB');

    const cursor = User.find({}).cursor();
    let updated = 0;
    for await (const doc of cursor) {
      const balance = typeof doc.balance === 'number' ? doc.balance : (typeof doc.moons === 'number' ? doc.moons : null);
      if (balance === null) continue;
      // If rp missing or differs from balance, update to match balance
      if (typeof doc.rp !== 'number' || doc.rp !== Math.floor(balance)) {
        await User.updateOne({ _id: doc._id }, { $set: { rp: Math.floor(balance), moons: Math.floor(balance), balance: Math.floor(balance) } });
        updated++;
      }
    }

    console.log(`Migration complete. Documents updated: ${updated}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
