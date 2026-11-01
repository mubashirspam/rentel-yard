import { NextResponse, type NextRequest } from 'next/server';

/**
 * Development only: let the Flutter app call this API from its own dev
 * server (`flutter run -d chrome` serves on a random localhost port).
 *
 * Production stays same-origin with no CORS at all — the Flutter web build
 * is meant to be served from this site (docs/flutter, PLAN B2).
 */
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)(:\d+)?$/;

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return NextResponse.next();

  const origin = request.headers.get('origin');
  if (!origin || !DEV_ORIGIN.test(origin)) return NextResponse.next();

  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };

  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers });

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

export const config = { matcher: '/api/:path*' };
