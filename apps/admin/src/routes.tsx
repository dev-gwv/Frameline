import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { RequireAuth } from './lib/auth'
import { RouteError, PageFallback } from './pages/system'

const page = (load: () => Promise<{ default: ComponentType }>) => {
  const C = lazy(load)
  return <Suspense fallback={<PageFallback />}><C /></Suspense>
}

/**
 * Route table. Screens map 1:1 to the design artifact (docs/design/frameline-design.html).
 * Modals that deserve deep links use search params, e.g. /events/:id?modal=share&tab=personal.
 */
export const router = createBrowserRouter([
  { path: '/login', element: page(() => import('./pages/auth/SignIn')), errorElement: <RouteError /> },
  { path: '/setup', element: <RequireAuth>{page(() => import('./pages/auth/Setup'))}</RequireAuth>, errorElement: <RouteError /> },
  {
    element: <RequireAuth><Outlet /></RequireAuth>,
    errorElement: <RouteError />,
    children: [
      // Full-screen photo viewer, outside the shell.
      { path: '/events/:eventId/photos/:photoId', element: page(() => import('./pages/viewer/PhotoViewer')) },
      // Event workspace uses the collapsed sidebar.
      { element: <AppShell collapsed />, children: [
        { path: '/events/:eventId', element: page(() => import('./pages/workspace/Workspace')) },
      ] },
      { element: <AppShell />, children: [
        { index: true, element: page(() => import('./pages/home/Home')) },
        { path: '/events', element: page(() => import('./pages/events/Events')) },
        { path: '/events/:eventId/settings', element: page(() => import('./pages/event-settings/EventSettings')) },
        { path: '/events/:eventId/guests', element: page(() => import('./pages/guests/Guests')) },
        { path: '/store', element: page(() => import('./pages/store/Store')) },
        { path: '/store/settings', element: page(() => import('./pages/store/StoreSettings')) },
        { path: '/wallet', element: page(() => import('./pages/wallet/Wallet')) },
        { path: '/reports', element: page(() => import('./pages/reports/Reports')) },
        { path: '/website', element: page(() => import('./pages/website/Website')) },
        { path: '/studio-app', element: page(() => import('./pages/studio-app/StudioApp')) },
        { path: '/qr', element: page(() => import('./pages/qr/SmartQR')) },
        { path: '/broadcasts', element: page(() => import('./pages/broadcasts/Broadcasts')) },
        { path: '/watermarks', element: page(() => import('./pages/watermarks/Watermarks')) },
        { path: '/camera-sync', element: page(() => import('./pages/camera-sync/CameraSync')) },
        { path: '/enhance', element: page(() => import('./pages/enhance/Enhance')) },
        { path: '/enhance/:photoId', element: page(() => import('./pages/enhance/Enhance')) },
        { path: '/plan', element: page(() => import('./pages/plan/Plan')) },
        { path: '/support', element: page(() => import('./pages/support/Support')) },
        { path: '/settings', element: page(() => import('./pages/settings/Settings')) },
        { path: '/settings/:tab', element: page(() => import('./pages/settings/Settings')) },
        { path: '*', element: page(() => import('./pages/NotFound')) },
      ] },
    ],
  },
])
