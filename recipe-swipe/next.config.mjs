/** @type {import('next').NextConfig} */
const nextConfig = {
  // Recipe images are remote (e.g. TheMealDB). We use plain <img> for the MVP to
  // avoid per-domain config; revisit next/image optimization in Phase 3.
  reactStrictMode: true,
};

export default nextConfig;
