import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

import { getToken } from "next-auth/jwt";

import AppMiddleware from "@/lib/middleware/app";
import DomainMiddleware from "@/lib/middleware/domain";

import { BLOCKED_PATHNAMES } from "./lib/constants";
import IncomingWebhookMiddleware, {
  isWebhookPath,
} from "./lib/middleware/incoming-webhooks";
import PostHogMiddleware from "./lib/middleware/posthog";

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

  console.log("middleware 1 path:", path);

  if (isAnalyticsPath(path)) {
    return PostHogMiddleware(req);
  }

  // Handle incoming webhooks
  if (isWebhookPath(host)) {
    return IncomingWebhookMiddleware(req);
  }

  // PF Nexus SSO Check - Do this BEFORE other middleware
  const sessionId = req.cookies.get("sessionId")?.value;

  if (
    host?.includes("datarooms.staging-pfnexus.com") &&
    sessionId &&
    !path.startsWith("/api/") &&
    !path.startsWith("/_next/") &&
    !path.startsWith("/login") &&
    !path.startsWith("/register") &&
    path !== "/pfnexus-auto-signin"
  ) {
    console.log("middleware 2 - checking PF Nexus session");

    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    console.log("middleware 2, token exists:", !!token);

    if (!token) {
      console.log(
        "middleware 2 - no token, redirecting to pfnexus-auto-signin",
      );
      // Redirect to a page that will trigger signin
      return NextResponse.redirect(new URL("/pfnexus-auto-signin", req.url));
    } else {
      console.log("middleware 2 - token found, continuing to AppMiddleware");
      console.log("middleware 2, token.sub:", token?.sub);
      // Token exists, continue to normal flow
    }
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
    console.log("middleware 3 - calling AppMiddleware");

    // DEBUG: Check token one more time
    const tokenCheck = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    console.log(
      "middleware 3 - token before AppMiddleware:",
      !!tokenCheck,
      tokenCheck?.sub,
    );
    console.log("middleware 3 - full token:", JSON.stringify(tokenCheck));

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
