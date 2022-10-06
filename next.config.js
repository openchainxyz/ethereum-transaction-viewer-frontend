/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    output: "standalone",

    // remove these later
    typescript: {
        ignoreBuildErrors: true,
    }, eslint: {
        ignoreDuringBuilds: true,
    },
}

module.exports = nextConfig
