# Pocket Pilot

Watch and steer VS Code chat agents from your phone while you are away from the desk.

Pocket Pilot runs a small server inside VS Code and serves a web app to phones through a
Cloudflare tunnel. From the phone you can:

- see every chat in every open VS Code window, grouped by repository
- follow a running request as it streams, including tool calls and file edits
- send a message, queue one behind the running request, or steer it
- stop a request, and allow or skip a tool that waits for confirmation
- answer the questions an agent asks, and reply to its confirmations and approval requests
- choose how much the agent may do without asking: default approvals, bypass approvals or
  autopilot
- switch agent and model, and change thinking effort or context size
- start a new chat in any open window
- pin chats to the top of the list and archive finished ones, in step with VS Code
- browse the open workspace folders and read files with syntax highlighting
- review uncommitted changes, and keep or undo the files a chat edited
- get a notification when an agent finishes, needs input or fails
- see open pull requests with check, review and merge status

The phone reaches the computer through a free Cloudflare quick tunnel, which needs no account, or
through your own Cloudflare tunnel for a permanent address.

## Requirements

- VS Code 1.136 or newer with GitHub Copilot Chat.
- Internet access on the computer and the phone.
- A Cloudflare account, only if you want a permanent address that installs as an app.
- A GitHub sign-in in VS Code, only if you want pull requests.

## Getting started

1. Run **Pocket Pilot: Start** from the command palette. The setting `pocketPilot.enabled` turns
   on for every window.
2. Run **Pocket Pilot: Pair Phone**. A panel shows a six-digit code that is valid for five minutes,
   and a QR code once the tunnel is ready.
3. On the phone, scan the QR code. It opens the app at the tunnel address.
4. The code is already filled in; tap **Pair**.

The first start downloads `cloudflared` from its GitHub release and checks it against a pinned
SHA-256 checksum. To use your own copy, set `pocketPilot.tunnel.cloudflaredPath`.

### Permanent address

A quick tunnel gets a new `trycloudflare.com` address every time the leader window starts, so
phones have to pair again, and the app cannot be installed. For a fixed address that installs as
an app:

1. In the Cloudflare Zero Trust dashboard, go to Networks → Tunnels and create a Cloudflared
   tunnel. Copy its token from the install command.
2. Add a public hostname to the tunnel, for example `agent.example.com`, with the service
   `http://127.0.0.1:48112`. That is `pocketPilot.port` plus one.
3. Run **Pocket Pilot: Set Up Cloudflare Tunnel** and enter the hostname and the token. Pasting
   the whole install command works too.
4. Pair the phone again and add the page to the home screen.

Paired phones stay signed in until you revoke them with **Pocket Pilot: Manage Paired Devices** or
they go unused for `pocketPilot.devices.expireDays` days.

If you want to sign in without a fresh code, run **Pocket Pilot: Set Password**. The phone then
offers a password tab next to the code tab.

## Commands

| Command                                | What it does                                          |
| -------------------------------------- | ----------------------------------------------------- |
| Pocket Pilot: Show Menu                | Quick pick with the commands below (status bar item). |
| Pocket Pilot: Start                    | Starts the server in every window.                    |
| Pocket Pilot: Stop                     | Stops it in every window.                             |
| Pocket Pilot: Restart                  | Restarts this window and re-runs leader election.     |
| Pocket Pilot: Pair Phone               | Shows the URL, QR code and pairing code.              |
| Pocket Pilot: Copy Phone URL           | Copies the tunnel address.                            |
| Pocket Pilot: Manage Paired Devices    | Revokes one device or all of them.                    |
| Pocket Pilot: Set Password             | Turns on password sign-in.                            |
| Pocket Pilot: Remove Password          | Turns it off again.                                   |
| Pocket Pilot: Set Up Cloudflare Tunnel | Stores a hostname and token for a permanent address.  |
| Pocket Pilot: Remove Cloudflare Tunnel | Goes back to a quick tunnel.                          |
| Pocket Pilot: Sign In to GitHub        | Signs in so pull requests can load.                   |
| Pocket Pilot: Show Log                 | Opens the output channel.                             |

## Settings

| Setting                                | Default | Meaning                                                  |
| -------------------------------------- | ------- | -------------------------------------------------------- |
| `pocketPilot.enabled`                  | `false` | Run Pocket Pilot in every window.                        |
| `pocketPilot.port`                     | `48111` | Loopback port between windows. The tunnel uses the next. |
| `pocketPilot.tunnel.cloudflaredPath`   | `""`    | Use this cloudflared binary instead of downloading one.  |
| `pocketPilot.devices.expireDays`       | `30`    | Forget devices unused this long. `0` keeps them.         |
| `pocketPilot.pullRequests.enabled`     | `true`  | Load open pull requests for the open repositories.       |
| `pocketPilot.pullRequests.pollSeconds` | `60`    | How often pull requests refresh while a phone is open.   |

Server settings are machine scoped, so they never sync to another computer. Every window must use
the same port.

## Multiple windows

Every VS Code window runs Pocket Pilot. One of them wins the port and becomes the leader; the
others connect to it over loopback and report their chats. When the leader window closes, another
window takes over within a few seconds and the phone reconnects on its own.

## Pinned and archived chats

The menu next to a chat, and the one in a chat's header, pins, archives or unarchives it. The
phone uses the same commands as the chat sessions view in VS Code, so both show the same state.

- Pinned chats come first. Archived chats are hidden behind **Archived** at the bottom of the list.
- A chat pinned or archived in VS Code shows up on the phone after about a minute, because
  VS Code saves that state to disk on a timer.
- When the chat has edits you have not kept or undone, VS Code asks what to do with them before
  it archives the chat. Answer that dialog on the computer.
- Chats in a window without a folder have no menu. VS Code keeps their state where extensions
  cannot read it.

## Answering the agent

When an agent stops to ask something, the chat on the phone shows it where it happened:

- **Questions** appear as a form with the agent's choices. Submit the answers, or skip them when
  the agent allows it.
- **Confirmations** such as "Continue to iterate?" show their buttons. Tapping one sends the same
  reply as the button in VS Code. The buttons in VS Code stay visible afterwards.
- **Approval requests** outside tool calls can be allowed from the phone. To decline one, stop the
  request or send a new message.

The approvals button under the message box sets the chat's approval level. Bypass approvals runs
every tool without asking, and autopilot also lets the agent answer its own questions. Both ask
for confirmation on the phone first. The phone changes the level through the `/autoApprove`,
`/autopilot` and `/disableAutoApprove` chat commands. When an organization policy turns off global
auto approval, VS Code removes those commands, so the change reaches the agent as a plain message
instead; leave the level alone on such machines.

## Browsing code

The **Code** tab lists the workspace folders of every open window.

- **Files** browses a folder. Files that Git ignores are dimmed, and changed files carry a letter
  such as `M` or `A`. Text files show with line numbers and Catppuccin syntax highlighting, and
  images show as pictures. Files over 2 MB are not sent to the phone, and highlighting stops above
  256 KB or 5,000 lines.
- **Changes** lists uncommitted changes against `HEAD`, with a diff for each file.
- A chat that edited files shows a **Changes** button next to its title, and every edit in the
  chat links to its diff. Keep or undo one file, or all of them. This works like the buttons in the
  VS Code chat view.

VS Code saves a chat's edit snapshot about once a minute. Until it does, a chat's diff compares
with the last commit, or shows the whole file when it is new, and says so above the diff.

The phone can only read files inside the open workspace folders. It follows symbolic links only
when they stay inside the folder. A chat's diff can also show a file outside the workspace when
the agent edited one.

## Notifications

Turn on **Notify this device** under **Settings** to get a push notification when an agent
finishes, needs your input or fails. Pick which of the three you want and use **Send test
notification** to check delivery. Tapping a notification opens that chat.

- On iPhone and iPad, notifications only work in the installed app, so they need a permanent
  address. Add the page to the home screen and turn them on from there.
- On other phones they also work in the browser. Behind a quick tunnel the address changes when
  the leader window restarts, and tapping an older notification opens the old address.
- A phone that has the app open in the foreground gets no notification; it already shows the chat.
- A finished notification waits three seconds, so a request that is followed right away by the
  next one does not ping the phone.
- Notifications go out from the leader window. Changes that happen while another window takes over
  are not sent.

## Security

- Pocket Pilot listens only on loopback. Phones reach it through the tunnel, so anyone on the
  internet who finds the address can reach the sign-in page. They still need a pairing code or the
  password.
- Cloudflare terminates TLS for tunnel traffic and can see it. Tunnel requests that arrive over
  plain HTTP are redirected to HTTPS, and the loopback channel between VS Code windows is refused
  through the tunnel. The tunnel token is kept in VS Code secret storage.
- All tunnel traffic reaches Pocket Pilot from the same local address, so sign-in rate limits are
  shared by everyone who uses the tunnel.
- Pairing codes are single use, expire after five minutes and lock after repeated wrong guesses.
  Sign-in routes are rate limited.
- Devices get a random token in a `Secure`, `HttpOnly`, `SameSite=Strict` cookie. Only a SHA-256
  hash of the token is stored.
- The optional password is stored as a scrypt hash in VS Code secret storage, never in settings.
- Anyone who can pair a phone can run agents in your workspace. Treat a pairing code like a
  password.
- Push notifications carry the chat title and the window name. They are encrypted end to end
  between VS Code and the phone, and go only to the push services of Apple, Google, Mozilla and
  Microsoft.

## Development

The repository is an npm workspace with three packages:

- `packages/protocol`: zod schemas shared by the extension and the web app.
- `packages/extension`: the VS Code extension, bundled with esbuild.
- `packages/web`: the Svelte 5 web app, built with Vite, Tailwind, daisyUI and Catppuccin.

```sh
npm install
npm run validate          # format check, lint, type check, unit tests
npm run test:e2e          # Playwright against a mock hub
npm run package           # builds everything and writes a .vsix
```

`npm run dev -w @pocket-pilot/web` together with `npm run mock -w @pocket-pilot/web` runs the web
app against the mock hub without VS Code. To try the real extension, run `npm run build` and then
`code --extensionDevelopmentPath=$PWD/packages/extension`.

## License

[MIT](LICENSE)
