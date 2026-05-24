import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

const envFile = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envFile });
const uri = process.env.MONGO_URI || 'mongodb+srv://monsterbot:6DH1J298ZmeSmWqB@cluster0.bgwchcz.mongodb.net/monsterbot';
const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', userSchema);

(async () => {
  try {
    await mongoose.connect(uri, { maxPoolSize: 2, minPoolSize: 1 });
    const count = await User.countDocuments();
    console.log('user count', count);
    const sample = await User.findOne().lean();
    if (!sample) {
      console.log('sample none');
    } else {
      console.log('sample', JSON.stringify({
        telegramId: sample.telegramId,
        firstName: sample.firstName,
        username: sample.username,
        rp: sample.rp,
        balance: sample.balance,
        hp: sample.hp,
        shadowsLen: (sample.shadows || []).length
      }, null, 2));
    }
    await mongoose.disconnect();
  } catch (err) {
    console.error('error', err.message);
    process.exit(1);
  }
})();
