import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
import '@fontsource-variable/noto-sans-jp'
import '@fontsource-variable/jetbrains-mono'
import './styles/global.css'
import App from './App'

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
