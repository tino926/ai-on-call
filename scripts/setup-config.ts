#!/usr/bin/env node

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as toml from 'toml';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

function validateToken(token) {
  const trimmed = token.trim();
  if (trimmed.length < 30 || trimmed.length > 1000) {
    throw new Error('Bot Token 長度必須在 30-1000 字元之間');
  }
  return trimmed;
}

function validateUserId(userId) {
  const parsed = parseInt(userId.trim(), 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error('User ID 必須是正整數');
  }
  return parsed;
}

function validateRuntime(runtime) {
  const valid = ['claude', 'qwen', 'opencode'];
  const trimmed = (runtime || 'claude').trim();
  if (!valid.includes(trimmed)) {
    throw new Error(`Runtime 必須是 ${valid.join('/')} 之一`);
  }
  return trimmed;
}

function validateWorkDir(workDir) {
  const trimmed = workDir.trim() || process.cwd();
  if (!fs.existsSync(trimmed)) {
    throw new Error(`工作目錄不存在: ${trimmed}`);
  }
  if (!fs.statSync(trimmed).isDirectory()) {
    throw new Error(`工作目錄不是有效的目錄: ${trimmed}`);
  }
  return trimmed;
}

function validateHookSettings() {
  return {
    host: '127.0.0.1',
    port: 9876,
    opencode_http_port: 3001,
    timeout_sec: 300,
  };
}

function detectMode() {
  const cwd = process.cwd();
  const packageJsonPath = path.join(cwd, 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.name === 'ai-on-call') {
        return 'git-clone';
      }
    } catch {
    }
  }

  if (fs.existsSync(path.join(cwd, 'config.toml'))) {
    return 'git-clone';
  }

  return 'global';
}

function getConfigPath(mode) {
  if (mode === 'git-clone') {
    return path.join(process.cwd(), 'config.toml');
  }
  const configDir = path.join(os.homedir(), '.ai-on-call');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return path.join(configDir, 'config.toml');
}

function printConfigSummary(config) {
  console.log('\n📋 配置摘要：');
  console.log('─'.repeat(40));
  console.log(`  Bot Token:  ${config.bot.token.substring(0, 10)}...`);
  console.log(`  User ID:    ${config.bot.allowed_user_id}`);
  console.log(`  Runtime:    ${config.runtime.default}`);
  console.log(`  Work Dir:   ${config.runtime.work_dir}`);
  console.log(`  Hook Port:  ${config.hook.port}`);
  console.log('─'.repeat(40));
}

async function main() {
  console.log('🤖 ai-on-call 配置向導');
  console.log('═'.repeat(40));

  const mode = detectMode();
  console.log(`📂 偵測到模式: ${mode === 'git-clone' ? 'Git Clone' : '全域安裝'}`);

  const token = await ask('請輸入 Telegram Bot Token (從 @BotFather 取得): ');
  const userId = await ask('請輸入你的 Telegram User ID (從 @userinfobot 查詢): ');
  const runtime = await ask('預設 AI (claude/qwen/opencode) [claude]: ') || 'claude';
  const workDir = await ask(`工作目錄 [${process.cwd()}]: `) || process.cwd();

  let config;
  try {
    config = {
      bot: {
        token: validateToken(token),
        allowed_user_id: validateUserId(userId),
      },
      runtime: {
        default: validateRuntime(runtime),
        work_dir: validateWorkDir(workDir),
      },
      hook: validateHookSettings(),
      logging: {
        level: 'info',
      },
    };
  } catch (error) {
    console.error(`\n❌ 驗證失敗: ${error.message}`);
    rl.close();
    process.exit(1);
  }

  const configPath = getConfigPath(mode);

  if (fs.existsSync(configPath)) {
    console.log(`\n⚠️  設定檔已存在: ${configPath}`);
    const overwrite = await ask('是否覆寫？(y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('已取消設定。');
      rl.close();
      process.exit(0);
    }
  }

  printConfigSummary(config);

  const confirm = await ask('\n確認寫入設定檔？(y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('已取消設定。');
    rl.close();
    process.exit(0);
  }

  const tomlContent = toml.stringify(config);

  try {
    fs.writeFileSync(configPath, tomlContent);
  } catch (error) {
    console.error(`\n❌ 寫入設定檔失敗: ${error.message}`);
    rl.close();
    process.exit(1);
  }

  console.log(`\n✅ 配置已寫入：${configPath}`);
  console.log('\n執行以下命令啟動 bot:');
  console.log(mode === 'git-clone' ? '  npm run dev' : '  ai-on-call');

  rl.close();
}

main();
