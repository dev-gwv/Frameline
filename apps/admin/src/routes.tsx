import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, Outlet, useSearchParams } from 'react-router-dom'
import { FEATURES } from '@frameline/shared'
import { AppShell } from './layout/AppShell'
import { RequireAuth } from './lib/auth'
import { safeDestination } from './pages/auth/signin/authHelpers'
import { RouteError, PageFallback, TabFallback } from './pages/system'

/**
 * Google sign-in lands here (the redirect target is always /auth/callback, never `from` directly — that's
 * what makes AuthProvider's effect notice the tokens in the URL fragment at all). New studios go to /setup,
 * same as a new email sign-up (?new=1, set by the API); everyone else goes back to where the "Continue with
 * Google" button was clicked from (?from=, set by SignIn.tsx).
 */
function GoogleCallback() {
  const [params] = useSearchParams()
  const isNew = params.get('new') === '1'
  return <Navigate to={isNew ? '/setup' : safeDestination(params.get('from'))} replace />
}

const page = (load: () => Promise<{ default: ComponentType }>) => {
  const C = lazy(load)
  return <Suspense fallback={<PageFallback />}><C /></Suspense>
}
/** Event tabs load under the event header, so their placeholder is just the tab's content shapes. */
const tab = (load: () => Promise<{ default: ComponentType }>) => {
  const C = lazy(load)
  return <Suspense fallback={<TabFallback />}><C /></Suspense>
}

/**
 * Route table (redesign v2, docs/REDESIGN_BRIEF.md "Route map").
 * Modals that deserve deep links use search params: /events/:id?modal=share&tab=qr, /events?new=1, /plan?renew=<id>.
 * Stage-2 agents: edit only the entries for your screens (re-read this file right before editing).
 */
export const router = createBrowserRouter([
  { path: '/login', element: page(() => import('./pages/auth/SignIn')), errorElement: <RouteError /> },
  // Google sign-in returns here; AuthProvider stores the tokens from the URL fragment.
  { path: '/auth/callback', element: <RequireAuth><GoogleCallback /></RequireAuth>, errorElement: <RouteError /> },
  { path: '/setup', element: <RequireAuth>{page(() => import('./pages/auth/Setup'))}</RequireAuth>, errorElement: <RouteError /> },
  {
    element: <RequireAuth><Outlet /></RequireAuth>,
    errorElement: <RouteError />,
    children: [
      // Full-screen photo viewer (dark), outside the shell. Owner: A.
      { path: '/events/:eventId/photos/:photoId', element: page(() => import('./pages/viewer/PhotoViewer')) },
      { element: <AppShell />, children: [
        // ── Home & events (C) ──
        { index: true, element: page(() => import('./pages/home/Home')) },
        { path: '/events', element: page(() => import('./pages/events/Events')) },
        // ── Event page: shared header + tabs (Foundation); tabs owned by A (Photos) and B (Guests, Settings) ──
        { path: '/events/:eventId', element: page(() => import('./pages/event/EventLayout')), children: [
          { index: true, element: tab(() => import('./pages/workspace/Workspace')) },
          { path: 'guests', element: tab(() => import('./pages/guests/Guests')) },
          { path: 'settings', element: tab(() => import('./pages/event-settings/EventSettings')) },
        ] },
        // ── Money & account (D) ──
        { path: '/sell', element: page(() => import('./pages/sell/Sell')) },
        { path: '/sell/orders/:orderId', element: page(() => import('./pages/sell/Sell')) },
        { path: '/sell/settings', element: <Navigate to="/sell/settings/business" replace /> },
        { path: '/sell/settings/:tab', element: page(() => import('./pages/sell/settings/SellSettings')) },
        { path: '/plan', element: page(() => import('./pages/plan/Plan')) },
        { path: '/settings', element: page(() => import('./pages/settings/Settings')) },
        { path: '/settings/:tab', element: page(() => import('./pages/settings/Settings')) },
        { path: '/support', element: page(() => import('./pages/support/Support')) },
        // ── Tools in More (E) ──
        { path: '/watermark', element: page(() => import('./pages/watermarks/Watermarks')) },
        { path: '/camera-sync', element: page(() => import('./pages/camera-sync/CameraSync')) },
        { path: '/qr', element: page(() => import('./pages/qr/SmartQR')) },
        { path: '/messages', element: page(() => import('./pages/broadcasts/Broadcasts')) },
        { path: '/enhance', element: page(() => import('./pages/enhance/Enhance')) },
        { path: '/enhance/:photoId', element: page(() => import('./pages/enhance/Enhance')) },
        { path: '/studio-app', element: page(() => import('./pages/studio-app/StudioApp')) },
        { path: '/reports', element: page(() => import('./pages/reports/Reports')) },
        // Parked behind FEATURES.website; with it off (default), /website falls through to NotFound.
        ...(FEATURES.website ? [{ path: '/website', element: page(() => import('./pages/website/Website')) }] : []),
        // ── Old paths (Foundation) ──
        { path: '/store', element: <Navigate to="/sell" replace /> },
        { path: '/store/settings', element: <Navigate to="/sell/settings/business" replace /> },
        { path: '/wallet', element: <Navigate to="/sell?tab=payouts" replace /> },
        { path: '/broadcasts', element: <Navigate to="/messages" replace /> },
        { path: '/watermarks', element: <Navigate to="/watermark" replace /> },
        { path: '*', element: page(() => import('./pages/NotFound')) },
      ] },
    ],
  },
])
