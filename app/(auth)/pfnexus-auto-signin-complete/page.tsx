"use client";

import { useRouter } from "next/navigation";

import { useEffect } from "react";

import { signIn } from "next-auth/react";

export default function PFNexusAutoSigninComplete() {
  const router = useRouter();

  useEffect(() => {
    const completeSignin = async () => {
      console.log("Completing PF Nexus signin...");

      // This will trigger NextAuth's session creation using the Account we created
      const result = await signIn("pfnexus", {
        redirect: false,
      });

      console.log("Signin result:", result);

      if (result?.ok) {
        console.log("Signin successful, redirecting to dashboard");
        router.push("/dashboard");
      } else {
        console.error("Signin failed:", result?.error);
        router.push("/login");
      }
    };

    completeSignin();
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Signing you in...</h2>
        <p className="mt-2 text-gray-600">Please wait</p>
      </div>
    </div>
  );
}
