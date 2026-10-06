import { requireUser } from "@/lib/auth";

/** Full-screen layout without the tab bar, for training screens (logger, run, simulation). */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-dvh">{children}</div>;
}
