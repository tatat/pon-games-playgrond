import type { Config } from '@react-router/dev/config'
import pkg from './package.json'

export default {
  ssr: false,
  prerender: true,
  appDirectory: 'src',
  basename: `/${pkg.name}/`,
  buildDirectory: 'dist',
  future: {
    v8_viteEnvironmentApi: true,
  },
} satisfies Config
