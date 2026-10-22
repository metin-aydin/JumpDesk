<p align="center">
  <img src="build/icons/256x256.png" width="112" alt="JumpDesk logo">
</p>

<h1 align="center">JumpDesk</h1>

<p align="center">
  An <strong>AI-powered</strong>, cross-platform desktop client for
  <a href="https://github.com/jumpserver/jumpserver">JumpServer</a>.
</p>

<p align="center">
  <a href="https://github.com/metin-aydin/JumpDesk/actions/workflows/ci.yml"><img src="https://github.com/metin-aydin/JumpDesk/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

JumpDesk turns your JumpServer assets into an AI-assisted desktop workspace: browse the server tree, open SSH, SFTP
and RDP sessions in tabs and split views, run snippets and follow logs with highlights and alarms. Its built-in
**AI assistant** turns plain language into shell commands, explains errors you select in the terminal and the alarms it
catches, and writes snippets and alarm rules for you, with the provider of your choice, including local models.
It works with JumpServer v4 (Community edition) on Linux, Windows and macOS.

> JumpDesk is an independent project and is not affiliated with the JumpServer team.

![Four SSH sessions in a grid with log highlights and the snippets panel](docs/screenshots/split-view.png)

## AI assistant

JumpDesk brings AI into the terminal workflow without taking control away from you: every suggestion is written to
the command line or into a form, and nothing runs until you press Enter or save.

![An exception selected in the terminal, explained by the AI with commands to investigate](docs/screenshots/ai-explain.png)

- **Explain what you select.** Select an error, a stack trace or a log excerpt in any terminal and press **Explain**.
  The AI tells you what it means and what to check, and suggests commands to investigate that you can write to the
  command line with one click.
- **Explain alarms.** Ask the AI about any alarm in the Alarms panel; the alarm line is sent with the lines printed just
  before it, so the answer has context.
- **Commands from plain language.** Press Ctrl+Space twice in the terminal, describe what you need ("which log files
  take the most space?") and pick one of the suggested commands. Follow-up questions keep the conversation's context.
- **AI-written snippets.** Describe a snippet in the snippet editor and get a name and a command; have any command
  explained before you save it.
- **AI-written alarm and highlight rules.** Describe what to catch, optionally paste a sample line, and get words or
  regular expressions that are tested against your sample on the spot.
- **Your provider, your models.** Anthropic (Claude), OpenAI, Google Gemini, Azure OpenAI or any OpenAI-compatible
  server such as Ollama, LM Studio or vLLM for fully local models. The model list is loaded from the provider with
  your key.
- **Safety built in.** Suggested commands are checked by local rules and flagged as *Caution* or *Dangerous*;
  dangerous commands need an extra confirmation before they are even written to the prompt. Prompts treat terminal
  text as untrusted data, so instructions hidden in output are not followed.

| | |
| --- | --- |
| ![Selecting an error in the terminal shows the Explain button](docs/screenshots/ai-explain-selection.png) | ![The alarm line and the lines before it shown before sending](docs/screenshots/ai-alarm.png) |
| **Explain** appears next to any text you select in the terminal. | **Ask AI about an alarm**: you see exactly what will be sent and confirm it. |
| ![AI suggestions in the terminal](docs/screenshots/ai-assist.png) | ![AI-written snippet in the snippet editor](docs/screenshots/ai-snippet.png) |
| **Ask AI** with Ctrl+Space twice; pick a command, it is written to the prompt and runs only on Enter. | **Snippets from a description**: the AI suggests a name and a command, you decide what to save. |
| ![AI-suggested alarm rules tested against a sample line](docs/screenshots/ai-rule.png) | ![AI settings with feature switches and the provider](docs/screenshots/settings-ai.png) |
| **Rules from a description**, each tested against your sample line. | **AI settings**: turn each AI feature on or off and pick the provider and model. |

**Privacy.** AI features are optional and each one has its own switch in **Settings → AI**. JumpDesk never sends server
data on its own: for commands, snippets and rules only what you type and the server type (for example Linux) are sent.
Terminal text is sent only when you ask for an explanation, and only after JumpDesk has shown you the exact text and
you have pressed **Send**. API keys are encrypted with the operating system keyring, never shown again and never
included in exports.

## Features

- **Sign in with your JumpServer's own login page** (LDAP, MFA and SSO work as usual). Sessions use the same
  HTTPS connection as the web UI, so no extra ports need to be open.
- **Server tree and search** with tags, favorites, hover cards and multi-select connect.
- **Terminal (SSH/Telnet)** built on xterm.js: split views (side by side, stacked, grid), broadcast input, tabs that
  can be dragged into separate windows and back, terminal search, keyword highlights and alarm rules with desktop
  notifications.
- **Shell integration**: command and file autocomplete, command history, colored command line, local IP detection.
- **Snippets** that run on demand or automatically on connect, saved layouts grouped into folders (also in the left
  tree and the system tray) and a command palette.
- **File manager (SFTP)** with upload and download.
- **RDP** sessions through JumpServer's Guacamole gateway.
- **AI assistant (optional)**: commands from plain language, explanations of selected output and alarms, AI-written
  snippets and alarm/highlight rules; works with Anthropic, OpenAI, Google Gemini, Azure OpenAI and local
  OpenAI-compatible servers. See [AI assistant](#ai-assistant).
- **Server status strip (optional)**: CPU, memory, disk and load of Linux servers in a strip below the header, with
  a details card; measured by a small background loop in the session, nothing is installed on the server.
- **Encrypted export/import** of snippets, rules, highlights, layouts and settings (`.jumpdesk` files).
- **In-app updates** from GitHub Releases for the AppImage, .deb, Windows installer and macOS builds; the portable
  Windows build links to the new version's download page.
- English and Turkish interface, light and dark themes, per-user local settings.

## Screenshots

| | |
| --- | --- |
| ![Server address screen](docs/screenshots/sign-in.png) | ![Server tree with a hover card and the home view](docs/screenshots/servers.png) |
| **Sign in** to any JumpServer: enter its address, then use its own login page (LDAP, MFA and SSO work as usual). | **Server tree** with folders, favorites, recent connections and hover cards. |
| ![Command autocomplete in the terminal](docs/screenshots/autocomplete.png) | ![Alarms panel listing caught exceptions](docs/screenshots/alarms.png) |
| **Autocomplete** from history, snippets and remote files, previewed inline as you move through the list. | **Alarm rules** catch words or regular expressions in any session and notify you. |
| ![File manager panel](docs/screenshots/files.png) | ![Highlights panel with colored log levels](docs/screenshots/highlights.png) |
| **File manager (SFTP)** for the active session: browse, upload, download. | **Highlights** color words or regular expressions in terminal output, such as log levels. |
| ![Command palette](docs/screenshots/command-palette.png) | ![Export dialog](docs/screenshots/export.png) |
| **Command palette** (Ctrl+Shift+P) for every action, tab, layout and snippet. | **Encrypted export/import** of snippets, rules, highlights, layouts and settings. |

Screenshots are generated against the bundled mock server with `npm run build && npm run screenshots`.

## Download

Get the latest version from the [Releases](https://github.com/metin-aydin/JumpDesk/releases/latest) page:

| Platform | File | Updates |
| --- | --- | --- |
| Linux | `JumpDesk-<version>.AppImage` (make it executable and run it) | In the app |
| Debian, Ubuntu | `jumpdesk_<version>_amd64.deb` | In the app (asks for your password) |
| Windows | `JumpDesk-<version>-Setup.exe` | In the app |
| Windows, no install | `JumpDesk-<version>-Portable.exe` | Download page |
| macOS (Apple Silicon) | `JumpDesk-<version>-mac-arm64.dmg` | In the app |
| macOS (Intel) | `JumpDesk-<version>-mac-x64.dmg` | In the app |

JumpDesk looks for a new version shortly after startup and every six hours. When it finds one it shows a
notification; **Settings → Updates** downloads it, installs it and restarts the app. Nothing is downloaded or installed
without asking, and automatic checks can be turned off there.

## Development

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/metin-aydin/JumpDesk.git
cd JumpDesk
npm install
npm run mock       # mock JumpServer on http://127.0.0.1:18080 (any username, password: demo)
npm run dev:mock   # app against the mock server
npm run dev        # app; enter your JumpServer address on the start screen
```

Checks:

```bash
npm run typecheck
node dev/i18n-check.mjs          # every UI string has an English translation
node dev/alarm-detector.test.mjs # unit tests (also ai-safety, ai-providers)
npm run build && node dev/e2e/smoke.mjs   # end-to-end tests run against the mock server
```

On Linux the app runs under XWayland (`--ozone-platform=x11`) so tabs can be dragged between windows; set
`JUMPDESK_WAYLAND=1` to use Wayland. Terminals are drawn with WebGL; set `JUMPDESK_DISABLE_WEBGL=1` to use the DOM
renderer instead (for GPU problems).

## Branches and releases

- `main` only changes through pull requests. Work happens on a `development` branch created from `main`; the pull
  request that merges it into `main` publishes a release, and the branch is then deleted.
- Each merge into `main` publishes a release. The
  [Release workflow](.github/workflows/release.yml) picks the version, builds the Linux, Windows and macOS packages and
  attaches them to a new GitHub release, which the in-app updater then offers to users.
- The description of that pull request becomes the release notes (see the
  [pull request template](.github/pull_request_template.md)); if it is empty, the commit titles since the previous
  release are listed.
- Each release raises the patch number (0.2.0 → 0.2.1 → …). For a new minor or major version, set `version` in
  `package.json` on `development` (for example `0.3.0`); the next release uses it.

## Packaging

```bash
npm run build && npx electron-builder --linux       # AppImage + deb
npx electron-builder --win portable --x64            # Windows portable
npx electron-builder --mac                           # macOS dmg + zip (Apple Silicon and Intel; on macOS only)
```

Release builds of the macOS app are signed with a Developer ID certificate and notarized by Apple. The Release
workflow reads these repository secrets: `CSC_LINK` (the base64-encoded `.p12` certificate), `CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. Without them, local macOS builds are left unsigned.

## Issues and contributions

Bug reports and feature requests are welcome on [GitHub Issues](https://github.com/metin-aydin/JumpDesk/issues).
Pull requests go to the `main` branch.
User-facing text is written in Turkish in the source and translated through `src/renderer/src/i18n/en/`; run
`node dev/i18n-check.mjs` before opening a pull request.

## License

[MIT](LICENSE). `swagger.json` is JumpServer's API description (GPLv3), kept for reference.
