import { index, type RouteConfig, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('sticker-drift', 'routes/sticker-drift.tsx'),
  route('breakout-clone', 'routes/breakout-clone.tsx'),
  route('rally-runner', 'routes/rally-runner.tsx'),
] satisfies RouteConfig
