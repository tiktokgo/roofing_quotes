/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep pdf-parse (and its pdfjs-dist dependency) as external modules so that
  // relative file paths inside the package (e.g. './pdf.worker.mjs') resolve
  // correctly at runtime instead of breaking when Next.js bundles server code.
  // Note: Next.js 14 uses experimental.serverComponentsExternalPackages (renamed in v15).
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse"],
  },

  async headers() {
    return [
      {
        source: "/chat",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
