import { Component } from 'react';

// Class component because React error boundaries require lifecycle methods.
// Text is intentionally English-only fallback strings: a render crash may
// have broken the LanguageProvider tree, so we cannot rely on t() here.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 bg-gray-100 dark:bg-slate-900 p-6 text-center">
          <p className="text-gray-700 dark:text-slate-200 font-medium">
            Something went wrong.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-indigo-600 rounded-lg hover:bg-blue-700 dark:hover:bg-indigo-700"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
