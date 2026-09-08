import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.READER_BASE_PATH || '/',
  publicDir: false,
  plugins: [{
    name: 'encrypted-novel-assets',
    generateBundle() {
      // Keep the existing novels/ directory and encryption command. Only these
      // public assets enter dist; source files and encryption tools do not.
      const directory = new URL('./novels/', import.meta.url);
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isFile() || (entry.name !== 'index.json' && !entry.name.endsWith('.encrypted'))) continue;
        this.emitFile({
          type: 'asset',
          fileName: `novels/${entry.name}`,
          source: readFileSync(new URL(encodeURIComponent(entry.name), directory)),
        });
      }
      this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' });
    },
  }],
});
