const isProduction = process.env.NODE_ENV === 'production'

function getConnectSrcPolicy() {
  const connectSources = new Set(["'self'"])

  if (!isProduction) {
    connectSources.add('http:')
    connectSources.add('https:')
    connectSources.add('ws:')
    connectSources.add('wss:')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl) {
    try {
      connectSources.add(new URL(supabaseUrl).origin)
    } catch {
      // Let the app surface the invalid URL through the auth client setup.
    }
  }

  return Array.from(connectSources).join(' ')
}

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src ${getConnectSrcPolicy()}`,
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      ...(isProduction ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
