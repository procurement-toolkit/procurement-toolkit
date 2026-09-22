import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/queries";

// The root URL (hkimms.vercel.app) was, until 2026-09-10, still the
// untouched create-next-app scaffold — proxy.ts explicitly skipped its
// auth redirect for "/", so anyone landing here directly saw the raw
// Next.js starter page instead of the app. Now "/" just routes onward:
// signed-out visitors go to /login (proxy.ts also enforces this at the
// edge), admins land on /admin, and everyone else lands on /m.
export default async function Home() {
  const profile = await getMyProfile();

  if (!profile) {
    redirect("/login");
  }

  redirect(profile.role === "admin" ? "/admin" : "/m");
}
