import { createContext, useContext, useState, useCallback } from 'react';

const translations = {
  en: {
    appName: 'Drummate',
    practice: 'Practice',
    report: 'Report',
    metronome: 'Metronome',
    addItem: 'Add Practice Item',
    duplicateItem: 'A practice item with this name already exists.',
    enterName: 'Enter practice item name',
    newItemPlaceholder: 'New practice item...',
    add: 'Add',
    cancel: 'Cancel',
    edit: 'Edit',
    done: 'Done',
    delete: 'Delete',
    start: 'Start',
    stop: 'Stop',
    today: 'Today',
    yesterday: 'Yesterday',
    totalPracticeTime: 'Total Practice Time',
    minutes: 'minutes',
    noPracticeRecorded: 'No practice recorded',
    noPracticeItems: 'No practice items configured. Go to Practice to add some!',
    generateReport: 'Generate Report',
    dailyReport: 'Daily Report',
    copyToClipboard: 'Copy to Clipboard',
    copied: 'Copied!',
    close: 'Close',
    date: 'Date',
    total: 'Total',
    tapTempo: 'Tap Tempo',
    bpm: 'BPM',
    sequencer: 'Complex Rhythm',
    sequencerEditSlot: 'Editing Slot',
    sequencerTapToAdd: 'Tap to add',
    sequencerEmpty: 'Tap a subdivision below to start building your rhythm',
    rest: 'Rest',
    soundTypes: {
      click: 'Click',
      woodBlock: 'Wood',
      hiHat: 'Hi-Hat',
      rimshot: 'Rimshot',
      beep: 'Beep',
    },
    tempoNames: {
      grave: 'Grave',
      largo: 'Largo',
      larghetto: 'Larghetto',
      adagio: 'Adagio',
      andante: 'Andante',
      moderato: 'Moderato',
      allegro: 'Allegro',
      vivace: 'Vivace',
      presto: 'Presto',
      prestissimo: 'Prestissimo',
    },
    auth: {
      signIn: 'Sign In',
      signUp: 'Sign Up',
      signOut: 'Sign Out',
      email: 'Email',
      password: 'Password',
      name: 'Display Name',
      noAccount: "Don't have an account?",
      hasAccount: 'Already have an account?',
      syncing: 'Syncing...',
      sessionExpired: 'Session expired. Please sign in again.',
    },
    settings: 'Settings',
    language: 'Language',
    handsFree: {
      title: 'Hands-Free Mode',
      description: 'Say "Drummate" to activate',
      detected: 'Listening...',
      listening: 'Listening for command...',
      commandError: "Didn't understand that command",
      commandConfirm: 'Command received',
      micPermission: 'Microphone permission required',
      loading: 'Loading voice models...',
      error: 'Voice detection error',
      unsupportedBrowser: 'Hands-free mode is only supported in Chrome.',
    },
  },
  zh: {
    appName: 'Drummate',
    practice: '练习',
    report: '报告',
    metronome: '节拍器',
    addItem: '添加练习项目',
    duplicateItem: '已存在同名的练习项目。',
    enterName: '输入练习项目名称',
    newItemPlaceholder: '新练习项目...',
    add: '添加',
    cancel: '取消',
    edit: '编辑',
    done: '完成',
    delete: '删除',
    start: '开始',
    stop: '停止',
    today: '今天',
    yesterday: '昨天',
    totalPracticeTime: '总练习时间',
    minutes: '分钟',
    noPracticeRecorded: '未记录练习',
    noPracticeItems: '未配置练习项目。前往练习页面添加！',
    generateReport: '生成报告',
    dailyReport: '每日报告',
    copyToClipboard: '复制到剪贴板',
    copied: '已复制！',
    close: '关闭',
    date: '日期',
    total: '总计',
    tapTempo: '敲击节拍',
    bpm: 'BPM',
    sequencer: '复杂节奏',
    sequencerEditSlot: '编辑节拍',
    sequencerTapToAdd: '点击添加',
    sequencerEmpty: '点击下方的节奏类型开始构建',
    rest: '休止',
    soundTypes: {
      click: '咔嗒',
      woodBlock: '木块',
      hiHat: '踩镲',
      rimshot: '边击',
      beep: '蜂鸣',
    },
    tempoNames: {
      grave: '极慢板',
      largo: '广板',
      larghetto: '小广板',
      adagio: '柔板',
      andante: '行板',
      moderato: '中板',
      allegro: '快板',
      vivace: '活泼的快板',
      presto: '急板',
      prestissimo: '最急板',
    },
    auth: {
      signIn: '登录',
      signUp: '注册',
      signOut: '退出',
      email: '邮箱',
      password: '密码',
      name: '显示名称',
      noAccount: '没有账号？',
      hasAccount: '已有账号？',
      syncing: '同步中...',
      sessionExpired: '会话已过期，请重新登录。',
    },
    settings: '设置',
    language: '语言',
    handsFree: {
      title: '免提模式',
      description: '说 "Drummate" 来激活',
      detected: '正在听...',
      listening: '正在聆听指令...',
      commandError: '没有识别到指令',
      commandConfirm: '指令已接收',
      micPermission: '需要麦克风权限',
      loading: '正在加载语音模型...',
      error: '语音检测错误',
      unsupportedBrowser: '免提模式仅支持 Chrome 浏览器。',
    },
  },
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('en');

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === 'en' ? 'zh' : 'en'));
  }, []);

  const t = useCallback(
    (key) => {
      const keys = key.split('.');
      let value = translations[language];
      for (const k of keys) {
        value = value?.[k];
      }
      return value || key;
    },
    [language],
  );

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
