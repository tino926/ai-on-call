# ai-on-call

Control AI coding assistants from anywhere via chat messages.

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Supported AI](#supported-ai)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Architecture](#architecture)
- [Development Status](#development-status)

---

## About

`ai-on-call` lets you interact with AI coding assistants from anywhere through chat messages (Telegram now, Discord soon).

Whether you're on your phone or away from your computer, just send a message to the bot and AI will execute tasks on your machine.

### Why use this?

- **Lightweight** — No complex middleware, direct communication
- **Always accessible** — Use from your phone
- **Full conversations** — Session support, AI remembers context
- **Multiple AI** — Switch between Claude, Qwen, OpenCode

---

## Features

### Basic Operations

- `/pwd` — Show current directory
- `/cd [path]` — Change directory
- `/ls` — Browse directory
- `/status` — Show bot status

### Conversation

- Send text messages directly to AI
- `/sessions` — View history, switch sessions
- `/new` — Start new conversation
- Images — AI can analyze images

### Settings

- `/runtime [name]` — Switch AI (claude / qwen / opencode)
- `/lang [code]` — Change language

---

## Supported AI

| AI | Features |
|---|----------|
| **Claude Code** | Most powerful for coding, full permission approval |
| **Qwen Code** | Fast, auto-approves all operations |
| **OpenCode** | Multiple models, cost-effective |

---

## Quick Start

### 1. Setup

```bash
# Install dependencies
npm install

# Build
npm run build
```

### 2. Configure

```bash
cp config.example.toml config.toml
```

Edit `config.toml` with your Telegram Bot Token and User ID:

```toml
[bot]
token = "your_bot_token_here"
allowed_user_id = 123456789
```

### 3. Run

```bash
# Direct
npm start

# Background
node dist/index.js > bot.log 2>&1 &
```

### 4. Use

Send a message to your bot on Telegram:

```
Show me the project structure
```

AI will start working and reply.

---

## Commands

| Command | Description |
|---------|-------------|
| `/status` | Show status |
| `/pwd` | Current directory |
| `/cd [path]` | Change directory |
| `/ls` | List files |
| `/sessions` | Conversation history |
| `/new` | New conversation |
| `/restart` | Restart |
| `/runtime [name]` | Switch AI |
| `/lang [code]` | Language |

---

## Architecture

```
+------------------+
|   Telegram       |
|   (User)         |
+--------+---------+
         |
         v
+------------------+
|   ai-on-call    |
|   (Bot Server)  |
+--------+--------+
         |
         v
+------------------+
| Claude / Qwen   |
| / OpenCode      |
+------------------+
```

- **Bot Server** — Handles messages, commands, callbacks
- **Runtime** — Wraps different AI CLI execution
- **Hook Server** — Intercepts AI operations for approval

---

## Development Status

### Completed

- [x] Basic commands (/status, /pwd, /cd, /ls, /sessions, /new, /restart)
- [x] Text/image message handling
- [x] Session management
- [x] Claude Runtime
- [x] Qwen Runtime
- [x] OpenCode Runtime
- [x] Permission approval (Claude, OpenCode)
- [x] i18n support

### In Progress

- [ ] Discord support
- [ ] Unit tests

---

## Sponsor

If this project helped you, feel free to buy me a coffee ☕

| Platform | Link |
| -------- | ---- |
| Buy Me a Coffee | [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee)](https://buymeacoffee.com/YOUR_USERNAME) |
| Ko-fi | [![Ko-fi](https://img.shields.io/badge/Ko--fi-ff5e5b?logo=kofi)](https://ko-fi.com/YOUR_USERNAME) |
| Crypto | USDT (TRC20): `YOUR_WALLET_ADDRESS` |

[![Donate with PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal)](https://paypal.me/YOUR_USERNAME)

---

## License

MIT
