import type { MetadataRoute } from 'next';

/**
 * §13 M5 — installable to a phone's home screen.
 *
 * Portrait only and `standalone`: the admin holds this one-handed at a gate,
 * and a browser chrome bar costs 60px of a 360px screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Yard Ledger',
    short_name: 'Yard',
    description: 'Rental management for a construction equipment yard.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4f6f7',
    theme_color: '#2f5169',
    lang: 'en-IN',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Deliver', url: '/issue', description: 'Record equipment leaving the yard' },
      { name: 'Return', url: '/return', description: 'Record equipment coming back' },
    ],
  };
}
