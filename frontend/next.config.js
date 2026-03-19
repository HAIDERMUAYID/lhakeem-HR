/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fix monorepo-style root inference when multiple lockfiles exist
  outputFileTracingRoot: __dirname,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*` },
    ];
  },
};

module.exports = nextConfig;
