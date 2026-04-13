const HOOK_SERVER_URL = process.env.TELEGRAM_BOT_HOOK_URL || 'http://localhost:3001';
const AUTO_APPROVE_TOOLS = ['Read', 'Glob', 'Grep', 'Search', 'WebFetch', 'WebSearch'];

async function toolExecuteBefore(context) {
  const toolName = context.tool?.name || context.$?.name;
  const toolParams = JSON.stringify(context.tool?.input || context.$?.input || {});

  if (!toolName || AUTO_APPROVE_TOOLS.includes(toolName)) {
    return;
  }

  const requestId = `opencode-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const response = await fetch(`${HOOK_SERVER_URL}/hook/opencode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: requestId,
        tool: toolName,
        params: toolParams,
      }),
      signal: AbortSignal.timeout(300000),
    });

    if (!response.ok) {
      console.error(`Hook server error: ${response.status}`);
      throw new Error('Hook request failed');
    }

    const result = await response.json();

    if (!result.approved) {
      throw new Error(`Permission denied for ${toolName}`);
    }

    console.log(`[telegram-hook] Approved: ${toolName}`);
  } catch (error) {
    if (error.message?.startsWith('Permission denied for ')) {
      throw error;
    }
    console.error(`[telegram-hook] Error: ${error.message}`);
  }
}

module.exports = {
  name: 'telegram-hook',
  version: '1.0.0',
  description: 'Telegram bot hook for permission approval',
  toolExecuteBefore,
};
