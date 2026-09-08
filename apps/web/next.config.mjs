/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-leaflet v4 re-initialises its map container under React 18 StrictMode's
  // dev-only double-effect ("Map container is already initialized."). StrictMode
  // is a development aid with no effect on the production build, so it is turned
  // off here to keep the dev server usable with the interactive map.
  reactStrictMode: false,
  // Compile the workspace packages from their TypeScript source.
  transpilePackages: [
    '@coalguard/types',
    '@coalguard/config',
    '@coalguard/ui',
    '@coalguard/ai',
    'react-leaflet',
    '@react-leaflet/core',
  ],
  experimental: {
    // allow importing files from the monorepo root
    externalDir: true,
    // per-icon / per-module chunking instead of pulling whole barrels into the
    // route bundle (keeps the dashboard's first-load JS lean).
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

export default nextConfig;
