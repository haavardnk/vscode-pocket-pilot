# Pocket Pilot

Control GitHub Copilot chat in VS Code from your phone.

Pocket Pilot runs a small server inside VS Code and serves a mobile web app through a Cloudflare
tunnel. It works with GitHub Copilot Chat in VS Code; other agents and editors are not supported.

## Features

- All Copilot chats across every open VS Code window, grouped by repository
- Live replies, thinking and tool calls as they stream
- Send, queue, steer and stop requests; approve tools and answer the agent's questions
- Edit, reorder and remove queued messages
- Switch agent, model, thinking effort and approval level
- Browse files, review diffs, and keep or undo the agent's edits
- View, type into, create and kill terminals, including the ones the agent runs
- Push notifications when an agent finishes, needs input or fails
- Open pull requests with check and review status

## Requirements

- VS Code 1.136 or newer with GitHub Copilot Chat
- A Cloudflare account, only for a permanent address

## Installation

Pocket Pilot is not on the Marketplace yet. Build the extension with Node.js 26 and install it:

```sh
npm install
npm run package
code --install-extension packages/extension/pocket-pilot-0.1.0.vsix
```

Reload every open VS Code window afterwards.

## Quick start

1. Run **Pocket Pilot: Start** from the command palette.
2. Run **Pocket Pilot: Pair Phone**. It shows a QR code and a six-digit code.
3. Scan the QR code with your phone and tap **Pair**.

By default the phone connects through a free Cloudflare quick tunnel, which needs no account.
`cloudflared` is downloaded on first start and verified against a pinned checksum. A quick tunnel
gets a new address every time VS Code restarts, so the phone has to pair again and the app cannot
be added to the home screen.

## Permanent address

Use your own Cloudflare tunnel for a fixed address that installs as an app:

1. In the Cloudflare Zero Trust dashboard, open **Networks → Tunnels** and create a Cloudflared
   tunnel. Copy the token from its install command.
2. Add a public hostname, for example `agent.example.com`, with the service
   `http://127.0.0.1:48112` (`pocketPilot.port` + 1).
3. Run **Pocket Pilot: Set Up Cloudflare Tunnel** and enter the hostname and token. Pasting the
   whole install command also works.
4. Pair the phone again and add the page to the home screen.

The token is kept in VS Code secret storage. **Pocket Pilot: Remove Cloudflare Tunnel** goes back
to a quick tunnel.

## Commands

All commands are also in the **Pilot** status bar menu.

| Command                                | Description                              |
| -------------------------------------- | ---------------------------------------- |
| Pocket Pilot: Start / Stop             | Start or stop the server in all windows. |
| Pocket Pilot: Pair Phone               | Show the QR code and pairing code.       |
| Pocket Pilot: Manage Paired Devices    | Revoke one or all devices.               |
| Pocket Pilot: Set Password             | Allow sign-in with a password.           |
| Pocket Pilot: Set Up Cloudflare Tunnel | Use a permanent address.                 |
| Pocket Pilot: Sign In to GitHub        | Load pull requests.                      |
| Pocket Pilot: Show Log                 | Open the output channel.                 |

## Settings

| Setting                                | Default | Meaning                                                  |
| -------------------------------------- | ------- | -------------------------------------------------------- |
| `pocketPilot.enabled`                  | `false` | Run Pocket Pilot in every window.                        |
| `pocketPilot.port`                     | `48111` | Loopback port between windows. The tunnel uses the next. |
| `pocketPilot.tunnel.cloudflaredPath`   | `""`    | Use this cloudflared binary instead of downloading one.  |
| `pocketPilot.devices.expireDays`       | `30`    | Forget devices unused this long. `0` keeps them.         |
| `pocketPilot.pullRequests.enabled`     | `true`  | Load open pull requests for the open repositories.       |
| `pocketPilot.pullRequests.pollSeconds` | `60`    | How often pull requests refresh while a phone is open.   |
| `pocketPilot.liveMirror`               | `full`  | `full`, `hooks` or `off`. See below.                     |

## How it works

- Every VS Code window runs Pocket Pilot. One window hosts the server and the others report to it.
  If that window closes, another takes over and the phone reconnects.
- Sending, stopping or approving from the phone opens that chat in an editor tab in VS Code,
  because VS Code only accepts input into a visible chat.
- For live updates Pocket Pilot installs a Copilot hook file, `~/.copilot/hooks/pocket-pilot.json`,
  and removes it when it stops. Streaming text is available for the chat focused in each window;
  other chats update at every tool call. Set `pocketPilot.liveMirror` to `hooks` to turn streaming
  off, or to `off` to update chats only when VS Code saves them, about once a minute.
- Terminal output relies on VS Code shell integration and covers commands started after Pocket
  Pilot started.
- On iPhone, push notifications only work in the installed app, which needs a permanent address.

## Security

Anyone with a paired phone can run agents and terminal commands on your machine. Treat a pairing
code like a password.

- The server listens on loopback only and is reachable from outside through the tunnel.
  Cloudflare terminates TLS and can see the traffic.
- Pairing codes are single use, expire after five minutes and are rate limited.
- Devices sign in with a `Secure`, `HttpOnly` cookie. Revoke them with **Manage Paired Devices**;
  unused devices expire after `pocketPilot.devices.expireDays` days.
- The password (scrypt hash) and the tunnel token are kept in VS Code secret storage.
- Push notifications are end-to-end encrypted and carry the chat title and window name.

## Development

```sh
npm install
npm run validate    # format, lint, type check, unit tests
npm run test:e2e    # Playwright against a mock hub
npm run package     # build a .vsix
```

The repository is an npm workspace: `packages/protocol` (shared Zod schemas),
`packages/extension` (the VS Code extension) and `packages/web` (the Svelte phone app). Run
`npm run dev -w @pocket-pilot/web` with `npm run mock -w @pocket-pilot/web` to work on the app
without VS Code. To run the extension from source, run `npm run build` and then
`code --extensionDevelopmentPath=$PWD/packages/extension`.

## License

[MIT](LICENSE)
