const {test} = require('node:test');
const assert = require('node:assert/strict');
const {io: connect} = require('socket.io-client');
const {createGameServer, percentages, validateQuestions} = require('../server');
const questions = require('../questions.json');
async function fixture(t, customQuestions = questions) {
  const server = createGameServer({pin: 'test-host-code', questions: customQuestions});
  await new Promise(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.http.address().port}`, sockets = [];
  t.after(async () => {sockets.forEach(s => s.disconnect()); await new Promise(resolve => server.io.close(resolve));});
  async function client(namespace = '', cookie = '', auth = {}) {
    const socket = connect(url + namespace, {forceNew: true, extraHeaders: {Cookie: cookie}, auth, reconnection: false});
    sockets.push(socket);
    await new Promise((resolve, reject) => {socket.once('connect', resolve); socket.once('connect_error', reject);});
    return socket;
  }
  const host = await client('/host', '', {pin: 'test-host-code'});
  const command = (action, value, revision = server.publicState().revision) => host.timeout(2000).emitWithAck('command', {action, value, revision});
  async function voter(cookie) {
    if (!cookie) {const res = await fetch(url + '/api/identity'); cookie = res.headers.get('set-cookie').split(';')[0];}
    return {socket: await client('', cookie), cookie};
  }
  const vote = (voter, choice, pollId = server.publicState().poll.id) => voter.socket.timeout(2000).emitWithAck('vote', {choice, pollId});
  const answer = () => customQuestions.find(q => q.text === server.publicState().question.text).correct;
  const wrong = () => ['A', 'B', 'C', 'D'].find(letter => letter !== answer());
  return {server, url, client, command, voter, vote, answer, wrong};
}
test('percentage rounding sums to 100; empty poll has zeroes', () => {
  assert.deepEqual(percentages([0, 0, 0, 0]), [0, 0, 0, 0]);
  assert.deepEqual(percentages([3, 12, 4, 1]), [15, 60, 20, 5]);
  assert.deepEqual(percentages([1, 1, 1, 0]), [34, 33, 33, 0]);
});
test('question validation rejects malformed data', () => {
  assert.throws(() => validateQuestions([]));
  assert.throws(() => validateQuestions(questions.map((q, i) => i === 0 ? {...q, correct: 'E'} : q)));
  assert.throws(() => validateQuestions(questions.map((q, i) => i === 0 ? {...q, choices: ['one']} : q)))
});
test('host authentication and answer-key isolation', async t => {
  const f = await fixture(t);
  await assert.rejects(f.client('/host', '', {pin: 'wrong'}), /غير صحيح/);
  await assert.rejects(f.client('/host', '', {pin: 'é'.repeat(14)}), /غير صحيح/);
  const res = await fetch(f.url + '/questions.json'); assert.equal(res.status, 404);
  assert.equal(f.server.publicState().correct, null);
  assert.equal((await f.command('reveal')).ok, false);
});
test('correct answer locks, reveals, then advances; stale command rejected', async t => {
  const f = await fixture(t);
  assert.equal((await f.command('start')).ok, true);
  const old = f.server.publicState().revision;
  await f.command('lock', f.answer());
  assert.equal(f.server.publicState().phase, 'locked');
  assert.equal(f.server.publicState().correct, null);
  assert.equal((await f.command('reveal', null, old)).ok, false);
  await f.command('reveal');
  assert.equal(f.server.publicState().phase, 'revealed');
  assert.equal(f.server.publicState().earned, 100);
  await f.command('next'); assert.equal(f.server.publicState().index, 1);
});
test('wrong answer ends game; restart clears game and restores lifelines', async t => {
  const f = await fixture(t); await f.command('start'); await f.command('friend');
  await f.command('lock', f.wrong()); await f.command('reveal');
  assert.equal(f.server.publicState().phase, 'lost');
  assert.equal(f.server.publicState().earned, 0);
  assert.equal((await f.command('next')).ok, false);
  await f.command('restart');
  assert.equal(f.server.publicState().phase, 'ready');
  assert.equal(f.server.publicState().used.friend, false);
});
test('all three lifelines are single-use and 50:50 preserves correct answer', async t => {
  const f = await fixture(t); await f.command('start'); await f.command('fifty');
  const s = f.server.publicState();
  assert.equal(s.eliminated.length, 2); assert.equal(s.eliminated.includes(f.answer()), false);
  assert.equal((await f.command('lock', s.eliminated[0])).ok, false);
  assert.equal((await f.command('fifty')).ok, false);
  await f.command('friend'); assert.match(f.server.publicState().friend, /أعتقد أن الإجابة/);
  assert.equal((await f.command('friend')).ok, false);
  await f.command('audience'); assert.equal((await f.command('audience')).ok, false);
  const v = await f.voter(); assert.equal((await f.vote(v, s.eliminated[0])).ok, false);
});
test('20 independent phones receive real-time state and produce exact percentages', async t => {
  const f = await fixture(t); await f.command('start'); await f.command('audience');
  const voters = await Promise.all(Array.from({length: 20}, () => f.voter()));
  let latest; voters[0].socket.on('state', s => {latest = s;});
  const choices = [...Array(3).fill('A'), ...Array(12).fill('B'), ...Array(4).fill('C'), 'D'];
  for (let i = 0; i < voters.length; i++) assert.equal((await f.vote(voters[i], choices[i])).ok, true);
  assert.deepEqual(f.server.publicState().poll.percentages, [15, 60, 20, 5]);
  // Flush one acknowledgement through the observer's connection after the broadcasts.
  await f.vote(voters[0], 'A');
  assert.equal(latest.poll.total, 20);
});
test('duplicate vote rejected after a new socket connects with same cookie', async t => {
  const f = await fixture(t); await f.command('start'); await f.command('audience');
  const a = await f.voter(); assert.equal((await f.vote(a, 'B')).ok, true);
  const b = await f.voter(a.cookie); assert.equal((await f.vote(b, 'C')).ok, false);
  assert.equal(f.server.publicState().poll.total, 1);
});
test('stop/resume preserves votes; reset invalidates old submissions and permits new vote', async t => {
  const f = await fixture(t); await f.command('start'); await f.command('audience');
  const a = await f.voter(), b = await f.voter(); await f.vote(a, 'A');
  await f.command('voting', false); assert.equal((await f.vote(b, 'B')).ok, false);
  await f.command('voting', true); assert.equal((await f.vote(a, 'B')).ok, false);
  const old = f.server.publicState().poll.id;
  await f.command('resetVotes'); assert.equal(f.server.publicState().poll.total, 0);
  assert.equal(f.server.publicState().poll.open, false);
  await f.command('voting', true);
  assert.equal((await f.vote(b, 'B', old)).ok, false);
  assert.equal((await f.vote(a, 'B')).ok, true);
  await f.command('lock', f.answer()); assert.equal((await f.vote(b, 'B')).ok, false);
});
test('private results are omitted from public socket', async t => {
  const f = await fixture(t); const v = await f.voter();
  const update = new Promise(resolve => v.socket.once('state', resolve));
  await f.command('results', false); const state = await update;
  assert.equal(state.poll.percentages, null); assert.equal(state.poll.counts, null);
  assert.deepEqual(f.server.publicState().poll.counts, [0,0,0,0]);
});
test('QR endpoint returns PNG, URL validation rejects script URLs, sounds are served', async t => {
  const f = await fixture(t);
  assert.equal((await f.command('url', 'javascript:alert(1)')).ok, false);
  assert.equal((await f.command('url', 'http://192.168.1.25:3000')).ok, true);
  assert.equal(f.server.publicState().voteUrl, 'http://192.168.1.25:3000/vote.html');
  const qr = await fetch(f.url + '/api/qr');
  assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await qr.arrayBuffer()).subarray(1,4).toString(), 'PNG');
  for (const name of ['question','lock','correct','wrong','lifeline','next','win','lose']) {
    const res = await fetch(f.url + '/sounds/' + name + '.wav'); assert.equal(res.status, 200);
    assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0,4).toString(), 'RIFF');
  }
});
test('winning final question and milestone payout work', async t => {
  const f = await fixture(t); await f.command('start');
  for (let i = 0; i < 10; i++) {
    await f.command('lock', f.answer()); await f.command('reveal');
    if (i < 9) await f.command('next');
  }
  assert.equal(f.server.publicState().phase, 'won');
  assert.equal(f.server.publicState().earned, 1000000);
  await f.command('restart'); await f.command('start');
  for (let i = 0; i < 5; i++) {await f.command('lock', f.answer()); await f.command('reveal'); await f.command('next');}
  await f.command('lock', f.wrong()); await f.command('reveal');
  assert.equal(f.server.publicState().earned, 5000);
});

test('ten unique questions, million at question ten, and no overlap on repeated restarts', async t => {
  const f = await fixture(t);
  const originalBank = JSON.stringify(questions);
  let previous = new Set();
  for (let round = 0; round < 8; round++) {
    const ladder = f.server.publicState().ladder;
    assert.equal(ladder.length, 10);
    assert.deepEqual(ladder.map(item => item.level), [1,2,3,4,5,6,7,8,9,10]);
    assert.equal(ladder[9].prize, 1000000);
    await f.command('start');
    const current = new Set();
    let lastDifficulty = -1;
    for (let index = 0; index < 10; index++) {
      const state = f.server.publicState();
      assert.equal(state.index, index);
      assert.equal(state.correct, null);
      assert.equal(current.has(state.question.text), false);
      assert.equal(previous.has(state.question.text), false);
      current.add(state.question.text);
      const difficulty = {'سهل': 0, 'متوسط': 1}[state.question.difficulty];
      assert.ok(difficulty >= lastDifficulty);
      assert.equal(state.question.difficulty, index < 5 ? 'سهل' : 'متوسط');
      lastDifficulty = difficulty;
      assert.equal((await f.command('lock', f.answer())).ok, true);
      assert.equal((await f.command('reveal')).ok, true);
      if (index < 9) assert.equal((await f.command('next')).ok, true);
    }
    assert.equal(f.server.publicState().phase, 'won');
    assert.equal((await f.command('next')).ok, false);
    previous = current;
    await f.command('restart');
  }
  assert.equal(JSON.stringify(questions), originalBank);
});
test('small and duplicate banks rejected; twenty unique questions are sufficient', async t => {
  assert.throws(() => validateQuestions(questions.slice(0, 19)), /20 سؤالًا/);
  const duplicated = [...questions]; duplicated[1] = {...duplicated[0]};
  assert.throws(() => validateQuestions(duplicated), /مكرر/);
  const f = await fixture(t, [...questions.filter(q => q.difficulty === 'سهل').slice(0, 10), ...questions.filter(q => q.difficulty === 'متوسط').slice(0, 10)]);
  let previous = new Set();
  for (let round = 0; round < 3; round++) {
    const current = new Set(); await f.command('start');
    for (let i = 0; i < 10; i++) {
      const question = f.server.publicState().question.text;
      assert.equal(previous.has(question), false); current.add(question);
      await f.command('lock', f.answer()); await f.command('reveal');
      if (i < 9) await f.command('next');
    }
    previous = current; await f.command('restart');
  }
});
test('restarting mid-question clears votes and lifelines and selects a new question', async t => {
  const f = await fixture(t);
  await f.command('url', 'http://192.168.1.25:3000');
  await f.command('start'); await f.command('friend'); await f.command('audience');
  const a = await f.voter(); await f.vote(a, 'A');
  const old = f.server.publicState();
  await f.command('restart'); const current = f.server.publicState();
  assert.notEqual(current.question.text, old.question.text);
  assert.notEqual(current.poll.id, old.poll.id);
  assert.equal(current.poll.total, 0); assert.equal(current.poll.open, false);
  assert.deepEqual(current.used, {fifty:false, audience:false, friend:false});
  assert.equal(current.phase, 'ready');
  assert.equal(current.voteUrl, 'http://192.168.1.25:3000/vote.html');
});

test('Arabic bank has 50 unique general-knowledge questions and balanced difficulty', () => {
  assert.equal(questions.length, 50);
  assert.equal(new Set(questions.map(q => q.text)).size, 50);
  assert.equal(questions.filter(q => q.difficulty === 'سهل').length, 25);
  assert.equal(questions.filter(q => q.difficulty === 'متوسط').length, 25);
  for (const q of questions) {
    assert.match(q.text, /[\u0600-\u06ff]/);
    assert.equal(new Set(q.choices).size, 4);
  }
  assert.throws(() => validateQuestions(questions.map((q, i) => i === 0 ? {...q, difficulty: 'Hard'} : q)));
  assert.throws(() => validateQuestions(questions.filter(q => q.difficulty === 'سهل')), /10 أسئلة/);
});
