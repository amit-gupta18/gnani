/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@gnani/shared"],
  // Proxy /api/* to the Express API so the browser only ever talks to this
  // Next.js origin. Without this, the API lives on a different site
  // (onrender.com vs vercel.app) and the session cookie becomes a
  // third-party cookie — blocked by Safari ITP, Brave Shields, and
  // (increasingly) Chrome, regardless of how permissive CORS is.
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
