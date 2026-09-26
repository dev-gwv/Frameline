import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Outlet, ScrollRestoration, useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'
import { Button } from '@frameline/ui'
import { Landing } from './pages/Landing'
import { EventLayout } from './pages/EventLayout'
import { EventHome } from './pages/EventHome'
import { PersonalLink } from './pages/PersonalLink'
import { NotFound } from './pages/NotFound'
import { StatePage } from './components/common'

/** Secondary screens load on demand so the first open from WhatsApp stays small. */
function page<T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) {
  const C = lazy(() => load().then((m) => ({ default: m[name] as ComponentType })))
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center" aria-busy><span className="size-7 animate-spin rounded-full border-[3px] border-accent border-r-transparent" aria-hidden /></div>}>
      <C />
    </Suspense>
  )
}

function Root() {
  return (
    <>
      <ScrollRestoration getKey={(loc) => (loc.pathname.includes('/p/') ? 'viewer' : loc.key)} />
      <Outlet />
    </>
  )
}

function RouteError() {
  const err = useRouteError()
  if (isRouteErrorResponse(err) && err.status === 404) return <NotFound />
  return (
    <StatePage title="Something went wrong" body="The page hit an error. Reload to try again — your favourites and downloads are safe.">
      <div className="flex gap-2">
        <Button size="lg" onClick={() => location.reload()}>Reload</Button>
        <Link to="/"><Button variant="primary" size="lg">Home</Button></Link>
      </div>
    </StatePage>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/s/:token', element: <PersonalLink /> },
      { path: '/v/:token', element: <PersonalLink /> },
      { path: '/studio/:followCode', element: page(() => import('./pages/StudioProfile'), 'StudioProfile') },
      {
        path: '/:shortId',
        element: <EventLayout />,
        children: [
          { index: true, element: <EventHome /> },
          { path: 'me', element: page(() => import('./pages/MyPhotos'), 'MyPhotos') },
          { path: 'favourites', element: page(() => import('./pages/Favourites'), 'Favourites') },
          { path: 'orders', element: page(() => import('./pages/MyOrders'), 'MyOrders') },
          { path: 'a/:albumId', element: page(() => import('./pages/AlbumView'), 'AlbumView') },
          { path: 'p/:photoId', element: page(() => import('./pages/PhotoView'), 'PhotoView') },
          { path: '*', element: <NotFound /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])
