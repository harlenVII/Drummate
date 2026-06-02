import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './services/themeService.js'
import App from './App.jsx'
import { LanguageProvider } from './contexts/LanguageContext'
import { AuthProvider } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
