import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The story card reads its fonts and backdrop from disk.
  outputFileTracingIncludes:{'/api/card':['./app/api/card/fonts/**','./public/card/**']},
  images:{qualities:[75,85]},
};

export default nextConfig;
