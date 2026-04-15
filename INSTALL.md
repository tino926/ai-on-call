# 安裝指南

## 系統需求

- Node.js >= 20.0.0
- Telegram Bot Token（從 [@BotFather](https://t.me/BotFather) 取得）
- 支援的 AI CLI（至少一種）：
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
  - [OpenCode](https://github.com/opencode-ai/opencode)
  - [Qwen Code](https://qwenlm.github.io/)

## 安裝方式

### 方式一：Git Clone（推薦）

```bash
git clone https://github.com/tino926/ai-on-call.git
cd ai-on-call
npm install
```

### 方式二：npm 全域安裝

```bash
npm install -g ai-on-call
```

## 設定

### 1. 取得 Telegram Bot Token

1. 在 Telegram 搜尋 [@BotFather](https://t.me/BotFather)
2. 傳送 `/newbot`
3. 依照指示建立 bot，取得 Token

### 2. 取得你的 Telegram User ID

在 Telegram 搜尋 [@userinfobot](https://t.me/userinfobot)，傳送任意訊息取得你的 User ID。

### 3. 編輯設定檔

**Git clone 模式：**
```bash
cp config.example.toml config.toml
nano config.toml  # 或使用任何文字編輯器
```

**全域安裝模式：**
```bash
ai-on-call setup  # 互動式設定精靈
# 或手動編輯
nano ~/.ai-on-call/config.toml
```

### 4. 必要設定

```toml
[bot]
token = "你的_Telegram_Bot_Token"
allowed_user_id = 你的_User_ID  # 填 0 則不限制任何人
```

## 執行

### 開發模式

```bash
cd ai-on-call
npm run dev
```

### 生產模式

```bash
npm start
```

### 背景執行（使用 systemd）

建立服務檔案 `/etc/systemd/system/ai-on-call.service`：

```ini
[Unit]
Description=ai-on-call Telegram Bot
After=network.target

[Service]
Type=simple
User=你的用戶名
WorkingDirectory=/path/to/ai-on-call
ExecStart=/path/to/ai-on-call/dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

啟動服務：
```bash
sudo systemctl daemon-reload
sudo systemctl enable ai-on-call
sudo systemctl start ai-on-call
```

## 設定檔位置

| 安裝方式 | 預設位置 |
|---------|---------|
| Git clone | `./config.toml` |
| npm 全域 | `~/.ai-on-call/config.toml` |
| 自訂 | `AI_ON_CALL_CONFIG` 環境變數 |

## 常見問題

### Bot 無法啟動

1. 檢查 `config.toml` 是否存在於正確位置
2. 確認 Bot Token 正確
3. 確認 `allowed_user_id` 正確（或設為 0）

### 看不到 Allow/Deny 按鈕

1. 確認 Claude Code 已設定 `--dangerously-skip-permissions`
2. 確認 Hook Server 正常啟動（預設 port 9876）

### Claude Code 沒反應

1. 確認 `TELEGRAM_BOT_HOOK=1` 環境變數已設定
2. 檢查 `bot.log` 查看錯誤訊息

## 卸載

```bash
# Git clone 模式
cd ai-on-call
npm uninstall

# 全域安裝模式
npm uninstall -g ai-on-call
rm -rf ~/.ai-on-call
```
