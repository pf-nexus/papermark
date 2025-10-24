import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

import AppMiddleware from "@/lib/middleware/app";
import DomainMiddleware from "@/lib/middleware/domain";

import { BLOCKED_PATHNAMES } from "./lib/constants";
import IncomingWebhookMiddleware, {
  isWebhookPath,
} from "./lib/middleware/incoming-webhooks";
import PostHogMiddleware from "./lib/middleware/posthog";
import { getToken } from "next-auth/jwt";

function isAnalyticsPath(path: string) {
  // Create a regular expression
  // ^ - asserts position at start of the line
  // /ingest/ - matches the literal string "/ingest/"
  // .* - matches any character (except for line terminators) 0 or more times
  const pattern = /^\/ingest\/.*/;

  return pattern.test(path);
}

function isCustomDomain(host: string) {
  return (
    (process.env.NODE_ENV === "development" &&
      (host?.includes(".local") || host?.includes("papermark.dev"))) ||
    (process.env.NODE_ENV !== "development" &&
      !(
        host?.includes("localhost") ||
        host?.includes("papermark.io") ||
        host?.includes("papermark.com") ||
        host?.includes("staging-pfnexus.com") ||
        host?.endsWith(".vercel.app")
      ))
  );
}

export const config = {
  matcher: [
    /*
     * Match all paths except for:
     * 1. /api/ routes
     * 2. /_next/ (Next.js internals)
     * 3. /_static (inside /public)
     * 4. /_vercel (Vercel internals)
     * 5. /favicon.ico, /sitemap.xml (static files)
     */
    "/((?!api/|_next/|_static|vendor|_icons|_vercel|favicon.ico|sitemap.xml).*)",
  ],
};

export default async function middleware(req: NextRequest, ev: NextFetchEvent) {
  const path = req.nextUrl.pathname;
  const host = req.headers.get("host");

  // NEW: Check for PF Nexus session (staging)
  // const sessionId = req.cookies.get('sessionId');
  // const nextAuthToken = req.cookies.get('__Secure-next-auth.session-token') || 
  //                       req.cookies.get('next-auth.session-token');
  
  // Only check on datarooms subdomain
  // if (host?.includes('datarooms.staging-pfnexus.com') && 
  //     sessionId && 
  //     !nextAuthToken && 
  //     !path.startsWith('/api/auth')) {
  //   // Has PF Nexus session but no NextAuth session
  //   // Redirect to NextAuth callback to create session
  //   return NextResponse.redirect(
  //     new URL(`/api/auth/callback/pfnexus`, req.url)
  //   );
  // }
  const sessionId = req.cookies.get('sessionId')?.value;
  
  if (host?.includes('datarooms.staging-pfnexus.com') && 
      sessionId && 
      !path.startsWith('/api/') &&
      !path.startsWith('/_next/') &&
      path !== '/pfnexus-auto-signin') {
    
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    
    if (!token) {
      // Redirect to a page that will trigger signin
      return NextResponse.redirect(new URL('/pfnexus-auto-signin', req.url));
    }
  }

  if (isAnalyticsPath(path)) {
    return PostHogMiddleware(req);
  }

  // Handle incoming webhooks
  if (isWebhookPath(host)) {
    return IncomingWebhookMiddleware(req);
  }

  // For custom domains, we need to handle them differently
  if (isCustomDomain(host || "")) {
    return DomainMiddleware(req);
  }

  // Handle standard papermark.io paths
  if (
    !path.startsWith("/view/") &&
    !path.startsWith("/verify") &&
    !path.startsWith("/unsubscribe")
  ) {
    return AppMiddleware(req);
  }

  // Check for blocked pathnames in view routes
  if (
    path.startsWith("/view/") &&
    (BLOCKED_PATHNAMES.some((blockedPath) => path.includes(blockedPath)) ||
      path.includes("."))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/404";
    return NextResponse.rewrite(url, { status: 404 });
  }

  return NextResponse.next();
}
