const MODEL_URL = 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf';

const WASM_PATHS = {
  'single-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/src/single-thread/wllama.wasm',
  'multi-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/src/multi-thread/wllama.wasm',
};

const FALLBACK_EN = [
  "Every minute on the kit counts. Keep showing up!",
  "Practice makes progress — you're proving it.",
  "Your dedication to the drums is inspiring. Keep going!",
  "Consistency is the secret. You've got it.",
  "Great things happen one beat at a time.",
  "You're building something amazing with each session.",
];

const FALLBACK_ZH = [
  "每一分钟的练习都很重要，继续加油！",
  "练习造就进步——你正在证明这一点。",
  "你对鼓的热爱令人敬佩，继续努力！",
  "坚持就是秘诀，你做到了。",
  "伟大的事情都是一拍一拍积累的。",
  "每次练习都让你更进一步。",
];

function buildSystemPrompt(language) {
  if (language === 'zh') {
    return `你是 Drummate，一个友好的鼓手练习教练。直接称呼鼓手为"你"——绝不要用"我"、"我的"或第三人称（"他/她/他们"）。用温暖、具体、积极的语气写2-3句鼓励，重点放在**今天**的练习。优先提到今天的分钟数和具体练习项目名称。只有在能直接强化今天努力的情况下，才简短提到本周总数或连续练习天数；如果今天还没开始练习，就鼓励"你"开始。不要给建议。不要提问。绝对不要使用任何 emoji 或表情符号——只用纯文字。只写鼓励的话。/no_think`;
  }
  return `You are Drummate, a friendly drum practice coach. Address the drummer directly as "you" — never write in first person ("I", "my") or third person ("they", "the user"). Write 2-3 short sentences of warm, specific, upbeat encouragement that focuses on what you practiced TODAY. Lead with today's minutes and the specific item names from today. Only reference the weekly total or streak briefly if it directly reinforces today's effort. If today has zero practice, encourage them to start. Do not give advice. Do not ask questions. Never use emojis or any pictographic characters — plain text only. Just encourage. /no_think`;
}

function buildUserPrompt(context, language) {
  const lines = [];
  if (language === 'zh') {
    lines.push('你的练习数据：');
    lines.push(`- 今天：你练习了 ${context.todayTotalMinutes} 分钟`);
    for (const item of context.todayTotals) {
      lines.push(`  - ${item.name}：${item.minutes} 分钟`);
    }
    lines.push(`- 本周：你共练习了 ${context.weeklyMinutes} 分钟`);
    lines.push(`- 你已连续练习 ${context.streak} 天`);
    if (context.activeName) {
      lines.push(`- 你正在练习：${context.activeName}（已练 ${context.activeMinutes} 分钟）`);
    }
    if (context.todayTotalMinutes === 0 && !context.activeName) {
      lines.push('- 你今天还没有开始练习');
    }
  } else {
    lines.push('Your practice data:');
    lines.push(`- Today: you practiced ${context.todayTotalMinutes} minutes total`);
    for (const item of context.todayTotals) {
      lines.push(`  - ${item.name}: ${item.minutes} min`);
    }
    lines.push(`- This week: you practiced ${context.weeklyMinutes} minutes total`);
    lines.push(`- You're on a ${context.streak}-day practice streak`);
    if (context.activeName) {
      lines.push(`- You're currently practicing: ${context.activeName} (${context.activeMinutes} min into session)`);
    }
    if (context.todayTotalMinutes === 0 && !context.activeName) {
      lines.push("- You haven't started practicing today yet");
    }
  }
  return lines.join('\n');
}

function getRandomFallback(language) {
  const pool = language === 'zh' ? FALLBACK_ZH : FALLBACK_EN;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Check if the model is already cached in OPFS (no full wllama init needed).
 */
export async function isModelCached() {
  try {
    const { Wllama, LoggerWithoutDebug } = await import('@wllama/wllama');
    const temp = new Wllama(WASM_PATHS, { logger: LoggerWithoutDebug });
    const blob = await temp.cacheManager.open(MODEL_URL);
    return blob !== null;
  } catch {
    return false;
  }
}

export function createLlmService() {
  let wllama = null;
  let loaded = false;

  return {
    get isReady() {
      return loaded;
    },

    async load(progressCallback) {
      const { Wllama, LoggerWithoutDebug } = await import('@wllama/wllama');

      wllama = new Wllama(WASM_PATHS, {
        logger: LoggerWithoutDebug,
        allowOffline: true,
      });

      await wllama.loadModelFromUrl(MODEL_URL, {
        n_ctx: 1024,
        progressCallback: ({ loaded: l, total }) => {
          if (progressCallback && total > 0) {
            progressCallback({
              text: `${Math.round(l / 1024 / 1024)} / ${Math.round(total / 1024 / 1024)} MB`,
              percentage: Math.round((l / total) * 100),
            });
          }
        },
      });

      loaded = true;
    },

    async generateEncouragement(practiceContext, language) {
      if (!wllama || !loaded) {
        return getRandomFallback(language);
      }

      try {
        const messages = [
          { role: 'system', content: buildSystemPrompt(language) },
          { role: 'user', content: buildUserPrompt(practiceContext, language) },
        ];

        const result = await wllama.createChatCompletion(messages, {
          nPredict: 150,
          sampling: {
            temp: 0.7,
            top_p: 0.9,
            top_k: 40,
            penalty_repeat: 1.1,
          },
        });

        const trimmed = result
          .replace(/<think>[\s\S]*?<\/think>/g, '')
          .replace(/[\p{Extended_Pictographic}‍️]/gu, '')
          .replace(/[ \t]{2,}/g, ' ')
          .trim();
        if (trimmed.length < 10 || trimmed.length > 500) {
          return getRandomFallback(language);
        }
        return trimmed;
      } catch (err) {
        console.error('LLM generation failed:', err);
        return getRandomFallback(language);
      }
    },

    async destroy() {
      if (wllama) {
        await wllama.exit();
        wllama = null;
        loaded = false;
      }
    },
  };
}
