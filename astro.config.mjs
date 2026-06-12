// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

// https://astro.build/config
export default defineConfig({
  site: 'https://foamoffice.co.uk',
  adapter: cloudflare({
    configPath: './wrangler-worker.json',
  }),
  integrations: [sitemap({
    filter: (page) => !page.includes('/board') && !page.includes('/login') && !page.includes('/admin') && !page.includes('/app'),
  })],
  vite: {
    plugins: [
      tailwindcss(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/paraglide',
        strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
      }),
    ]
  }
});
