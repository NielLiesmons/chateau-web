import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: false
	},
	kit: {
		adapter: adapter({
			pages: '.vercel/output/static',
			assets: '.vercel/output/static',
			fallback: 'index.html',
			precompress: false,
			strict: false
		})
	}
};

export default config;
