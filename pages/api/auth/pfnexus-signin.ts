import { NextApiRequest, NextApiResponse } from "next";

import { getServerSession } from "next-auth/next";

import prisma from "@/lib/prisma";

import { authOptions } from "./[...nextauth]";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const sessionId = req.cookies.sessionId;
  const callbackUrl = (req.query.callbackUrl as string) || "/dashboard";

  if (!sessionId) {
    console.log("pfnexus-signin no session id ");

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
      console.log("pfnexus-signin no response  ");
      return res.redirect("/login");
    }

    const { user: pfUser } = await response.json();

    console.log("pfnexus-signin pfUser:  " + JSON.stringify(pfUser));

    // Find or create user in Papermark database
    let user = await prisma.user.findUnique({
      where: { email: pfUser.email },
    });
    console.log("pfnexus-signin user:  " + JSON.stringify(user));

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: pfUser.email,
          name: `${pfUser.firstname} ${pfUser.lastname}`,
          emailVerified: pfUser.emailverified === "Yes" ? new Date() : null,
        },
      });
    }
    console.log("pfnexus-signin user 2:  " + JSON.stringify(user));

    // Create NextAuth session manually
    // This is a hack for the spike - in production you'd want a proper flow
    const session = await getServerSession(req, res, authOptions);

    console.log("pfnexus-signin session :  " + JSON.stringify(session));

    // For spike: Just redirect and let the user login normally
    // In a full implementation, you'd need to set the session token cookie here
    return res.redirect(callbackUrl);
  } catch (error) {
    console.error("PF Nexus signin error:", error);
    return res.redirect("/login");
  }
}
