import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

// vite.config の alias（@ → src）と React プラグインを継承しつつ、
// jsdom 環境でコンポーネントテストを走らせる設定を重ねる。
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  }),
);
