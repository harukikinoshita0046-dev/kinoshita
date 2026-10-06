import { execSync } from "node:child_process";

/** Fresh demo data for every run (the seed refuses non-local Supabase URLs). */
export default function globalSetup() {
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit" });
}
