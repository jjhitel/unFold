import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

export default defineConfig({
    plugins: [
        webExtension({
            manifest: resolve(__dirname, 'manifest.json'),
        }),
    ],
    build: {
        outDir: 'dist',
    },
});
