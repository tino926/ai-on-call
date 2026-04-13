# ai-on-call

从任何地方通过聊天消息控制 AI 代码助手。

---

## 目录

- [简介](#简介)
- [功能特点](#功能特点)
- [支持的 AI](#支持的-ai)
- [快速开始](#快速开始)
- [指令](#指令)
- [架构](#架构)
- [开发状态](#开发状态)

---

## 简介

`ai-on-call` 让你可以通过聊天消息（目前支持 Telegram，以后会支持 Discord），随时随地与 AI 代码助手互动。

无论你在手机上还是离开了电脑，只需要发送消息给 bot，AI 就会在你的电脑上执行任务。

### 为什么要用这个？

- **轻量** — 没有复杂的中介层，直接沟通
- **随时可用** — 从手机也能叫 AI 做事
- **完整对话** — 支持 session，AI 记得之前的上下文
- **多 AI 支持** — 可自由切换 Claude、Qwen、OpenCode

---

## 功能特点

### 基本操作

- `/pwd` — 查看当前目录
- `/cd [路径]` — 切换目录
- `/ls` — 浏览目录结构
- `/status` — 查看 bot 状态

### 对话管理

- 直接发送文字消息给 AI
- `/sessions` — 查看对话历史，切换到之前的 session
- `/new` — 开始新对话
- 图片发送 — AI 可以分析图片

### 设置

- `/runtime [名称]` — 切换 AI（claude / qwen / opencode）
- `/lang [语言]` — 切换界面语言

---

## 支持的 AI

| AI | 特色 |
|---|------|
| **Claude Code** | 最强的程序开发 AI，有完整的权限审批 |
| **Qwen Code** | 快速，自动批准所有操作 |
| **OpenCode** | 支持多种模型，性价比高 |

---

## 快速开始

### 1. 准备环境

```bash
# 安装依赖
npm install

# 编译
npm run build
```

### 2. 配置

```bash
cp config.example.toml config.toml
```

编辑 `config.toml`，填入你的 Telegram Bot Token 和 User ID：

```toml
[bot]
token = "your_bot_token_here"
allowed_user_id = 123456789
```

### 3. 启动

```bash
# 直接执行
npm start

# 或后台执行
node dist/index.js > bot.log 2>&1 &
```

### 4. 使用

在 Telegram 发送消息给你的 bot，例如：

```
帮我看看这个项目的结构
```

AI 就会开始工作并回复你。

---

## 指令

| 指令 | 说明 |
|------|------|
| `/status` | 显示状态 |
| `/pwd` | 当前目录 |
| `/cd [path]` | 切换目录 |
| `/ls` | 列出文件 |
| `/sessions` | 对话历史 |
| `/new` | 新对话 |
| `/restart` | 重启 |
| `/runtime [name]` | 切换 AI |
| `/lang [code]` | 语言 |

---

## 架构

```
+------------------+
|   Telegram       |
|   (用户)          |
+--------+---------+
         |
         v
+------------------+
|   ai-on-call    |
|   (Bot 服务器)   |
+--------+--------+
         |
         v
+------------------+
| Claude / Qwen   |
| / OpenCode      |
+------------------+
```

- **Bot Server** — 处理消息、指令、callback
- **Runtime** — 封装不同 AI CLI 的执行方式
- **Hook Server** — 拦截 AI 的操作请求，进行审批

---

## 开发状态

### 已完成

- [x] 基本指令 (/status, /pwd, /cd, /ls, /sessions, /new, /restart)
- [x] 文字/图片消息处理
- [x] Session 管理
- [x] Claude Runtime
- [x] Qwen Runtime
- [x] OpenCode Runtime
- [x] 权限审批（Claude、OpenCode）
- [x] 多语言支持 (i18n)

### 待完成

- [ ] Discord 支持
- [ ] 单元测试

---

## 赞助

如果这个项目对你有帮助，欢迎请我喝杯咖啡 ☕

| 平台 | 链接 |
| ---- | ---- |
| Buy Me a Coffee | [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee)](https://buymeacoffee.com/YOUR_USERNAME) |
| Ko-fi | [![Ko-fi](https://img.shields.io/badge/Ko--fi-ff5e5b?logo=kofi)](https://ko-fi.com/YOUR_USERNAME) |
| 加密货币 | USDT (TRC20): `YOUR_WALLET_ADDRESS` |

[![Donate with PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=4T7LWBH63XQEE)

---

## 授权

MIT
