import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { parseCatalog } from './src/catalog.ts';

export default defineConfig({
  base: process.env.READER_BASE_PATH || '/',
  publicDir: false,
  plugins: [{
    name: 'encrypted-novel-assets',
    generateBundle() {
      // The catalog is the publication list. Unlisted files must not be deployed.
      const directory = new URL('./novels/', import.meta.url);
      const index = readFileSync(new URL('index.json', directory), 'utf8');
      const novels = parseCatalog(JSON.parse(index));
      this.emitFile({ type: 'asset', fileName: 'novels/index.json', source: index });
      for (const novel of novels) {
        this.emitFile({
          type: 'asset',
          fileName: `novels/${novel.filename}`,
          source: readFileSync(new URL(encodeURIComponent(novel.filename), directory)),
        });
      }
      this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' });
    },
  }],
});
