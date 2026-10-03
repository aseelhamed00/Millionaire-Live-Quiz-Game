# Millionaire Live — complete beginner guide

A complete local quiz show: four choices, final-answer lock, reveal effects, eight original audio cues, a prize ladder, three once-per-game lifelines, a host desk, a projector screen, and real audience voting through a QR code.

**Start here:** this guide explains every setup step. `COMPLETE_GUIDE.html` is the illustrated, offline-readable version, with the complete source of every hand-written code file. Open that file in your browser to read it; run the actual game through Node.js, not by double-clicking the game HTML files.

## What you are building

Your laptop runs one Node.js process. Express serves the pages and files. Socket.IO carries votes, host commands, state updates, and audio events between browsers and the laptop. The `qrcode` package generates a PNG QR code locally. HTML, CSS, and plain JavaScript build the screens: no frontend framework, database, cloud account, or paid service is required.

The implementation follows the official [Socket.IO Express initialization guide](https://socket.io/docs/v4/server-initialization/) and [event acknowledgements documentation](https://socket.io/docs/v4/emitting-events/). QR generation uses [node-qrcode](https://github.com/soldair/node-qrcode).

| Screen | Laptop URL | Purpose |
| --- | --- | --- |
| Host | http://localhost:3000/host.html | Authenticate with the terminal's host code; control the game |
| Projector | http://localhost:3000/ | Public game screen; enable sound here |
| Audience | http://YOUR-LAPTOP-IP:3000/vote.html | Phones vote here; QR opens this page |

The contestant tells the host their chosen answer, and the host clicks that answer. You can also let a player use the authenticated host screen. The projector itself is intentionally read-only.

## Game rules and practical limits

- The first click on a host answer locks it in orange. It does not reveal correctness. **Reveal answer** then shows green for correct or red for wrong, labels the result, and plays the corresponding cues.
- A correct answer unlocks **Next question**. A wrong answer ends the game. The final correct answer wins the highest prize in your question list.
- Every fifth completed question is a safety milestone. Losing before question 5 pays $0; losing after completing question 5 pays its prize; after completing question 10 pays its prize. There is no walk-away button.
- Each lifeline can be used once per game, not once per question. Restart restores all three.
- 50:50 removes two randomly selected wrong choices. Stop audience voting before using it. Removed choices remain visible but crossed out and disabled on phones.
- Phone a Friend is explicitly simulated: it recommends the correct answer with 80% probability; otherwise it recommends an available wrong answer. It is not a real phone call.
- Ask the Audience starts a real voting round and displays the QR code. Stop/resume preserves votes. Reset deletes votes, creates a new round, and leaves voting closed until you click Start voting. Reset does not restore the lifeline.
- Locking an answer automatically stops voting. Moving to the next question clears its old poll; it does not make Ask the Audience usable again.
- Percentages are whole numbers, using largest-remainder rounding so they sum to 100 when votes exist. With no votes all four are 0%.
- Duplicate voting is prevented **per browser cookie, per round**, on the server. Refresh, reconnect, and multiple tabs in the same browser do not give additional votes. Clearing cookies, private browsing, another browser, or another device can give another identity. This is not verified one-human-one-vote. Strict enforcement needs individually issued tickets or accounts, outside this simple version.
- This is a trusted local-event app. The random host code protects controls, and the answer key stays on the server until reveal. Plain HTTP on Wi-Fi is not suitable for hostile networks or public Internet hosting.
- Game state and votes live in memory. Browser refresh preserves the running game; stopping/restarting Node.js loses the game and votes and changes the automatically generated host code. Reload phone pages after a server-process restart. There is no crash recovery or multiple simultaneous game rooms.
- All fonts, scripts, QR generation, and sound files work locally after npm installation. Internet is needed to install tools/packages, but ordinary event operation only needs working Wi-Fi between devices.

## Step 1 — Install the programs

1. Install the current **LTS** version from [nodejs.org](https://nodejs.org/en/download). This project requires Node.js 22 or newer. npm comes with Node.js. Use the normal Windows installer and keep its PATH option enabled.
2. Install [Visual Studio Code](https://code.visualstudio.com/).
3. Use a modern Chrome, Edge, Firefox, or Safari browser. Audience phones do not need Node.js or an app.
4. Open a new terminal after installing Node.js. In VS Code use **Terminal → New Terminal**. On Windows, choose **Command Prompt** from the terminal dropdown for the commands in this guide.

Run these two separate commands:

```bat
node --version
npm --version
```

Both should print version numbers. You do not need Docker, Git, a database, XAMPP, or a VS Code Live Server extension.

## Step 2 — Create or extract the project folder

**Fastest route:** extract `millionaire-live.zip`. It already contains the `millionaire` folder and all source files, sounds, questions, and guides. Work inside that folder; skip `npm init` because package.json already exists.

**Learn-from-zero route:** open Command Prompt in your chosen parent folder and run:

```bat
mkdir millionaire
cd millionaire
mkdir public
mkdir public\sounds
mkdir test
```

The complete source appendix in `COMPLETE_GUIDE.html` provides every file's name, location, purpose, and entire code. The empty-folder route reconstructs exactly the same app.

## Step 3 — Open it in VS Code

From the `millionaire` folder:

```bat
code .
```

If `code` is not recognized, open VS Code normally, select **File → Open Folder**, and choose `millionaire`. Open its terminal. Run `dir` on Windows and confirm you are in the intended folder. After creating the files, `package.json` and `server.js` must appear here, not in `public`.

## Step 4 — Initialize Node.js

For the empty-folder route only:

```bat
npm init -y
```

This generates a starter package.json. Replace its entire contents with the `package.json` in the complete source appendix. The supplied file defines the start, test, and sound-generation commands and all required packages. For the extracted project, simply keep its supplied package.json and package-lock.json.

## Step 5 — Install packages

With the supplied package.json saved, run:

```bat
npm install
```

This installs Express (HTTP pages), Socket.IO (live communication), qrcode (QR image generation), and socket.io-client (automated test clients). It creates `node_modules`; do not paste code into that folder. The included package-lock.json records the dependency versions tested with this download. For a clean repeat installation from the archive, `npm ci` is an alternative to `npm install`.

For reference, the equivalent explicit installation commands when building a fresh project are:

```bat
npm install express@^5.1.0 socket.io@^4.8.1 qrcode@^1.5.4
npm install --save-dev socket.io-client@^4.8.1
```

You do not need to run both installation methods. Keep the supplied scripts in package.json.

## Step 6 — Create the files in the correct places

Use VS Code's Explorer → New File/New Folder. Paths below are relative to the main `millionaire` folder. Never save `server.js` inside `public`: only public files are served to browsers.

| File to create | Purpose |
| --- | --- |
| package.json | Packages, Node version, terminal commands |
| questions.json | Private question bank, answers, difficulty, prizes |
| server.js | Authoritative game state, authentication, vote validation, QR, networking |
| generate-sounds.js | Creates eight original WAV sound files |
| public/index.html | Projector page structure |
| public/host.html | Host login and controls |
| public/vote.html | Audience phone page |
| public/style.css | Responsive navy/gold design and answer effects |
| public/shared.js | Shared formatting, percentage bars, audio, fullscreen |
| public/game.js | Projector rendering and host actions |
| public/vote.js | Phone connection, vote submission, duplicate-vote UI |
| test/game.test.js | Automated server and real-time integration tests |
| .gitignore | Keeps node_modules and optional .env out of Git |

## Step 7 — Paste the complete code progressively

In the complete source appendix, each file has its exact name, relative location, purpose, and complete source. Copy the entire code block into that file and save with Ctrl+S. There are no omitted sections or TODO implementations.

A useful reading/build order is:

1. `package.json`, `questions.json`, and `generate-sounds.js`: dependencies, data, audio assets.
2. `server.js`: follow `reset`, `publicState`, the vote handler, then host commands.
3. The three HTML files: see which elements each screen contains.
4. `style.css` and `shared.js`: appearance, bars, sound playback.
5. `game.js` and `vote.js`: connect buttons and sockets to those elements.
6. `test/game.test.js`: exercise the complete system.

JSON uses double quotes, does not allow comments, and cannot have a trailing comma. JavaScript and CSS may contain comments. File extensions must be real: enable File Explorer → View → Show → File name extensions if necessary to avoid `server.js.txt`.

## Step 8 — Add the sounds

The archive already includes these files inside `public/sounds`:

```text
question.wav
lock.wav
correct.wav
wrong.wav
lifeline.wav
next.wav
win.wav
lose.wav
```

If reconstructing manually, or to regenerate them, run:

```bat
npm run sounds
```

This writes complete WAV files; no manual download or recording is required. The sounds are original short synthesized cues, not recordings from the TV show. You can replace a WAV with your own licensed WAV using the same filename. Reload the projector afterwards because it caches decoded sounds in memory. Running `npm run sounds` again overwrites your replacements.

Audio must be enabled with a click on the actual projector page. Browsers restrict automatic audio before interaction. **Enable sound** loads all cues, unlocks playback, and plays a short test cue. Use only one audible page to avoid echo. The sound desk sends cues to all enabled host/projector pages, but never to audience phones.

## Step 9 — Run the server

From the main project folder:

```bat
npm test
npm start
```

You should see host and projector URLs, a random **Host code**, and candidate local IP addresses. Leave the terminal open. Ctrl+C stops the server. If automatic IP detection is unavailable, the game still runs; find your IP manually in Step 13.

Optional: to choose a reusable host code, use a long private value. These are Command Prompt commands; replace the example:

```bat
set HOST_PIN=replace-with-a-long-private-code
npm start
```

For PowerShell the equivalent is:

```powershell
$env:HOST_PIN="replace-with-a-long-private-code"
npm start
```

Do not show the terminal or host code on the projector. A `.env` file is not loaded automatically by this project.

## Step 10 — Open the host and game

On the laptop open:

```text
http://localhost:3000/host.html
http://localhost:3000/
```

Log into the host page with the code printed in the terminal. Open the projector page in a separate window. Click **Enable sound** on the projector and **Full screen** (or F11). Keep host audio muted. Click **Start game** on the host. The first question appears on both screens.

Click an answer on the host to lock it. Pause for suspense. Click **Reveal answer**. If correct, click **Next question**; if wrong, the game ends and you can use **Restart game** for another contestant.

## Step 11 — Open a voting page locally first

For a quick laptop-only check, open:

```text
http://localhost:3000/vote.html
```

Before Ask the Audience is activated, choices are disabled and the page waits. On the host click **Ask the Audience**. Now choose one answer on the voting page. The host and projector receive the count immediately. A second vote from the same browser is blocked.

This localhost test proves the app works on the laptop. It does not prove phones can reach it. Complete the next two steps for that.

## Step 12 — Configure and use the QR code

Suppose your laptop's actual Wi-Fi IPv4 address is `192.168.1.25`. This is only an example; use your own value.

In the host's **Audience address** input enter:

```text
http://192.168.1.25:3000
```

Click **Update QR address**. The resulting QR contains exactly:

```text
http://192.168.1.25:3000/vote.html
```

The server generates the QR PNG; the host and projector show it when Ask the Audience is active. A text link appears below it as a fallback. No external QR website is used. The QR opens the live voting page, not a snapshot of a particular question. That page receives the current question and voting-round ID from the server.

Scan with the phone's camera and open the link in the phone's normal browser. Keep this page open for the round. The host can hide projector results with **Hide projector results** while still seeing their own bars. This also hides detailed percentages on phones. Vote totals remain visible.

## Step 13 — Connect audience phones over the same Wi-Fi

### localhost versus your laptop's IP

`localhost` means **the device on which the browser is running**. On your laptop it refers to the laptop. On an audience phone it refers to that phone, so a QR containing localhost cannot work for the audience. `0.0.0.0` is the server's listen address, not an address to put in the QR. `127.0.0.1` also means the current device.

A LAN address such as `192.168.1.25` identifies your laptop on the local network. The server listens on all interfaces so other devices can reach it. Port `3000` identifies this app.

### Find the Wi-Fi IPv4 address on Windows

1. Connect the laptop to the event's trusted Wi-Fi.
2. Press Windows+R, type `cmd`, press Enter.
3. Run:

```bat
ipconfig
```

4. Find **Wireless LAN adapter Wi-Fi**, then **IPv4 Address**. Use that address, not Default Gateway, IPv6, VPN, Bluetooth, WSL, or a virtual adapter.
5. Alternatively, use Settings → Network & internet → Wi-Fi → your connected network's properties and find IPv4 address. Microsoft's [network settings guide](https://support.microsoft.com/en-us/windows/experience/connectivity-networking/essential-network-settings-and-tasks-in-windows) describes this.
6. Put `http://THAT-IP:3000` in the host's Audience address and click Update QR address.
7. Connect all phones to the same Wi-Fi. On one phone manually type `http://THAT-IP:3000/vote.html` before relying on scanning.
8. Once manual access works, scan the QR from the actual projector position.

All phones talk directly to the Node.js process on the laptop. They do not need their own server, installation, login, or Socket.IO configuration. The voting page loads the Socket.IO client from the laptop itself.

### Windows Firewall

If Windows asks whether Node.js may communicate, allow it for the **Private** trusted event network. If you previously denied it, open Windows Security → Firewall & network protection → Allow an app through firewall → Change settings. Allow the Node.js JavaScript Runtime on Private networks; its executable is often `C:\Program Files\nodejs\node.exe`. Administrative permission may be needed. Keep the firewall enabled. Microsoft documents [app exceptions and network profiles here](https://support.microsoft.com/en-us/windows/security/windows-security/firewall-and-network-protection-in-the-windows-security-app).

If an app exception is unavailable, an event administrator can create a narrow inbound TCP rule for port 3000 on the Private profile and Local Subnet. Do not change university-managed firewall policy without its administrator. Only classify a network as Private when it is one you trust.

### Connection troubleshooting, in order

1. Does `http://localhost:3000/` work on the laptop? If not, start the server and check its terminal error.
2. Does `http://YOUR-IP:3000/vote.html` work on the laptop? Check the correct IP and port.
3. Does the exact same URL work when typed manually on a phone? Check Wi-Fi, firewall, and network isolation before blaming the QR.
4. Type **http://**, not https://. This local server does not configure TLS.
5. Check the phone stayed on Wi-Fi. Some phones switch to mobile data when a Wi-Fi network has no Internet. Temporarily disable cellular data for this test.
6. Disconnect VPN software if permitted and appropriate; it can change routes or prevent LAN access.
7. Guest/campus Wi-Fi can isolate clients even on the same Wi-Fi name. Ask the network administrator for client-to-client connectivity, or use a tested private router/travel router or hotspot that permits communication between connected devices. Do not assume every hotspot permits it.
8. Check the laptop did not sleep, disconnect, change IP, or close its server terminal. IP addresses can change after reconnecting; update the QR address and scan again.
9. No router port forwarding is needed for devices on the same LAN. Do not expose this simple server to the public Internet.

Use one consistent IP-based voting URL during the event. Cookies are tied to the host name/IP: using multiple host aliases can produce separate browser identities.

## Step 14 — Test real-time voting

1. Start/restart the game and click Start game.
2. Configure the real LAN address and scan the QR after Ask the Audience.
3. Have at least two different phones join. Vote A on one and B on the other: the host should show 50%, 50%, 0%, 0%.
4. A third phone voting B produces 33%, 67%, 0%, 0%.
5. Refresh the first phone: it should still show its recorded A vote and disabled choices.
6. Open another tab in the same phone browser: it should recognize the existing vote. Opening a different browser tests a different identity, not a duplicate from the same browser.
7. Stop voting: new submissions are blocked. Start voting: existing voters remain blocked while new voters can vote.
8. Reset votes, then Start voting: all phones can submit once again and counts start at zero. Old delayed submissions cannot enter the new round.
9. Hide projector results: host bars remain; projector/phone percentages are hidden. Show them again.
10. Lock an answer: voting closes. Reveal and advance: the old poll panel disappears.

A venue rehearsal with the intended number of phones matters: automated tests cannot certify your router, Wi-Fi isolation, projector legibility, or speaker volume.

## Step 15 — Test the sounds and lifelines

Use the host sound desk to play each of question, lock, correct, wrong, lifeline, next, win, lose. Confirm the projector is audible, host audio is off, and the volume is comfortable. The outcome sequence is correct then win on the final question; wrong then lose on an incorrect answer. Cues play in sequence, not all on top of each other.

On question 1, B (Mars) is correct. Use it to test a correct reveal, then restart and choose A for a wrong reveal. Test 50:50 and verify B remains and exactly two wrong answers are crossed out. Use Phone a Friend once and check a recommendation appears. Each lifeline button then stays unavailable for the rest of the game.

To test a quick win without answering all 15 questions, back up questions.json, temporarily keep only question 1, restart Node.js, answer B and reveal. Restore the original file and restart Node.js afterwards. The automated tests already cover the full 15-question win.

## Step 16 — Run the complete game at an event

Use Windows+P → **Extend** so the projector shows only the public game window and your laptop shows the host desk. Drag the projector browser window to the second display and maximize/fullscreen it. With Duplicate mode, the audience can see whatever you do on your laptop, including the host desk.

Open the server well before the event, connect your speakers/projector, and enable sound on the projector browser. Plug in laptop power and temporarily prevent sleep. Rehearse with two real phones. Then restart the game using the host button, which restores lifelines and clears the rehearsal votes without changing the host login or audience URL.

During play: read the question; take the contestant's final answer; click it to lock; reveal; proceed after a correct answer. If the contestant requests a lifeline, activate it before locking. For audience voting, allow time to scan, announce the voting period, stop voting when ready, discuss the results, then lock the contestant's choice. Results update live; there is no automatic voting timer.

## Add, remove, or edit questions

Edit `questions.json` in the main folder. It is never served as a public static file. The array order is the play order. One complete question object looks like:

```json
{
  "text": "Which planet is known as the Red Planet?",
  "choices": ["Venus", "Mars", "Jupiter", "Mercury"],
  "correct": "B",
  "level": 1,
  "difficulty": "Easy",
  "prize": 100
}
```

`choices[0]` is A, `[1]` is B, `[2]` is C, `[3]` is D. Use exactly four nonempty strings and one correct letter. `level` must match its position starting at 1. `difficulty` is a display label. `prize` is a positive number without `$` or commas and must increase from one question to the next.

- **Edit:** replace text or choice strings; update the correct letter if you rearrange answers.
- **Add:** insert another complete object separated by a comma. Renumber levels and increase prizes. Any nonempty number of questions works.
- **Remove:** delete the whole object and its separating comma appropriately. Renumber remaining levels. The highest remaining question becomes the winning question.
- **Apply changes:** save, stop Node.js with Ctrl+C, run `npm start` again, reload all pages, and use the new host code. The host's Restart game button does not reload the JSON from disk.

The initial bank includes 15 questions from $100 to $1,000,000. Arabic question text can be placed in the same JSON strings and saved as UTF-8; the supplied interface labels are English. To change the currency display, edit the `money` function in `public/shared.js`.

## How the code works

The server owns the game. Browsers display a copy of its state and send requests; they cannot independently change the prize, correct answer, lifeline usage, or vote totals.

A host connects to the `/host` Socket.IO namespace with its code. Commands carry a revision number so repeated or outdated commands do not accidentally operate on a changed game. A phone first receives a server-signed, HttpOnly browser cookie, then connects and submits its selected letter with the current poll ID. The server checks the signature, open/closed state, round ID, choice, eliminated answers, and previous votes before accepting it. It broadcasts fresh state and acknowledges the vote. Reconnection fetches current state and recorded vote status.

Question answers are withheld from public state until Reveal. Hiding results removes detailed counts and percentages from the public socket, rather than only hiding a CSS element. The host still receives them. Phone a Friend necessarily exposes its simulated recommendation, and 50:50 necessarily narrows possible answers.

## Full testing checklist

| Test | Expected result |
| --- | --- |
| Host login with wrong code | Rejected; no game control |
| Host login with terminal code | Desk opens |
| Initial screen | Ready state; Start game enables first question |
| Correct selection | Orange locked state before revealing |
| Correct reveal | Green answer, Correct label, correct cue, next enabled |
| Wrong reveal | Wrong choice red, correct choice green, wrong/lose cues, game over |
| Sound toggle | Click enables test cue; mute stops output on that page |
| Manual sound desk | Every named cue plays on enabled screen |
| 50:50 | Exactly two wrong answers disabled; correct remains |
| 50:50 during voting | Unavailable until voting stops |
| Phone a Friend | Simulated recommendation appears, can be wrong |
| Lifeline reuse | Rejected for all three until game restart |
| QR scan | Opens laptop IP URL, not localhost |
| Multiple phones | Each browser contributes one vote; live total updates |
| Zero votes | 0%, 0%, 0%, 0% |
| 1 vote each for A/B/C | 34%, 33%, 33%, 0%; sums to 100 |
| 3 A / 12 B / 4 C / 1 D | 15%, 60%, 20%, 5% |
| Duplicate vote | Same identity rejected, count unchanged |
| Refresh/reconnect | Original vote recognized and controls remain disabled |
| Stop/resume voting | Counts retained; only previously unvoted identities can vote |
| Reset voting | Count zero, closed until reopened; each identity can vote again |
| Delayed old-round vote | Rejected |
| Hide results | Host sees bars, projector and phones do not |
| Lock while voting | Voting closes immediately |
| Next question | New question, cleared selection/friend/poll, lifelines stay used |
| Restart game | First ready screen, zero winnings/votes, restored lifelines |
| Last correct answer | Win state and win cue; no next button enabled |
| Wrong after safety milestone | Last completed milestone payout |
| Disconnected phone | Disconnection message; buttons disabled until reconnected |
| Mobile layout | No horizontal scrolling; four large touch targets |
| Projector visibility | Question, choices, and QR readable from audience seats |

Run the included automated suite with `npm test`. It checks 12 groups including authentication, state transitions, lifelines, 20 simultaneous connected voting clients, duplicate/reconnect protection, reset rounds, percentage calculation, QR responses, audio assets, final victory, and safety payouts. Physical Wi-Fi and audible output still require your local checklist.

## Common errors and fixes

| Error or symptom | Fix |
| --- | --- |
| `node` or `npm` not recognized | Install Node LTS, close and reopen terminal/VS Code, check PATH |
| `npm.ps1 cannot be loaded` | Switch VS Code terminal to Command Prompt, or use `npm.cmd install` / `npm.cmd start` in PowerShell |
| `ENOENT ... package.json` | Run commands inside the main millionaire folder |
| `Cannot find module express` | Run `npm install` in that folder |
| npm download fails | Connect to Internet for setup, check proxy/campus policy, then retry |
| `EADDRINUSE ... 3000` | Stop the previous server with Ctrl+C, or select another port as below |
| JSON syntax/invalid question error | Check double quotes, commas, exactly four choices, letter A-D, sequential levels, increasing numeric prizes |
| Screen opened as `file:///...` | Start Node and use http://localhost:3000; do not open public HTML directly |
| Live Server port 5500 does not vote | Use the Node server on port 3000; Live Server does not run this backend |
| Phone cannot connect | Follow Step 13: correct LAN IPv4, same Wi-Fi, private firewall exception, no client isolation |
| QR opens wrong address | Set actual LAN origin in Host → Audience address and click Update QR address |
| Wrong host code after restarting Node | Copy the newly printed code; a random code is regenerated each server start |
| Too many login attempts | Wait one minute, then enter the correct code |
| No sound | Click Enable sound on speaker/projector page; check OS/tab volume; regenerate missing WAVs and refresh |
| Sound from two windows | Mute the host page; enable only projector audio |
| Voting button disabled | Host must activate audience and open voting; you may already have voted, answer may be removed, or connection may be lost |
| After server restart phone asks for cookies/reload | Reload voting page to get a newly signed identity |
| Private/incognito browser can vote again | Expected limitation of browser-identity voting; see practical limits |
| Question changes not appearing | Restart Node; host Restart game does not reread questions.json |
| Votes disappear after Node stops | State is intentionally in memory; keep terminal running during the event |

To change the port in Windows Command Prompt:

```bat
set PORT=3001
npm start
```

In PowerShell:

```powershell
$env:PORT="3001"
npm start
```

Now open `http://localhost:3001/host.html` and `http://localhost:3001/`. Set the audience address to `http://YOUR-IP:3001` and adjust any port-specific firewall exception. The default QR origin remains localhost:3000 unless configured, so always set the correct audience address before voting. Optionally set `PUBLIC_URL` to the exact audience origin before starting, using the same environment-variable syntax.

## Final folder structure

```text
millionaire/
  package.json
  package-lock.json             generated dependency lock, included
  server.js
  questions.json
  generate-sounds.js
  .gitignore
  README.md                     this guide
  COMPLETE_GUIDE.html            guide plus every complete source file
  projector-preview.png          visual preview, if present
  public/
    index.html
    host.html
    vote.html
    style.css
    shared.js
    game.js
    vote.js
    sounds/
      question.wav
      lock.wav
      correct.wav
      wrong.wav
      lifeline.wav
      next.wav
      win.wav
      lose.wav
  test/
    game.test.js
  node_modules/                 created by npm install; not in ZIP
```

No `images` folder is required. The visual design is CSS and the QR is generated dynamically by `/api/qr`. Audio binaries are included and reproducible from generate-sounds.js. package-lock.json is included; npm generates it on the empty-folder route, so there is no need to type it manually.

## How to Run the Game on Event Day

- Connect laptop and audience phones to the tested Wi-Fi; plug in laptop power.
- In the millionaire folder run `npm start`; leave that terminal open.
- Open host.html, enter the terminal's host code, and set the current Wi-Fi IP and port.
- Use Extend display; put the public game window on the projector.
- Enable sound on the projector only; test volume and QR scanning with two phones.
- Restart the rehearsal game with the host button, then click Start game.
- Lock → Reveal → Next; use lifelines before locking.
- For audience help: Ask the Audience → allow votes → Stop voting → discuss results.
- Keep the laptop awake and the server running until the event finishes.
