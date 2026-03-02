import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import svelteConfig from './svelte.config.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
	js.configs.recommended,
	...svelte.configs.recommended,

	// ── Ignore generated / third-party output ────────────────────────────────
	{
		ignores: [
			'.svelte-kit/**',
			'.vercel/**',
			'build/**',
			'node_modules/**',
			'static/**'
		]
	},

	// ── Global environment (browser + Node + service worker) ─────────────────
	{
		languageOptions: {
			globals: {
				// Browser
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				console: 'readonly',
				location: 'readonly',
				history: 'readonly',
				localStorage: 'readonly',
				sessionStorage: 'readonly',
				performance: 'readonly',
				// Timers / async
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				queueMicrotask: 'readonly',
				requestAnimationFrame: 'readonly',
				cancelAnimationFrame: 'readonly',
				// Network / streams
				fetch: 'readonly',
				Response: 'readonly',
				Request: 'readonly',
				Headers: 'readonly',
				ReadableStream: 'readonly',
				FormData: 'readonly',
				AbortController: 'readonly',
				// Encoding / crypto
				TextEncoder: 'readonly',
				TextDecoder: 'readonly',
				btoa: 'readonly',
				atob: 'readonly',
				crypto: 'readonly',
				// File / data
				File: 'readonly',
				Blob: 'readonly',
				DataTransfer: 'readonly',
				// DOM globals
				Element: 'readonly',
				HTMLElement: 'readonly',
				HTMLInputElement: 'readonly',
				Image: 'readonly',
				SVGElement: 'readonly',
				Node: 'readonly',
				Text: 'readonly',
				Event: 'readonly',
				EventTarget: 'readonly',
				CustomEvent: 'readonly',
				MouseEvent: 'readonly',
				KeyboardEvent: 'readonly',
				MutationObserver: 'readonly',
				ResizeObserver: 'readonly',
				IntersectionObserver: 'readonly',
				DOMRect: 'readonly',
				// Storage
				indexedDB: 'readonly',
				IDBKeyRange: 'readonly',
				// Service worker
				self: 'readonly',
				caches: 'readonly',
				// Misc
				structuredClone: 'readonly',
				WebSocket: 'readonly',
				Promise: 'readonly',
				Set: 'readonly',
				Map: 'readonly',
				URL: 'readonly',
				URLSearchParams: 'readonly',
				// Node / CommonJS
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				exports: 'readonly',
				global: 'readonly'
			}
		}
	},

	// ── Svelte file parser ────────────────────────────────────────────────────
	{
		files: ['**/*.svelte', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				extraFileExtensions: ['.svelte'],
				svelteConfig
			}
		}
	},

	// ── Rule overrides ────────────────────────────────────────────────────────
	{
		rules: {
			// Navigation: the codebase uses goto() / href directly everywhere —
			// adopting resolve() would require a full codebase refactor.
			'svelte/no-navigation-without-resolve': 'off',

			// Each-key: a performance hint; does not affect correctness.
			'svelte/require-each-key': 'off',

			// Svelte reactivity: replacing Set/Map with SvelteSet/SvelteMap
			// throughout is a risky change; reactive state is managed explicitly.
			'svelte/prefer-svelte-reactivity': 'off',

			// {@html}: all HTML comes from our own markdown renderer (marked),
			// not from user-supplied strings.
			'svelte/no-at-html-tags': 'off',

			// Stale svelte-ignore comments are noisy but harmless.
			'svelte/no-unused-svelte-ignore': 'off',

			// Immutable reactive statements are pre-existing patterns.
			'svelte/no-immutable-reactive-statements': 'off',
			'svelte/no-reactive-literals': 'off',

			// no-unused-vars: relax to warn so legitimate unused catch params
			// (common pattern: catch(e) when the error is intentionally ignored)
			// and _ prefixed discard params don't fail CI.
			'no-unused-vars': ['error', {
				vars: 'all',
				args: 'after-used',
				caughtErrors: 'none',   // allow empty / unused catch params
				ignoreRestSiblings: true,
				varsIgnorePattern: '^_',
				argsIgnorePattern: '^_'
			}],

			// Empty blocks: allow empty catch blocks (intentional error swallowing).
			'no-empty': ['error', { allowEmptyCatch: true }],

			// Constant binary expressions are pre-existing code patterns.
			'no-constant-binary-expression': 'off'
		}
	}
];
