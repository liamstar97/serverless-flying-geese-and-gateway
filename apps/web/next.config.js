/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  output: 'standalone',
};
module.exports = nextConfig;
