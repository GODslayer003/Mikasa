import { Jimp } from 'jimp';

async function test() {
  try {
    const img1 = new Jimp({ width: 100, height: 100, color: 0xFF0000FF });
    const img2 = new Jimp({ width: 100, height: 100, color: 0x00FF00FF });
    
    img1.cover({ w: 50, h: 50 });
    img2.cover({ w: 50, h: 50 });
    
    const canvas = new Jimp({ width: 100, height: 50, color: 0x000000FF });
    canvas.composite(img1, 0, 0);
    canvas.composite(img2, 50, 0);
    
    await canvas.write('scratch/test_out.png');
    console.log('Image written successfully');
  } catch (err) {
    console.error('Test failed:', err);
  }
}

test();
