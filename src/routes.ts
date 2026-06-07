import { index, type RouteConfig, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('sticker-drift', 'routes/sticker-drift.tsx'),
  route('breakout-clone', 'routes/breakout-clone.tsx'),
  route('rally-runner', 'routes/rally-runner.tsx'),
  route('hime-run', 'routes/hime-run.tsx'),
  route('pattern-gallery', 'routes/pattern-gallery.tsx'),
  route('tools/hime-run-builder', 'routes/hime-run-builder.tsx'),
] satisfies RouteConfig
