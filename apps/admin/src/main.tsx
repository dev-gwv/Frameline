import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ToastProvider, TooltipProvider } from '@frameline/ui'
import { ApiProvider } from './lib/api'
import { AuthProvider } from './lib/auth'
import { UploadProvider } from './layout/UploadDock'
import { router } from './routes'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ApiProvider>
        <AuthProvider>
          <TooltipProvider>
            <UploadProvider>
              <RouterProvider router={router} />
            </UploadProvider>
          </TooltipProvider>
        </AuthProvider>
      </ApiProvider>
    </ToastProvider>
  </StrictMode>,
)
