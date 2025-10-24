"use client";

import { useRouter } from "next/navigation";

import { useEffect } from "react";

export default function PFNexusAutoSignin() {
  const router = useRouter();

  useEffect(() => {
    const initiateSignin = async () => {
      console.log("pfnexus-auto-signin page - calling API route");

      // Get the current URL to pass as callback
      const callbackUrl =
        new URLSearchParams(window.location.search).get("callbackUrl") ||
        "/dashboard";

      // Call the API route that validates PF Nexus session
      window.location.href = `/api/auth/pfnexus-signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    };

    initiateSignin();
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Checking authentication...</h2>
        <p className="mt-2 text-gray-600">Please wait</p>
      </div>
    </div>
  );
}
