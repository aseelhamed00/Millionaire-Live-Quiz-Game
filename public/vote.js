let socket, state, voted = null, pending = false, checked = false;
function render() {
  if (!state) return;
  $('vote-question').textContent = state.phase === 'ready' ? 'بانتظار المقدّم…' : state.question.text;
  $('vote-phase').textContent = `السؤال ${state.index + 1} · ${state.poll.open ? 'التصويت مفتوح' : 'التصويت مغلق'}`;
  $('vote-answers').replaceChildren();
  letters.forEach((letter, i) => {
    const button = document.createElement('button'); button.className = 'answer';
    const label = document.createElement('span'); label.className = 'letter'; label.textContent = answerLetter(letter) + ':';
    const text = document.createElement('span'); text.textContent = state.phase === 'ready' ? '—' : state.question.choices[i];
    button.append(label, text);
    if (voted === letter) button.classList.add('selected');
    if (state.eliminated.includes(letter)) button.classList.add('eliminated');
    button.disabled = !socket.connected || !checked || pending || !!voted || !state.poll.open || state.eliminated.includes(letter);
    button.onclick = () => submit(letter); $('vote-answers').append(button);
  });
  $('message').textContent = !socket.connected ? 'انقطع الاتصال. جارٍ إعادة الاتصال…' : pending ? 'جارٍ إرسال تصويتك…' : !checked ? 'جارٍ التحقق من تصويتك…' : voted ? `شكرًا! تم تسجيل تصويتك للإجابة ${answerLetter(voted)}.` : state.poll.open ? 'التصويت مفتوح. اختاري أ أو ب أو ج أو د.' : 'التصويت مغلق. انتظري المقدّم.';
  renderBars(state.poll); $('private-results').hidden = state.showResults;
}
function submit(choice) {
  const submittedRound = state.poll.id;
  pending = true; render();
  socket.timeout(5000).emit('vote', {pollId: submittedRound, choice}, (error, result) => {
    if (state.poll.id !== submittedRound) return;
    pending = false;
    if (result?.choice) voted = result.choice;
    render();
    if (error) {socket.emit('vote-status'); $('message').textContent = 'لم يصل تأكيد بعد. جارٍ التحقق من وصول تصويتك…';}
    else if (!result.ok) $('message').textContent = result.error;
  });
}
async function start() {
  try {
    const response = await fetch('/api/identity');
    if (!response.ok) throw Error('تعذّر تهيئة التصويت.');
    socket = io();
    socket.on('connect', () => {connection(true); checked = false; socket.emit('vote-status'); render();});
    socket.on('disconnect', () => {connection(false); checked = false; render();});
    socket.on('connect_error', () => {$('message').textContent = 'تعذّر الاتصال باللعبة. تحققي من الشبكة وانتظري إعادة الاتصال.';});
    socket.on('state', value => {
      const newRound = state?.poll.id !== value.poll.id; state = value;
      if (newRound) {voted = null; checked = false; pending = false; socket.emit('vote-status');}
      render();
    });
    socket.on('vote-status', value => {
      if (value.pollId !== state?.poll.id) return;
      voted = value.choice; checked = true; render();
    });
  } catch (error) {$('message').textContent = error.message + ' أعيدي تحميل الصفحة للمحاولة مجددًا.';}
}
start();
