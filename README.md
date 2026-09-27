# Pocket Pilot

Watch and steer VS Code chat agents from your phone while you are away from the desk.

Pocket Pilot runs a small server inside VS Code and serves a web app to phones through a
Cloudflare tunnel. From the phone you can:

- see every chat in every open VS Code window, grouped by repository
- follow a running request as it streams, including tool calls and file edits
- send a message, queue one behind the running request, or steer it
- stop a request, and allow or skip a tool that waits for confirmation
- switch agent and model, and change thinking effort or context size
- start a new chat in any open window
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
