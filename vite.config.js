import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],

	// Optimize dependencies
	optimizeDeps: {
		include: ['rxjs', 'nostr-tools']
	},

	// Build options
	build: {
		target: 'esnext',
		minify: 'esbuild'
	},

	// Dev server options
	server: {
		port: 5174,
		watch: {
			ignored: ['**/build/**']
		}
	}
});
