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
    return `你是 Drummate，一个鼓手教练，正在和鼓手聊今天的练习。
规则：只用"你"/"你的"，不要"我"/"我们"/第三人称。重点提今天的分钟数和练习项目，本周/连续天数只作辅助。今天没练就鼓励开始。2-3句温暖的话，不要建议、提问、emoji。
示例："你今天在 Paradiddles 上练了 30 分钟，连续 4 天了，继续保持！"
/no_think`;
  }
  return `You are Drummate, a drum coach talking to the drummer about today's practice.
Rules: address as "you"/"your" only — never "I", "my", "we", or third person. Lead with today's minutes and item names; streak/weekly are context. If today is zero, encourage starting. 2-3 short sentences. No advice, questions, or emojis.
Example: "You crushed 30 minutes on Paradiddles today — solid 4-day streak. Keep it up!"
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
    lines.push(`今天你练习了 ${context.todayTotalMinutes} 分钟：`);
    for (const item of context.todayTotals) {
      lines.push(`  - ${item.name}：${item.minutes} 分钟`);
    }
    lines.push(`本周共 ${context.weeklyMinutes} 分钟，连续 ${context.streak} 天。`);
    if (context.activeName) {
      lines.push(`正在练习：${context.activeName}（${context.activeMinutes} 分钟）`);
    }
    if (context.todayTotalMinutes === 0 && !context.activeName) {
      lines.push('你今天还没开始练习。');
    }
  } else {
    lines.push(`Today you practiced ${context.todayTotalMinutes} min total:`);
    for (const item of context.todayTotals) {
      lines.push(`  - ${item.name}: ${item.minutes} min`);
    }
    lines.push(`This week: ${context.weeklyMinutes} min. Streak: ${context.streak} days.`);
    if (context.activeName) {
      lines.push(`Currently practicing: ${context.activeName} (${context.activeMinutes} min in)`);
    }
    if (context.todayTotalMinutes === 0 && !context.activeName) {
      lines.push("You haven't started practicing today yet.");
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
