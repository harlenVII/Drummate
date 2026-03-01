const MODEL_URL = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';

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
    return `你是 Drummate，一个友好的鼓手练习教练。用户希望根据他们最近的练习数据获得鼓励。请根据提供的数据，用温暖、具体、积极的语气写2-3句鼓励的话。要具体——提到实际的数字或练习项目名称。不要给建议。不要提问。只写鼓励的话。`;
  }
  return `You are Drummate, a friendly drum practice coach. The user wants encouragement based on their recent practice data. Write 2-3 short sentences of warm, specific, upbeat encouragement based on the data provided. Be specific — mention actual numbers or item names. Do not give advice. Do not ask questions. Just encourage.`;
}

function buildUserPrompt(context, language) {
  const lines = [];
  if (language === 'zh') {
    lines.push('我的练习数据：');
    lines.push(`- 今天：共 ${context.todayTotalMinutes} 分钟`);
    for (const item of context.todayTotals) {
      lines.push(`  - ${item.name}：${item.minutes} 分钟`);
    }
    lines.push(`- 本周：共 ${context.weeklyMinutes} 分钟`);
    lines.push(`- 连续练习天数：${context.streak} 天`);
    if (context.activeName) {
      lines.push(`- 正在练习：${context.activeName}（已练 ${context.activeMinutes} 分钟）`);
    }
    if (context.todayTotalMinutes === 0 && !context.activeName) {
      lines.push('- 今天还没有开始练习');
    }
  } else {
    lines.push('My practice data:');
    lines.push(`- Today: ${context.todayTotalMinutes} minutes total`);
    for (const item of context.todayTotals) {
      lines.push(`  - ${item.name}: ${item.minutes} min`);
    }
    lines.push(`- This week: ${context.weeklyMinutes} minutes total`);
    lines.push(`- Practice streak: ${context.streak} days in a row`);
    if (context.activeName) {
      lines.push(`- Currently practicing: ${context.activeName} (${context.activeMinutes} min into session)`);
    }
    if (context.todayTotalMinutes === 0 && !context.activeName) {
      lines.push("- Haven't started practicing today yet");
    }
  }
  return lines.join('\n');
}

function getRandomFallback(language) {
  const pool = language === 'zh' ? FALLBACK_ZH : FALLBACK_EN;
  return pool[Math.floor(Math.random() * pool.length)];
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

        const trimmed = result.trim();
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
