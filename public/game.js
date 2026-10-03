const isHost = document.body.dataset.role === 'host';
let socket, state, busy = false, lastQr = '';
async function command(action, value) {
  if (!socket?.connected || !state || busy) return;
  if (['restart', 'resetVotes'].includes(action) && !confirm(action === 'restart' ? 'بدء جولة جديدة بعشرة أسئلة أخرى وإعادة جميع المساعدات؟' : 'تصفير كل الأصوات؟ يمكن للجميع التصويت مجددًا بعد فتح التصويت.')) return;
  busy = true; render(); $('message').textContent = '';
  socket.timeout(5000).emit('command', {action, value, revision: state.revision}, (error, result) => {
    busy = false;
    if (error) $('message').textContent = 'انتهت مهلة الاتصال. تحققي من الشاشة قبل إعادة المحاولة.';
    else if (!result.ok) $('message').textContent = result.error;
    render();
  });
}
function connect(pin) {
  if (socket) socket.disconnect();
  socket = isHost ? io('/host', {auth: {pin}}) : io();
  socket.on('connect', () => {
    connection(true);
    if (isHost) {$('login').hidden = true; $('app').hidden = false;}
    render();
  });
  socket.on('disconnect', () => {connection(false); render();});
  socket.on('connect_error', error => {
    connection(false);
    if (isHost) {$('login').hidden = false; $('login-error').textContent = /[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذّر الاتصال بالخادم. تحققي من تشغيل اللعبة وحاولي مجددًا.';}
    else $('message').textContent = 'تعذّر الاتصال بالخادم. اتركي نافذة تشغيل اللعبة مفتوحة.';
  });
  socket.on('state', value => {state = value; render();});
  socket.on('sound', names => soundPlayer.play(names));
}
function render() {
  if (!state) return;
  const s = state, active = isHost && socket.connected && !busy;
  document.body.classList.toggle('poll-active', s.poll.active);
  const phaseNames = {ready: 'جاهزون للعب', question: 'اختاري إجابتك', locked: 'تم تثبيت الإجابة النهائية', revealed: 'إجابة صحيحة', won: 'مبروك المليون!', lost: 'انتهت الجولة'};
  $('phase').textContent = phaseNames[s.phase];
  $('level').textContent = `السؤال ${s.index + 1} من ${s.ladder.length} · ${s.question.difficulty}`;
  $('prize').textContent = `قيمة السؤال: ${money(s.question.prize)}`;
  $('question').textContent = s.phase === 'ready' ? 'رحلة المليون تبدأ بإجابة واحدة.' : s.question.text;
  $('answers').replaceChildren();
  if (s.phase !== 'ready') letters.forEach((letter, i) => {
    const button = document.createElement('button'); button.className = 'answer';
    const label = document.createElement('span'); label.className = 'letter'; label.textContent = answerLetter(letter) + ':';
    const text = document.createElement('span'); text.className = 'answer-text'; text.textContent = s.question.choices[i];
    const tag = document.createElement('span'); tag.className = 'result-tag';
    if (s.eliminated.includes(letter)) button.classList.add('eliminated');
    if (s.selected === letter) {button.classList.add('selected'); tag.textContent = 'مثبّتة';}
    if (s.correct === letter) {button.classList.add('correct'); tag.textContent = 'صحيحة';}
    else if (s.correct && s.selected === letter) {button.classList.add('wrong'); tag.textContent = 'خاطئة';}
    button.disabled = !active || s.phase !== 'question' || s.eliminated.includes(letter);
    if (!isHost) button.classList.add('static');
    button.append(label, text, tag); button.onclick = () => command('lock', letter); $('answers').append(button);
  });
  ['fifty', 'audience', 'friend'].forEach(name => {
    $(name).classList.toggle('used', s.used[name]);
    $(name).disabled = !active || s.phase !== 'question' || s.used[name] || (name === 'fifty' && s.poll.open);
    $(name).title = s.used[name] ? 'استُخدمت مسبقًا' : name === 'fifty' && s.poll.open ? 'أوقفي التصويت أولًا' : '';
  });
  $('ladder').replaceChildren();
  s.ladder.forEach((step, i) => {
    const row = document.createElement('li');
    row.className = [i === s.index ? 'current' : '', i < s.index ? 'passed' : '', (i + 1) % 5 === 0 ? 'safe' : ''].join(' ');
    const number = document.createElement('span'); number.textContent = step.level;
    const prize = document.createElement('span'); prize.textContent = money(step.prize);
    row.append(number, prize); $('ladder').append(row);
  });
  $('outcome').hidden = !['revealed', 'won', 'lost'].includes(s.phase);
  $('outcome').textContent = s.phase === 'lost' ? `الإجابة الصحيحة: ${answerLetter(s.correct)}. جائزتك: ${money(s.earned)}.` : `${s.phase === 'won' ? 'فزتِ!' : 'أحسنتِ!'} رصيدك: ${money(s.earned)}.`;
  $('friend-panel').hidden = !s.friend; $('friend-text').textContent = s.friend;
  $('audience-panel').hidden = !s.poll.active;
  if (lastQr !== s.voteUrl) {
    lastQr = s.voteUrl; $('qr').src = '/api/qr?address=' + encodeURIComponent(s.voteUrl);
    $('vote-link').href = s.voteUrl; $('vote-link').textContent = s.voteUrl;
  }
  renderBars(s.poll); $('bars').hidden = !isHost && !s.showResults;
  $('private-results').hidden = isHost || s.showResults;
  if (!isHost) return;
  $('start').disabled = !active || s.phase !== 'ready';
  $('reveal').disabled = !active || s.phase !== 'locked';
  $('next').disabled = !active || s.phase !== 'revealed';
  $('restart').disabled = !active;
  $('open-votes').disabled = !active || !s.poll.active || s.poll.open || s.phase !== 'question';
  $('close-votes').disabled = !active || !s.poll.open;
  $('reset-votes').disabled = !active || !s.poll.active || s.phase !== 'question';
  $('results').disabled = !active;
  $('results').textContent = s.showResults ? 'إخفاء النتائج عن الجمهور' : 'إظهار النتائج للجمهور';
  if (!$('base-url').value) $('base-url').value = new URL(s.voteUrl).origin;
  $('url-warning').textContent = ['localhost', '127.0.0.1', '0.0.0.0'].includes(new URL(s.voteUrl).hostname) ? 'هذا العنوان لا يعمل على هواتف الجمهور. أدخلي عنوان الشبكة أو رابط الوصول الخارجي قبل عرض رمز التصويت.' : '';
}
if (isHost) {
  $('login-form').onsubmit = event => {event.preventDefault(); connect($('pin').value);};
  ['start', 'reveal', 'next', 'restart', 'fifty', 'audience', 'friend'].forEach(name => $(name).onclick = () => command(name));
  $('open-votes').onclick = () => command('voting', true);
  $('close-votes').onclick = () => command('voting', false);
  $('reset-votes').onclick = () => command('resetVotes');
  $('results').onclick = () => command('results', !state.showResults);
  $('url-form').onsubmit = event => {event.preventDefault(); command('url', $('base-url').value.trim());};
  $('play-cue').onclick = () => command('sound', $('cue').value);
} else connect();
