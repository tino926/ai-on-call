# Contributing to ai-on-call

Thank you for considering contributing! This document outlines the process and conventions.

---

## Table of Contents

- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Code Conventions](#code-conventions)
- [Testing](#testing)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)

---

## Reporting Bugs

1. Search existing [issues](https://github.com/tino926/ai-on-call/issues) first.
2. Include:
   - Node.js version (`node --version`)
   - AI CLI version (e.g. `claude --version`, `qwen --version`)
   - Bot logs (enable `level = "debug"` in `config.toml`)
   - Steps to reproduce
   - Expected vs actual behavior

## Feature Requests

Open an issue describing the feature, its use case, and (if applicable) how it should integrate with existing architecture.

---

## Development Setup

Requirements: **Node.js >= 20**, npm.

```bash
git clone https://github.com/tino926/ai-on-call.git
cd ai-on-call
npm install

# Copy and edit config
cp config.example.toml config.toml
# Fill in your bot token, Telegram user ID, etc.
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript to dist/ |
| `npm run start` | Run compiled dist/index.js |
| `npm run setup` | Run setup-config script |
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | TypeScript type check (tsc --noEmit) |

### CI Workflows

- **test.yml** — lint → typecheck → test (Node 20/22 matrix) on push/PR to `main`/`develop`
- **build.yml** — test → typecheck → lint → build → npm publish on version tags (`v*`); also runs on PR to `main` (for verification)

---

## Project Structure

```
ai-on-call/
├── src/
│   ├── index.ts                 # Entry point + shutdown handler
│   ├── config.ts                # TOML config loading
│   ├── state.ts                 # Singleton BotState (current runtime, session)
│   ├── approval.ts              # ApprovalStore (event emitter)
│   ├── i18n.ts                  # i18n core module
│   ├── hook-server.ts           # TCP Hook Server (Claude, port 9876)
│   ├── opencode-hook-server.ts  # HTTP Hook Server (OpenCode, port 3001)
│   ├── approval-api-server.ts   # HTTP API Server (Gemini, port 9877)
│   ├── opencode-plugin.ts       # OpenCode plugin installer
│   ├── bot/
│   │   ├── index.ts             # Bot initialization (Telegraf)
│   │   ├── commands.ts          # Bot command handlers
│   │   ├── handlers.ts          # Message handlers (text, photo)
│   │   └── callbacks.ts         # Inline button callbacks
│   ├── runtime/
│   │   ├── index.ts             # AiRuntime interface + getRuntime()
│   │   ├── claude.ts            # Claude Code runtime (Hook approval)
│   │   ├── qwen.ts              # Qwen runtime (YOLO mode, no approval)
│   │   ├── opencode.ts          # OpenCode runtime (Hook approval)
│   │   └── gemini.ts            # Gemini CLI runtime (Hook approval)
│   └── utils/
│       ├── logger.ts            # Winston logger
│       ├── retry.ts             # retryWithBackoff + isRateLimitError
│       ├── message-splitter.ts  # Long message splitter (4K chars/chunk)
│       ├── config-validator.ts  # Config schema validation
│       └── paths.ts             # Path utilities
├── tests/
│   ├── setup.ts                 # Global test setup (mock logger, fetch)
│   ├── fixtures/
│   │   └── config.valid.toml    # Valid config fixture for tests
│   ├── runtime.test.ts          # Unit: runtime (24 tests)
│   ├── bot.test.ts              # Unit: bot handlers (13 tests)
│   ├── e2e-runtime.test.ts      # E2E: real spawn runtime (8 tests)
│   ├── e2e-approval.test.ts     # E2E: approval lifecycle (5 tests)
│   ├── e2e-echobot.test.ts      # E2E: full handler pipeline (5 tests)
│   ├── retry.test.ts            # Unit: retry utility (7 tests)
│   ├── approval.test.ts         # Unit: ApprovalStore
│   ├── approval-api-server.test.ts
│   ├── config.test.ts / config-validator.test.ts
│   ├── errors.test.ts / i18n.test.ts
│   ├── message-splitter.test.ts / paths.test.ts
├── locales/
│   ├── zh-TW.json / zh-CN.json / en.json
├── scripts/
│   ├── gemini-hook.ts           # Gemini CLI hook bridge script
│   ├── setup-config.ts          # Config setup wizard
│   ├── check-config.ts          # Config validation check
│   └── opencode-plugin/        # OpenCode hook plugin files
│       ├── install.sh
│       └── telegram-hook.js
├── config.example.toml
├── vitest.config.ts
└── tsconfig.json
```

---

## Code Conventions

### General

- **Language:** TypeScript (strict mode enabled)
- **Module system:** ESM (`"type": "module"` in package.json). All imports must include `.js` extension (e.g. `import { foo } from './bar.js'`).
- **Linting:** ESLint (flat config at `eslint.config.js`)
- **Formatting:** No prettier — follow existing code style (2-space indent, semicolons, single quotes)
- **No comments** in production code unless the logic is non-obvious
- **No emoji** in code or documentation unless user explicitly requests it

### Imports Order

1. External dependencies (e.g. `telegraf`, `winston`)
2. Internal modules (e.g. `../../config.js`)

### Error Handling

- Use `try/catch` for all async operations
- Pass meaningful error messages (preferably from i18n)
- Use the shared `logger` for all logging
- Never expose secrets or keys in logs or error messages

### Runtime Implementation

Each AI CLI runtime lives in `src/runtime/` and implements the `AiRuntime` interface (defined in `src/runtime/index.ts`):

```typescript
export interface AiRuntime {
  name: string;
  execute(
    prompt: string,
    workDir: string,
    sessionId?: string,
    imagePaths?: string[]
  ): Promise<RuntimeOutput>;
  needsApproval(toolCall: ToolCall): boolean;
}
```

- `claude.ts` — Uses TCP hook server for approval
- `opencode.ts` — Uses HTTP hook server for approval
- `gemini.ts` — Uses HTTP API server for approval (via gemini-hook.ts bridge)
- `qwen.ts` — YOLO mode (no approval needed)

When adding a new runtime:
1. Create file in `src/runtime/`
2. Implement `AiRuntime` interface
3. Register in `src/runtime/index.ts` (`getRuntime()`)
4. Add config handling in `src/config.ts`
5. Update `config.example.toml`
6. Add tests

---

## Testing

We use **vitest** with `pool: 'forks'` for test isolation (prevents vi.mock cross-contamination).

### Test Types

| Layer | Location | Description |
|-------|----------|-------------|
| Unit | `tests/*.test.ts` (except e2e-*) | Mocked dependencies |
| E2E Layer 1 | `tests/e2e-runtime.test.ts` | Real child process spawn |
| E2E Layer 2 | `tests/e2e-approval.test.ts` | Real HTTP server |
| E2E Layer 3 | `tests/e2e-echobot.test.ts` | Real spawn + handler pipeline |

### Guidelines

- Place tests in `tests/` directory
- Use `describe`/`it` blocks (globals enabled)
- Mock external services (`global.fetch`, logger) in `tests/setup.ts`
- E2E tests that spawn real processes must:
  - Use `beforeAll`/`afterAll` for setup/teardown
  - Use `os.mkdtempSync()` for temp directories
  - Clean up processes in `afterAll`
- Use `vi.waitFor` with sufficient timeout (10s for CI stability)
- Prefer content-based assertions over index-based ones

### Commands

```bash
npx vitest run                    # Run all tests
npx vitest run tests/retry.test.ts  # Single file
npx vitest                        # Watch mode
npm run test:coverage             # With coverage report
```

---

## Commit Convention

Format: `<type>: <description>`

Types: `feat` | `fix` | `docs` | `test` | `ci` | `refactor` | `chore`

Examples:
```
feat: add rate limit retry with exponential backoff
fix: resolve approval API server blocking register bug
test: add E2E error path tests (empty message, runtime failure)
docs: update README with supported AI table
ci: isolate test files with pool:forks in vitest config
```

### Commit Flow

1. Implement changes
2. Run `npm run lint && npm run typecheck && npx vitest run` to verify
3. Commit with the convention above
4. Push

---

## Pull Request Process

1. Open a PR against the `develop` branch (not `main`)
2. Ensure CI passes (lint → typecheck → test matrix)
3. Add tests for new features or bug fixes
4. Update documentation (README, internal/ docs) if needed
5. Request review from a maintainer

### PR Title Convention

Same as commit convention: `<type>: <description>`

---

## Documentation

- Primary: `README.zh-TW.md` (Traditional Chinese)
- Translations: `README.md` (English), `README.zh-CN.md` (Simplified Chinese)
- Architecture & design: `internal/ARCHITECTURE.md`
- Subsystem specs: `internal/specs/`
- Development notes: `internal/NOTES.md`
- When editing README, work from `README.zh-TW.md` first, then translate.

Internal documentation (`internal/`) is not published to npm. It contains design decisions, review records, and development notes.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
