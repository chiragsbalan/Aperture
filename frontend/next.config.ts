import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Avoid picking up unrelated lockfiles outside this monorepo.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
