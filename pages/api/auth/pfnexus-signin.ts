import { NextApiRequest, NextApiResponse } from "next";

import { encode } from "next-auth/jwt";

import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const sessionId = req.cookies.sessionId;
  const callbackUrl = (req.query.callbackUrl as string) || "/dashboard";

  if (!sessionId) {
    console.log("pfnexus-signin no session id");
    return res.redirect("/login");
  }

  try {
    // Validate with PF Nexus
    const response = await fetch(
      "https://api.staging-pfnexus.com/api/access/session",
      {
        headers: {
          Cookie: `sessionId=${sessionId}`,
        },
      },
    );

    if (!response.ok) {
      console.log("pfnexus-signin no response");
      return res.redirect("/login");
    }

    const { user: pfUser } = await response.json();
    console.log("pfnexus-signin pfUser:", JSON.stringify(pfUser));

    // Find or create user in Papermark database
    let user = await prisma.user.findUnique({
      where: { email: pfUser.email },
    });
    console.log("pfnexus-signin user:", JSON.stringify(user));

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: pfUser.email,
          name: `${pfUser.firstname} ${pfUser.lastname}`,
          emailVerified: pfUser.emailverified === "Yes" ? new Date() : null,
        },
      });
      console.log("pfnexus-signin created user:", JSON.stringify(user));
    }

    // Create NextAuth JWT token manually
    const token = await encode({
      token: {
        sub: user.id,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        },
      },
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    console.log("pfnexus-signin created token");

    // Set the NextAuth session cookie
    const isProduction = process.env.VERCEL_ENV === "production";
    const isVercelDeployment = !!process.env.VERCEL_URL;

    console.log("pfnexus-signin VERCEL_ENV " + process.env.VERCEL_ENV);
    console.log("pfnexus-signin VERCEL_URL " + process.env.VERCEL_URL);

    const cookieName = isVercelDeployment
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token";

    const cookieDomain = isVercelDeployment
      ? isProduction
        ? ".papermark.com"
        : ".staging-pfnexus.com"
      : undefined;

    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; ${cookieDomain ? `Domain=${cookieDomain}; ` : ""}${isVercelDeployment ? "Secure; " : ""}Max-Age=${30 * 24 * 60 * 60}`,
    );

    console.log("pfnexus-signin set cookie, redirecting to:", callbackUrl);

    // Redirect to the callback URL
    return res.redirect(callbackUrl);
  } catch (error) {
    console.error("PF Nexus signin error:", error);
    return res.redirect("/login");
  }
}
