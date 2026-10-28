import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'
import { BrandingProvider } from './context/BrandingContext.tsx'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '184434314249-50qqpe7sqj1a2qtn319git947v0ohi8u.apps.googleusercontent.com';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandingProvider>
      <ThemeProvider>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <App />
        </GoogleOAuthProvider>
      </ThemeProvider>
    </BrandingProvider>
  </StrictMode>,
)
