// Original synthesized WAV cues: no downloads or third-party recordings needed.
const fs = require('node:fs');
const path = require('node:path');
const melodies = {
  question: [330, 440, 660], lock: [220, 220], correct: [523, 659, 784, 1047],
  wrong: [330, 277, 196], lifeline: [440, 660, 880, 660], next: [392, 523],
  win: [523, 659, 784, 1047, 784, 1047], lose: [392, 330, 262, 196]
};
const folder = path.join(__dirname, 'public', 'sounds');
fs.mkdirSync(folder, {recursive: true});
for (const [name, notes] of Object.entries(melodies)) {
  const rate = 22050, duration = 0.18, samples = Math.floor(rate * duration);
  const size = samples * notes.length * 2, wav = Buffer.alloc(44 + size);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + size, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(size, 40);
  notes.forEach((frequency, n) => {
    for (let i = 0; i < samples; i++) {
      const t = i / rate;
      const envelope = Math.min(t / 0.015, 1) * Math.max(0, 1 - t / duration);
      const wave = Math.sin(2 * Math.PI * frequency * t);
      wav.writeInt16LE(Math.round(9000 * envelope * wave), 44 + (n * samples + i) * 2);
    }
  });
  fs.writeFileSync(path.join(folder, name + '.wav'), wav);
}
console.log('Created eight original sound cues in public/sounds.');
