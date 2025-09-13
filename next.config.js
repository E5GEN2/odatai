/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Ignore Node.js built-in modules in client-side bundles
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        buffer: false,
        util: false,
        url: false,
        querystring: false,
        http: false,
        https: false,
        net: false,
        tls: false,
        child_process: false,
        worker_threads: false,
        cluster: false,
        dgram: false,
        dns: false,
        readline: false,
        repl: false,
        tty: false,
        zlib: false,
        events: false,
        assert: false,
        constants: false,
        vm: false,
        timers: false,
        console: false,
        process: false
      };

      // Ignore problematic modules that try to use Node.js APIs
      config.resolve.alias = {
        ...config.resolve.alias,
        'redis': false,
        'pg': false,
        'mysql': false,
        'mysql2': false,
        'sqlite3': false,
        'better-sqlite3': false
      };
    }

    return config;
  }
};

module.exports = nextConfig;