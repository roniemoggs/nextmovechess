import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap, { ChangeFreqEnum } from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://nextmovechesss.com',
  server: {
    host: true,
    port: 4321,
  },
  vite: {
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'chess.js', 'react-chessboard', 'lucide-react', 'lucide-astro'],
      exclude: ['stockfish.js'],
    },
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes('/404') && !page.includes('/500'),
      serialize(item) {
        const url = item.url;
        if (url === 'https://nextmovechesss.com/' || url === 'https://nextmovechesss.com') {
          item.priority = 1.0;
          item.changefreq = ChangeFreqEnum.DAILY;
        } else if (url.includes('/chess-next-move') || url.includes('/tool')) {
          item.priority = 0.9;
          item.changefreq = ChangeFreqEnum.DAILY;
        } else if (url.includes('/learn')) {
          item.priority = 0.8;
          item.changefreq = ChangeFreqEnum.WEEKLY;
        } else if (url.includes('/how-it-works') || url.includes('/faq') || url.includes('/about')) {
          item.priority = 0.7;
          item.changefreq = ChangeFreqEnum.MONTHLY;
        } else {
          item.priority = 0.5;
          item.changefreq = ChangeFreqEnum.MONTHLY;
        }
        item.lastmod = new Date().toISOString();
        return item;
      },
    }),
  ],
  redirects: {
    '/sitemap.xml': '/sitemap-index.xml',
    '/privacy-policy': '/privacy',
    '/terms-and-conditions': '/terms',
    '/terms-of-service': '/terms',
    '/about-us': '/about',
    '/contact-us': '/contact',
  },
});
