import { defineConfig } from 'vite';

// Relative base so the build works both on a GitHub Pages project URL
// (madshjelm.github.io/sonicpixels-v2/) and on the custom domain
// (sonicpixels.dk) with no further configuration.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
});
