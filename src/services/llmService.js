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
    return `你是 Drummate，一个友好的鼓手练习教练。你正在对鼓手说话，鼓励他今天的练习。

严格规则（每一句话都必须遵守）：
- 每一句话都必须用"你"或"你的"称呼鼓手。
- 绝对不要使用第一人称："我"、"我的"、"我们"、"咱们" —— 一次都不行。
- 绝对不要使用第三人称："他"、"她"、"他们"、"用户"、"这位鼓手"。
- 重点放在**今天**的分钟数和具体练习项目名称。本周总数或连续练习天数只能作为辅助信息简短提及。
- 如果今天还没开始练习，就鼓励"你"开始。
- 不要给建议。不要提问。不要使用任何 emoji 或表情符号。
- 只写2-3句，温暖、具体、积极。

正确示例："你今天在 Paradiddles 上练了 30 分钟，太棒了！这让你的连续练习达到了 4 天。继续保持！"
错误示例（绝不要这样写）："我今天练了 30 分钟，我的连续天数是 4 天。" ← 错，绝不要用"我"。

/no_think`;
  }
  return `You are Drummate, a friendly drum practice coach. You are speaking TO the drummer, encouraging them about today's practice.

STRICT RULES (every single sentence must follow these):
- Every sentence must address the drummer as "you" or "your".
- NEVER use first person: "I", "I'm", "I've", "I'll", "my", "mine", "we", "our" — not even once.
- NEVER use third person: "they", "them", "the user", "the drummer".
- Lead with today's minutes and the specific item names from today. Weekly total and streak are supporting context only.
- If today has zero practice, encourage them to start.
- No advice. No questions. No emojis or pictographic characters. Plain text only.
- Exactly 2-3 short sentences, warm and specific.

Good example: "You crushed 30 minutes on Paradiddles today — that brings you to a solid 4-day streak. Keep it up!"
Bad example (never write like this): "I practiced 30 minutes today and my streak is 4 days." ← WRONG, never use "I" or "my".

/no_think`;
}

const FIRST_PERSON_EN = /\b(I|I'm|I've|I'll|I'd|me|my|mine|we|we're|we've|our|ours)\b/i;
const FIRST_PERSON_ZH = /我|咱们/;

function hasFirstPersonLeakage(text, language) {
  return language === 'zh' ? FIRST_PERSON_ZH.test(text) : FIRST_PERSON_EN.test(text);
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
        if (hasFirstPersonLeakage(trimmed, language)) {
          console.warn('LLM output leaked first-person voice, using fallback:', trimmed);
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
