import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { LanguageProvider } from './contexts/LanguageContext'
import { BackendProvider } from './contexts/BackendContext'
import { AuthProvider } from './contexts/AuthContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <BackendProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BackendProvider>
    </LanguageProvider>
  </StrictMode>,
)
