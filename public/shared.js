const $ = id => document.getElementById(id);
const letters = ['A', 'B', 'C', 'D'];
const answerLetter = value => ({A: 'أ', B: 'ب', C: 'ج', D: 'د'}[value] || value);
const money = amount => amount.toLocaleString('ar') + ' دولار';
function connection(connected) {
  $('connection').textContent = connected ? '● متصل' : '● انقطع الاتصال — جارٍ إعادة الاتصال';
  $('connection').classList.toggle('offline', !connected);
}
function renderBars(poll) {
  $('vote-count').textContent = `عدد الأصوات: ${poll.total} · ${poll.open ? 'التصويت مفتوح' : 'التصويت مغلق'}`;
  $('bars').replaceChildren();
  if (!poll.percentages) return;
  letters.forEach((letter, i) => {
    const row = document.createElement('div'); row.className = 'bar-row';
    const label = document.createElement('b'); label.textContent = answerLetter(letter);
    const track = document.createElement('div'); track.className = 'track';
    const fill = document.createElement('div'); fill.className = 'fill'; fill.style.width = poll.percentages[i] + '%';
    const number = document.createElement('span'); number.className = 'bar-number'; number.textContent = poll.percentages[i] + '%';
    track.append(fill); row.append(label, track, number); $('bars').append(row);
  });
}
// One Web Audio context plays local WAV files after the user clicks تشغيل الصوت.
// Unlocking must happen separately on each browser page; enable only the speaker page.
const soundPlayer = (() => {
  let context, enabled = false, nextTime = 0;
  const buffers = {};
  const names = ['question', 'lock', 'correct', 'wrong', 'lifeline', 'next', 'win', 'lose'];
  return {
    async toggle() {
      if (enabled) {enabled = false; await context.suspend(); $('sound-toggle').textContent = 'تشغيل الصوت'; return;}
      try {
        context ||= new (window.AudioContext || window.webkitAudioContext)();
        await context.resume();
        await Promise.all(names.map(async name => {
          if (buffers[name]) return;
          const response = await fetch(`/sounds/${name}.wav`);
          if (!response.ok) throw Error(`ملف الصوت ${name}.wav غير موجود. شغّلي npm run sounds.`);
          buffers[name] = await context.decodeAudioData(await response.arrayBuffer());
        }));
        enabled = true; nextTime = context.currentTime; $('sound-toggle').textContent = 'كتم الصوت';
        this.play(['question']);
      } catch (error) {$('message').textContent = `تعذّر تشغيل الصوت: ${error.message}`;}
    },
    play(namesToPlay) {
      if (!enabled || context.state !== 'running') return;
      nextTime = Math.max(context.currentTime, nextTime);
      namesToPlay.forEach(name => {
        if (!buffers[name]) return;
        const source = context.createBufferSource(); source.buffer = buffers[name];
        const gain = context.createGain(); gain.gain.value = 0.65;
        source.connect(gain).connect(context.destination); source.start(nextTime);
        nextTime += source.buffer.duration + 0.1;
      });
    }
  };
})();
if ($('sound-toggle')) $('sound-toggle').onclick = () => soundPlayer.toggle();
if ($('fullscreen')) $('fullscreen').onclick = async () => {
  try {if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen();}
  catch {$('message').textContent = 'استخدمي F11 لملء الشاشة على جهازك.';}
};
