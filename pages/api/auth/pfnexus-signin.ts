import { NextApiRequest, NextApiResponse } from "next";

//import { setCookie } from "nookies";

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
    console.log("pfnexus-signin existing user:", JSON.stringify(user));

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

    // Create an Account record for this user (required by NextAuth)
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId: user.id,
        provider: "pfnexus",
      },
    });

    if (!existingAccount) {
      await prisma.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "pfnexus",
          providerAccountId: pfUser.id.toString(),
        },
      });
      console.log("pfnexus-signin created account");
    }

    //const cookieValue = `pfnexus-user-id=${user.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; ${process.env.VERCEL_URL ? "Secure;" : ""}`;
    const cookieValue = `pfnexus-user-id=${user.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure;`;
    console.log("pfnexus-signin cookieValue: " + cookieValue);

    // Store user ID in a temporary cookie that we'll use in the client
    res.setHeader("Set-Cookie", cookieValue);

    console.log("pfnexus-signin redirecting to auto-signin page");

    // Redirect to a client-side page that will complete the signin
    return res.redirect("/pfnexus-auto-signin-complete");
  } catch (error) {
    console.error("PF Nexus signin error:", error);
    return res.redirect("/login");
  }
}
