# MindVault

MindVault is a voluntary lockdown for the account that starts it. You pick a length from 1 minute to 8 hours, and the app closes the distractions you chose while a study desk and offline brain games stay open.

It locks only that account. Task Manager, Settings, a terminal, Safe Mode, and uninstall keep working. The recovery key from setup always ends a session. Another administrator can uninstall, and uninstall removes the rules.

## Lock levels

| Level | What it does | How it ends early |
| --- | --- | --- |
| Light | Closes AI apps and CLIs. The browser stays open, and API calls still go through until the app is closed. | Your PIN |
| Standard | Light, plus it closes browsers and blocks AI sites and their APIs: Copilot, GitHub Copilot, ChatGPT, Claude, Gemini's website, Cursor, and the other assistants. | A finished game or quiz, or the recovery key |
| Full | Standard, plus Steam, YouTube, Netflix, TikTok, Reddit, and any extra sites or programs you add in Settings. | A finished game or quiz, or the recovery key |

Standard and Full ask the operating system for administrator permission, because they add firewall rules. Denying that window cancels the start and leaves the computer unchanged. Light only closes your own apps. On Linux that does not ask for a password. On Windows every session still asks, because adding and removing firewall rules needs an administrator. On macOS, Light asks when it blocks a discovered app.

The site block is a list of chat and completion hosts, resolved to addresses when the session starts. The address saved for the tutor is left out, including any address it shares with a blocked site, so the quiz can still run. Bing Search, Office, and github.com stay open. Windows Copilot (`copilotapp.exe` and the older app names) is closed on every level.

Rules are named `MindVault_`. Closing MindVault removes them. Opening it again continues the session until the timer ends. The app checks running programs about every 2 seconds.

Puzzle sites on the study list (chess, sudoku, and the others below) still open inside MindVault's own window during Standard and Full. The normal browser stays closed. Before a session you can also allow local notes in that window: PDF, pictures, or text. The choice freezes when the session starts. Web pages and other file types stay off that list.

## What a session keeps available

- The study desk, which opens only `https` pages on the allowlist frozen at the start. A site on the denylist cannot be added.
- The tutor, which runs five jobs: quiz, summarize-then-quiz, flashcards, grade, and explain-back. There is no chat box. A request that includes a freeform prompt is rejected.
- Six offline games at easy, medium, and hard: Sudoku, mental math, sequence memory, N-back, word scramble, and picture cube.
- A daily challenge. The puzzle is chosen from the date, so the same day produces the same game.
- Pomodoro focus and break timers inside an open session (25 and 5 minutes by default).
- Stats for streak, focus minutes, and solves. Those live in this browser profile (`localStorage`), along with difficulty, Pomodoro, and whether onboarding has been seen.

Default study sites: Wikipedia, Khan Academy, Coursera, edX, arXiv, Google Scholar, Brilliant, Project Euler, and LeetCode.

Default puzzle sites: Lichess, Chess.com, Sudoku.com, 2048, Puzzle Baron, and Jigsaw Planet.

You can edit that list in Settings. The list in effect when you press Start is the one the session uses.

Full can also take an extra entertainment list: sites and program names, one per line, saved with the PIN. It sits on top of YouTube, Netflix, Steam, and the built-in list. Task Manager, Settings, and terminals cannot be added. A site that is already on the study list has to be removed there first. The extra list is frozen while a session is running.

## Tutor

Settings has a tutor dropdown. A new install uses Kilo Auto, which needs no account and no API key. DevToolBox is the other free choice. The page you study is sent to whichever of those you pick. The list also includes Ollama, LM Studio, and llama.cpp on this computer. Those keep your notes local and need no key. LM Studio has to have its local server started and a model loaded. "I have an API key" is for a provider address of your own. That key is stored in the system keychain (Windows Credential Manager on Windows).

Plain `http` is allowed only for `localhost`, `127.0.0.1`, and `::1`. A saved cloud key is not sent to the free online tutor.

If the tutor is Gemini, save `https://generativelanguage.googleapis.com/v1beta/openai` with your own key. That API stays open for the session. The Gemini website, `gemini.google.com`, stays blocked. The same rule applies to any saved provider: its host stays open, and the other AI APIs stay blocked.

The local server you saved is the one left running. `ollama run` is closed either way. If the tutor is Ollama, LM Studio is closed, and the reverse is true when the tutor is LM Studio. The free online tutor and a cloud key close both.

The tutor can also classify a program you want blocked next time. Protected system programs are refused. Accepting a suggestion adds it to the next session, not the one already running.

## Schedules

Settings can store up to 12 schedules. Each one has days (Monday is 0 through Sunday is 6), a start time `HH:MM`, a length, and a level. A window may cross midnight, and each window fires once.

Schedules run only while MindVault is open. The PIN is checked when you save them, not when they fire. They stay frozen during a session, and they do not fire until setup is finished (a PIN and an acknowledged recovery key).

## How the lock is applied

| System | Site block | Program block | Permission |
| --- | --- | --- | --- |
| Windows | Outbound firewall rules named `MindVault_` | Firewall rules for discovered `.exe` files, plus the process check | The Windows administrator consent window |
| Linux | An nftables table `inet mindvault` that drops traffic only to those site addresses. The rest of the firewall is left alone. `nft` must be installed. | The process check. nftables is not used to match each executable. | `pkexec`, or `sudo` if that is unavailable. Light with no site list does not ask. |
| macOS | A pf anchor named `mindvault`. The firewall is not disabled, and traffic is not blocked as a whole. | The Application Firewall for discovered app paths, plus the process check | The macOS administrator dialog |

The tutor's API address is left out of the site block, so the session can still call it. If that host shares an address with a blocked site, the shared address stays open too. Loopback addresses are never placed in the drop rules.

## Run it

Install [Node.js](https://nodejs.org/) 22, the [Rust](https://rustup.rs/) stable toolchain, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your system (WebView2 on Windows, WebKitGTK 4.1 on Linux).

```bash
npm install
npm run tauri dev
```

`npm run dev` opens a browser preview at `http://localhost:1420`. That window does not change the computer. Firewall rules, process closing, and the keychain run only in the desktop app.

A production build:

```bash
npm run tauri build
```

Windows installers include an NSIS setup (`.exe`) and an MSI. The NSIS uninstaller runs `MindVault.exe --uninstall-cleanup` before it removes the app. Linux builds a `.deb` and an AppImage. macOS builds are ad-hoc signed and Gatekeeper still asks you to confirm them.

## Releases

`.github/workflows/release.yml` builds Windows, Linux, and both macOS architectures. A normal push does not build. The workflow runs when you start it by hand, push a `v*` tag, or push a commit whose message contains `release:update`.

## Data

Session state, the PIN hash, the recovery-key hash, schedules, and the site list are stored in `mindvault.db` under `%APPDATA%\MindVault` on Windows, or `~/MindVault` on Linux and macOS. The API key is in the system keychain, separate from that file. Stats and preferences stay in `localStorage`.

## Tests

```bash
npm test
cargo test --offline --manifest-path src-tauri/Cargo.toml
```

The Rust tests use an in-memory stand-in. They do not change the real firewall or the keychain.

## License

GNU General Public License v3. See [LICENSE](LICENSE).
