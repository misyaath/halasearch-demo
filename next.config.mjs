/** @type {import('next').NextConfig} */
const nextConfig = {
    // If you are on Next.js 15, use this:
    serverExternalPackages: ['crawlee', 'playwright', '@crawlee/playwright'],

    // If you are on Next.js 13 or 14, uncomment the experimental block below instead:
    /*
    experimental: {
      serverExternalPackages: ['crawlee', 'playwright', '@crawlee/playwright'],
    }
    */
};

export default nextConfig;