/**
 * voiceFeedback.js — Voice confirmation via browser speechSynthesis API.
 */

export function speak(text, { lang = 'en-US', rate = 1.05, pitch = 1.0 } = {}) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  utterance.pitch = pitch;
  window.speechSynthesis.speak(utterance);
}

export function getLang(appLanguage) {
  return appLanguage === 'zh' ? 'zh-CN' : 'en-US';
}

export function cancelSpeech() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}
