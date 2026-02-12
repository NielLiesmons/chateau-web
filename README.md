# Chateau Landing Page

A modern landing page for Chateau - an open community app platform.

Built with:
- **SvelteKit 2** with Svelte 5 (runes mode)
- **Tailwind CSS 4**
- **Vercel Adapter** for deployment

## Features

- Parallax hero section with content type emojis
- Responsive design
- "Coming Soon" modal for early interest
- Custom Chateau branding with gradient logo

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Deployment to Vercel

1. Push this repository to GitHub
2. Import the project in Vercel
3. Vercel will automatically detect SvelteKit and use the correct settings
4. Deploy!

The `vercel.json`, `.nvmrc`, and `pnpm-lock.yaml` are already configured for optimal deployment.

## Project Structure

```
src/
├── routes/
│   ├── +layout.svelte    # Main layout with global styles
│   └── +page.svelte       # Landing page
├── lib/
│   └── components/
│       ├── Header.svelte        # Top navigation
│       ├── ParallaxHero.svelte  # Hero section with animations
│       └── Modal.svelte         # Reusable modal component
└── app.css               # Global styles and design tokens
```

## Design

The design uses a custom color system based on HSL values with Tailwind CSS 4, matching the Zapstore design language while featuring Chateau's unique branding.
