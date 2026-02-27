import React from 'react'
import ReactDOM from 'react-dom/client'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './styles/tokens.css'
import './styles/app.css'
import { AppShellContainer } from './app/AppShellContainer'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppShellContainer />
  </React.StrictMode>
)
