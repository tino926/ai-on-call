# ai-on-call

從任何地方透過聊天訊息控制 AI 程式碼助手。

---

## 目錄

- [簡介](#簡介)
- [功能特點](#功能特點)
- [系統架構](#系統架構)
- [技術規格](#技術規格)
- [權限架構](#權限架構)
- [開發狀態](#開發狀態)

---

## 簡介

`ai-on-call` 讓你的 AI 程式碼助手隨時待命。透過即時通訊軟體（目前支援 Telegram，
未來計畫支援 Discord），你可以隨時隨地交辦開發任務，並無縫接續先前的進度。

**為何不用 OpenClaw？**
因為 OpenClaw 常自動做了太多預期之外的動作，還有太多權限設定上的問題要考量。使用
一段時間後，我發現我想要的比較單純：就是透過聊天軟體隨時交辦任務；而像
claude code這樣的 Coding Agent 本身就已經具備強大的自主能力，能完成
多步驟的任務，足夠強大卻又相對確保單純。

1. **遠端操控 AI** — 傳送訊息給 bot，AI 在你的電腦上執行任務
2. **權限審批** — 當 AI 需要執行危險操作時，傳送 Allow/Deny 按鈕讓你確認
3. **Session 管理** — 維持對話連續性，支援切換/恢復之前的 session
4. **多 runtime 支援** — 可熱切換不同的 AI CLI（Claude / Qwen / OpenCode）

---

## 功能特點

### 指令

| 指令              | 說明                                                    |
| ----------------- | ------------------------------------------------------- |
| `/status`         | 顯示 bot 狀態（工作目錄、session、runtime、待審批數量） |
| `/pwd`            | 顯示目前工作目錄                                        |
| `/cd [path]`      | 切換工作目錄（無參數顯示當前目錄）                      |
| `/ls`             | 列出目錄內容（含 inline keyboard 點擊切換目錄）         |
| `/sessions`       | 列出最近的 session（可點擊切換）                        |
| `/new`            | 開啟新 session                                          |
| `/restart`        | 重啟 bot                                                |
| `/runtime <name>` | 切換 AI runtime（claude / qwen / opencode）             |
| `/lang [code]`    | 顯示或切換語言（zh-tw / zh-cn / en）                    |

### 一般訊息處理

- **文字訊息** — 轉發給當前選定的 AI runtime 執行
- **圖片訊息** — 下載後轉發給 AI runtime（支援視覺分析）
- **權限審批** — 收到 Allow/Deny 按鈕，5 分鐘超時自動拒絕

### Inline Keyboard 功能

- **目錄瀏覽** (`/ls`) — 點擊目錄切換
- **Session 切換** (`/sessions`) — 點擊 session 切換，顯示最近 4 則對話
- **權限審批** — Allow/Deny 按鈕，點擊後更新訊息顯示結果
- **產生摘要** — 為 session 產生對話摘要

### 自動放行的工具

以下工具不需要審批：
- `Read` — 讀檔
- `Glob` — 搜尋檔案
- `Grep` — 搜尋內容
- `Agent` — 子代理探索
- `ToolSearch` — 工具搜尋

---

## 系統架構

### 高階架構圖

```
+---------------------------------------------------------------+
|                          ai-on-call                           |
+---------------------------------------------------------------+
|  +---------------------------------------------------------+  |
|  |                 Chat Bot Handler                        |  |
|  |                    (telegraf)                           |  |
|  +--------------------------+------------------------------+  |
|                             |                                 |
|             +---------------v----------------+                |
|             |        Command Router          |                |
|             +---------------+----------------+                |
|                             |                                 |
|             +---------------v----------------+                |
|             |          AI Runtimes           |                |
|             |  (Claude / Qwen / OpenCode)    |                |
|             +---------------+----------------+                |
|                             |                                 |
|             +---------------v----------------+                |
|             |       Approval Manager         |                |
|             +-------+----------------+-------+                |
|                     |                |                        |
|        +------------v-------+   +----v---------------+        |
|        |   TCP Hook Server  |   |  HTTP Hook Server  |        |
|        |    (Claude / Qwen) |   |    (OpenCode)      |        |
|        +--------------------+   +--------------------+        |
+---------------------------------------------------------------+
```

### 元件說明

```text
+----------------------+-------------------------------+---------------------------------+
| 元件                 | 檔案                          | 職責                            |
+======================+===============================+=================================+
| Chat Bot Handler     | src/bot/                      | 處理訊息、指令、callback        |
+----------------------+-------------------------------+---------------------------------+
| Command Router       | src/bot/commands.ts           | 指令分發與處理                  |
+----------------------+-------------------------------+---------------------------------+
| AI Runtimes          | src/runtime/                  | 抽象不同 AI CLI 的執行介面      |
+----------------------+-------------------------------+---------------------------------+
| Hook Server          | src/hook-server.ts            | 接收 Claude 的 TCP hook 請求    |
|                      | src/opencode-hook-server.ts   | 接收 OpenCode 的 HTTP hook 請求 |
+----------------------+-------------------------------+---------------------------------+
| OpenCode Plugin      | src/opencode-plugin.ts        | OpenCode 專屬的權限審批外掛實作 |
+----------------------+-------------------------------+---------------------------------+
| Approval Manager     | src/approval.ts               | 管理待審批請求、超時處理        |
+----------------------+-------------------------------+---------------------------------+
| Config & State       | src/config.ts                 | 環境變數設定與跨模組狀態管理    |
|                      | src/state.ts                  |                                 |
+----------------------+-------------------------------+---------------------------------+
| Core Utils           | src/i18n.ts                   | 多語系處理機制與全域錯誤管理    |
|                      | src/errors.ts                 |                                 |
+----------------------+-------------------------------+---------------------------------+
```

### Hook 審批流程

自動攔截 CLI 工具的 hook 機制來達成權限審核：

**1. Claude Code 流程**
```text
Claude Code CLI
     |
     |-- (設定 TELEGRAM_BOT_HOOK=1) --> Claude Code 內部攔截
     |-- (TCP 請求 JSON) --------> ai-on-call Hook Server (:9876)
                                        |-- (傳送 Allow/Deny) --> 使用者 Telegram 點擊
                                        |<-- (Callback 結果) ----
     |<-- (回應 {"approved": true/false})
     |
繼續或阻止操作
```

**2. OpenCode 流程**
```text
OpenCode CLI
     |
     |-- (呼叫本地外掛) ----------> opencode-plugin
     |-- (HTTP POST) -----------> ai-on-call Hook Server (/hook/opencode)
                                        |-- (傳送 Allow/Deny) --> 使用者 Telegram 點擊
                                        |<-- (Callback 結果) ----
     |<-- (回應 {"approved": true/false})
     |
繼續或阻止操作
```

---

## 技術規格

### 開發環境

| 項目                     | 版本/選擇       |
| ------------------------ | --------------- |
| **語言**                 | TypeScript 5.x  |
| **Runtime**              | Node.js 20+ LTS |
| **Telegram Bot Library** | telegraf 4.x    |
| **HTTP Client**          | axios           |
| **配置管理**             | toml            |
| **日誌**                 | winston         |
| **打包工具**             | esbuild / tsx   |

### 系統需求

- **Node.js** >= 20
- **Telegram Bot Token**（從 @BotFather 取得）
- **AI CLI**：
  - Claude Code CLI (`claude`)
  - Qwen Code CLI (`qwencode`)
  - OpenCode CLI (`opencode`)

### 專案結構

```
ai-on-call/
├── src/
│   ├── index.ts                 # 程式入口
│   ├── config.ts                # 設定載入
│   ├── state.ts                 # 狀態管理
│   ├── approval.ts              # 審批狀態管理
│   ├── hook-server.ts           # TCP hook server (Claude用)
│   ├── opencode-hook-server.ts  # HTTP hook server (OpenCode用)
│   ├── opencode-plugin.ts       # OpenCode 審批外掛實作
│   ├── i18n.ts                  # 多語系設定與支援
│   ├── errors.ts                # 錯誤定義與處理
│   ├── bot/
│   │   ├── index.ts             # Bot 初始化
│   │   ├── commands.ts          # 指令處理
│   │   ├── handlers.ts          # 訊息/圖片處理器
│   │   └── callbacks.ts         # Inline keyboard 回調
│   ├── runtime/
│   │   ├── index.ts             # Runtime 介面
│   │   ├── claude.ts            # Claude Code 實作
│   │   ├── qwen.ts              # Qwen Code 實作
│   │   └── opencode.ts          # OpenCode 實作
│   └── utils/
│       ├── logger.ts            # 日誌工具
│       └── paths.ts             # 路徑管理
├── scripts/
│   ├── check-config.ts          # 設定檢查腳本
│   └── opencode-plugin/         # OpenCode 專用 plugin 目錄
├── locales/
│   ├── en.json
│   ├── zh-TW.json
│   └── zh-CN.json
├── package.json
├── tsconfig.json
└── vitest.config.ts             # 測試框架設定
```

### 設定檔（config.toml）

所有設定集中在 `config.toml` 中，請複製 `config.example.toml` 並填入真實值：

```toml
[bot]
token = "YOUR_TELEGRAM_BOT_TOKEN"   # 必填，從 @BotFather 取得
allowed_user_id = 123456789        # 必填，0 = 不限制任何人

[runtime]
default = "claude"                 # 預設 AI runtime：claude / opencode / qwen
work_dir = ""                       # 預設工作目錄，留空則使用當前目錄

[hook]
host = "127.0.0.1"                  # Hook server 監聽位址
port = 9876                         # Claude TCP Hook Server port
opencode_http_port = 3001           # OpenCode HTTP Hook Server port
timeout_sec = 300                   # 審批超時秒數

[logging]
level = "info"                      # 日誌級別：trace / debug / info / warn / error
```

詳見 [`config.example.toml`](./config.example.toml)。

---

## 權限架構

這個 bot 能正常運作，依賴三個關鍵設定。缺一不可：

### 1. Hook 審批機制

bot 發起 session 時，Claude Code 內部透過 TCP 連線至 Hook Server。Hook Server
透過 `TELEGRAM_BOT_HOOK` 環境變數判斷來源：
- **bot 發起的 session**（有設定 `TELEGRAM_BOT_HOOK=1`）→ 危險工具需要審批
- **你在電腦前直接用 Claude Code**（沒有此變數）→ 直接放行，完全不影響

### 2. `--dangerously-skip-permissions`

`claude -p` 有**兩層**權限系統：

| 層級       | 來源            | 作用                       |
| ---------- | --------------- | -------------------------- |
| Hook 層    | hook-server.ts  | 我們的審批（可控）         |
| CLI 內建層 | claude 自身     | 會再次擋住 Write/Edit/Bash |

如果不加 `--dangerously-skip-permissions`，即使你按了 Allow，CLI 內建的權限系統
還是會擋住。本專案已加入這個 flag，讓 hook 成為**唯一的權限把關者**。

### 3. Telegraf 並發處理

telegraf 預設串行處理 updates。這會造成死鎖：

```
handle_message 佔住 update queue，等 Claude 回應
  -> Claude 等 hook 審批
    -> hook 等你按 Allow/Deny
      -> callback_query 排在 handle_message後面
        -> 永遠輪不到 -> 死鎖
```

本專案已設定 `webhookReply: false` 解決此問題。

---

## 開發狀態

### 已完成

- [x] 專案結構初始化
- [x] TypeScript 配置
- [x] 依賴套件安裝
- [x] 配置載入模組
- [x] 日誌系統
- [x] Bot 初始化與連接
- [x] 所有指令實作 (`/status`, `/pwd`, `/cd`, `/ls`, `/sessions`, `/new`, `/restart`, `/runtime`)
- [x] 訊息處理器（文字、圖片）
- [x] Callback 回調（目錄切換、Session 切換、摘要、審批）
- [x] Claude Code Runtime
- [x] Hook Server 與審批機制
- [x] 狀態管理
- [x] Rate limiting
- [x] `/cd` 增強（無參數顯示目錄）
- [x] 單例 runtime（保留 rate limiting 狀態）
- [x] OpenCode Runtime
- [x] 多語系支援 (i18n)
- [x] `/lang` 指令（手動切換語言）

### 待完成

- [ ] Discord 支援
- [ ] 單元測試

---

## 贊助

如果這個專案對你有幫助，歡迎請我喝杯咖啡 ☕

| 平台 | 連結 |
| ---- | ---- |
<!-- | Buy Me a Coffee | [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee)](https://buymeacoffee.com/YOUR_USERNAME) | -->
| Ko-fi | [![Ko-fi](https://img.shields.io/badge/Ko--fi-ff5e5b?logo=kofi)](https://ko-fi.com/tinoplaystuff) |
<!-- | 加密貨幣 | USDT (TRC20): `YOUR_WALLET_ADDRESS` | -->

[![Donate with PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=4T7LWBH63XQEE)

---

## 授權

MIT
