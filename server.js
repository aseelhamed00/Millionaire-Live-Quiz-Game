const express = require('express');
const {createServer} = require('node:http');
const {Server} = require('socket.io');
const QRCode = require('qrcode');
const {randomBytes, randomUUID, createHmac, timingSafeEqual} = require('node:crypto');
const {networkInterfaces} = require('node:os');
const path = require('node:path');
const LETTERS = ['A', 'B', 'C', 'D'];
const ARABIC_LETTERS = {A: 'أ', B: 'ب', C: 'ج', D: 'د'};
const QUESTIONS_PER_GAME = 10;
const ROUND_PRIZES = [100, 200, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000];
const SOUNDS = ['question', 'lock', 'correct', 'wrong', 'lifeline', 'next', 'win', 'lose'];

function validateQuestions(questions) {
  // Twenty unique questions allow two consecutive games without overlap.
  if (!Array.isArray(questions) || questions.length < QUESTIONS_PER_GAME * 2) {
    throw Error('أضيفي 20 سؤالًا مختلفًا على الأقل في questions.json. كل جولة تتكوّن من 10 أسئلة.');
  }
  const seen = new Set();
  questions.forEach((q, i) => {
    if (!q || typeof q.text !== 'string' || !q.text.trim() ||
        !Array.isArray(q.choices) || q.choices.length !== 4 ||
        q.choices.some(c => typeof c !== 'string' || !c.trim()) ||
        !LETTERS.includes(q.correct) || !Number.isInteger(q.level) || q.level < 1 ||
        !['سهل', 'متوسط'].includes(q.difficulty) || !Number.isFinite(q.prize) || q.prize <= 0) {
      throw Error(`السؤال ${i + 1} غير صالح: تحققي من النص والخيارات الأربعة والإجابة A-D والمستوى والصعوبة والجائزة.`);
    }
    const key = q.text.trim().toLowerCase();
    if (seen.has(key)) throw Error(`السؤال ${i + 1} مكرر: ${q.text}`);
    seen.add(key);
  });
  for (const difficulty of ['سهل', 'متوسط']) {
    if (questions.filter(q => q.difficulty === difficulty).length < 10) {
      throw Error(`يجب توفير 10 أسئلة على الأقل من المستوى: ${difficulty}`);
    }
  }
}
function percentages(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return [0, 0, 0, 0];
  const raw = counts.map(n => n * 100 / total), rounded = raw.map(Math.floor);
  const order = raw.map((n, i) => ({i, remainder: n - rounded[i]}))
    .sort((a, b) => b.remainder - a.remainder);
  const remaining = 100 - rounded.reduce((a, b) => a + b, 0);
  for (let k = 0; k < remaining; k++) rounded[order[k].i]++;
  return rounded;
}
function createGameServer(options = {}) {
  const questionBank = options.questions || require('./questions.json');
  validateQuestions(questionBank);
  let questions = []; // Only the ten questions selected for the current game.
  const pin = options.pin || process.env.HOST_PIN || randomBytes(8).toString('hex');
  const secret = randomBytes(32);
  const app = express(), http = createServer(app);
  const io = new Server(http, {maxHttpBufferSize: 10000});
  const host = io.of('/host');
  let baseUrl = options.baseUrl || process.env.PUBLIC_URL || 'http://localhost:3000';
  let revision = 0, game;
  const attempts = new Map();
  const q = () => questions[game.index];
  function reset() {
    // Exclude all ten questions from the previous game, even if it ended early.
    const previous = new Set(questions.map(question => question.text));
    const available = questionBank.filter(question => !previous.has(question.text));
    // Five easy questions, then five medium questions; no hard questions.
    function draw(difficulty) {
      const pool = available.filter(question => question.difficulty === difficulty);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, QUESTIONS_PER_GAME / 2);
    }
    questions = [...draw('سهل'), ...draw('متوسط')]
      .map((question, i) => ({...question, level: i + 1, prize: ROUND_PRIZES[i]}));
    game = {index: 0, phase: 'ready', selected: null, eliminated: [],
      used: {fifty: false, audience: false, friend: false}, friend: '', earned: 0,
      showResults: true, poll: {id: randomUUID(), open: false, active: false, votes: new Map()}};
  }
  reset();
  function publicState() {
    const counts = LETTERS.map(letter => [...game.poll.votes.values()].filter(v => v === letter).length);
    const revealed = ['revealed', 'lost', 'won'].includes(game.phase);
    return {revision, index: game.index, phase: game.phase,
      question: {text: q().text, choices: q().choices, difficulty: q().difficulty, level: q().level, prize: q().prize},
      correct: revealed ? q().correct : null, selected: game.selected,
      eliminated: game.eliminated, used: game.used, friend: game.friend, earned: game.earned,
      ladder: questions.map(x => ({level: x.level, prize: x.prize})),
      showResults: game.showResults, voteUrl: baseUrl + '/vote.html',
      poll: {id: game.poll.id, active: game.poll.active, open: game.poll.open,
        total: counts.reduce((a, b) => a + b, 0), counts, percentages: percentages(counts)}};
  }
  // Only the host receives private results when projector results are hidden.
  function audienceState() {
    const s = publicState();
    if (!s.showResults) {s.poll.counts = null; s.poll.percentages = null;}
    return s;
  }
  function broadcast() {io.emit('state', audienceState()); host.emit('state', publicState());}
  function changed() {revision++; broadcast();}
  function sound(...names) {io.emit('sound', names); host.emit('sound', names);}
  function sign(id) {return createHmac('sha256', secret).update(id).digest('hex');}
  function identity(cookie = '') {
    const token = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('quiz_voter='))?.slice(11);
    if (!token) return null;
    const [id, signature] = token.split('.');
    if (!/^[a-f0-9]{32}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return null;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id))) ? id : null;
  }
  app.use((req, res, next) => {res.set('Cache-Control', 'no-store'); next();});
  app.get('/api/identity', (req, res) => {
    let id = identity(req.headers.cookie);
    if (!id) {
      id = randomBytes(16).toString('hex');
      res.cookie('quiz_voter', id + '.' + sign(id), {httpOnly: true, sameSite: 'strict', maxAge: 86400000, path: '/'});
    }
    res.json({ok: true});
  });
  app.get('/api/qr', async (req, res) => {
    try {res.type('png').send(await QRCode.toBuffer(baseUrl + '/vote.html', {width: 360, margin: 3}));}
    catch {res.status(500).send('تعذّر إنشاء رمز التصويت. استخدمي رابط التصويت الظاهر.');}
  });
  app.use(express.static(path.join(__dirname, 'public')));
  io.on('connection', socket => {
    const voter = identity(socket.handshake.headers.cookie);
    socket.emit('state', audienceState());
    const status = () => socket.emit('vote-status', {pollId: game.poll.id, choice: game.poll.votes.get(voter) || null});
    status();
    socket.on('vote-status', status);
    socket.on('vote', (data, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      if (!voter) return ack({ok: false, error: 'يجب تفعيل ملفات تعريف الارتباط. أعيدي تحميل الصفحة.'});
      if (!data || data.pollId !== game.poll.id) return ack({ok: false, error: 'تغيّرت جولة التصويت. حاولي مجددًا.'});
      if (game.poll.votes.has(voter)) return ack({ok: false, error: 'تم تسجيل تصويتك مسبقًا.', choice: game.poll.votes.get(voter)});
      if (!game.poll.open || game.phase !== 'question') return ack({ok: false, error: 'التصويت مغلق.'});
      if (!LETTERS.includes(data.choice) || game.eliminated.includes(data.choice)) return ack({ok: false, error: 'اختاري إجابة متاحة.'});
      game.poll.votes.set(voter, data.choice);
      // Votes do not change the host-command revision: voting cannot invalidate a host click.
      broadcast(); status(); ack({ok: true, choice: data.choice});
    });
  });
  host.use((socket, next) => {
    const ip = socket.handshake.address, now = Date.now();
    let entry = attempts.get(ip);
    if (!entry || now - entry.start > 60000) entry = {start: now, count: 0};
    attempts.set(ip, entry);
    if (++entry.count > 20) return next(Error('محاولات دخول كثيرة. انتظري دقيقة واحدة.'));
    const supplied = String(socket.handshake.auth?.pin || '');
    if (Buffer.byteLength(supplied) !== Buffer.byteLength(pin) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(pin))) return next(Error('رمز المقدّم غير صحيح.'));
    next();
  });
  host.on('connection', socket => {
    socket.emit('state', publicState());
    socket.on('command', (data, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      try {
        if (!data || data.revision !== revision) throw Error('تغيّرت حالة اللعبة. تحققي من الشاشة وحاولي مجددًا.');
        const {action, value} = data;
        const requireQuestion = () => {if (game.phase !== 'question') throw Error('ابدئي سؤالًا قبل استخدام هذا الزر.');};
        const use = name => {requireQuestion(); if (game.used[name]) throw Error('تم استخدام هذه المساعدة مسبقًا.'); game.used[name] = true;};
        if (action === 'restart') {reset(); sound('question');}
        else if (action === 'start') {
          if (game.phase !== 'ready') throw Error('بدأت اللعبة بالفعل.');
          game.phase = 'question'; sound('question');
        } else if (action === 'lock') {
          requireQuestion();
          if (!LETTERS.includes(value) || game.eliminated.includes(value)) throw Error('اختاري إجابة متاحة.');
          game.selected = value; game.phase = 'locked'; game.poll.open = false; sound('lock');
        } else if (action === 'reveal') {
          if (game.phase !== 'locked') throw Error('ثبّتي الإجابة أولًا.');
          if (game.selected === q().correct) {
            game.earned = q().prize;
            game.phase = game.index === questions.length - 1 ? 'won' : 'revealed';
            sound(...(game.phase === 'won' ? ['correct', 'win'] : ['correct']));
          } else {
            const checkpoint = Math.floor(game.index / 5) * 5 - 1;
            game.earned = checkpoint >= 0 ? questions[checkpoint].prize : 0;
            game.phase = 'lost'; sound('wrong', 'lose');
          }
        } else if (action === 'next') {
          if (game.phase !== 'revealed') throw Error('اكشفي إجابة صحيحة قبل الانتقال للسؤال التالي.');
          game.index++; game.phase = 'question'; game.selected = null; game.eliminated = []; game.friend = '';
          game.poll = {id: randomUUID(), active: false, open: false, votes: new Map()}; sound('next', 'question');
        } else if (action === 'fifty') {
          if (game.poll.open) throw Error('أوقفي تصويت الجمهور قبل حذف إجابتين.');
          use('fifty');
          const wrong = LETTERS.filter(x => x !== q().correct);
          for (let i = wrong.length - 1; i > 0; i--) {const j = Math.floor(Math.random() * (i + 1)); [wrong[i], wrong[j]] = [wrong[j], wrong[i]];}
          game.eliminated = wrong.slice(0, 2); sound('lifeline');
        } else if (action === 'friend') {
          use('friend');
          const wrong = LETTERS.filter(x => x !== q().correct && !game.eliminated.includes(x));
          const answer = Math.random() < 0.8 ? q().correct : wrong[Math.floor(Math.random() * wrong.length)];
          game.friend = `«أعتقد أن الإجابة ${ARABIC_LETTERS[answer]}: ${q().choices[LETTERS.indexOf(answer)]}، لكنني لست متأكدًا تمامًا!»`;
          sound('lifeline');
        } else if (action === 'audience') {
          use('audience'); game.poll.active = true; game.poll.open = true; sound('lifeline');
        } else if (action === 'voting') {
          requireQuestion(); if (!game.poll.active) throw Error('فعّلي مساعدة الجمهور أولًا.');
          game.poll.open = Boolean(value);
        } else if (action === 'resetVotes') {
          requireQuestion(); if (!game.poll.active) throw Error('فعّلي مساعدة الجمهور أولًا.');
          game.poll.id = randomUUID(); game.poll.votes.clear(); game.poll.open = false;
        } else if (action === 'results') {game.showResults = Boolean(value);}
        else if (action === 'url') {
          let url;
          try {url = new URL(value);} catch {throw Error('عنوان غير صالح. أدخلي رابطًا يبدأ بـ http:// أو https://');}
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('أدخلي عنوان الموقع فقط، مثل http://192.168.1.25:3000');
          baseUrl = url.origin;
        } else if (action === 'sound') {
          if (!SOUNDS.includes(value)) throw Error('الصوت غير معروف.'); sound(value);
        } else throw Error('الأمر غير معروف.');
        changed(); ack({ok: true});
      } catch (error) {ack({ok: false, error: error.message});}
    });
  });
  return {http, io, pin, publicState};
}
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const gameServer = createGameServer();
  gameServer.http.on('error', error => {console.error(error.message); process.exitCode = 1;});
  gameServer.http.listen(port, '0.0.0.0', () => {
    console.log(`\nلوحة المقدّم: http://localhost:${port}/host.html\nشاشة العرض: http://localhost:${port}\nرمز المقدّم: ${gameServer.pin}\n`);
    console.log('اختاري عنوان الشبكة وأدخليه في لوحة المقدّم ضمن عنوان التصويت:');
    try {
      for (const entries of Object.values(networkInterfaces())) for (const address of entries || []) {
        if (address.family === 'IPv4' && !address.internal) console.log(`http://${address.address}:${port}`);
      }
    } catch {console.log('تعذّر اكتشاف عنوان الشبكة تلقائيًا. شغّلي ipconfig في ويندوز.');}
    console.log('اتركي هذه النافذة مفتوحة. Ctrl+C يوقف اللعبة.');
  });
}
module.exports = {createGameServer, validateQuestions, percentages};
