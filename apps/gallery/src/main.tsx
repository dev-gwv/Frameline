import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ToastProvider, TooltipProvider } from '@frameline/ui'
import { ApiProvider } from './lib/api'
import { initPwa } from './lib/pwa'
import { router } from './routes'
import './index.css'

initPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ApiProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </ApiProvider>
    </ToastProvider>
  </StrictMode>,
)
