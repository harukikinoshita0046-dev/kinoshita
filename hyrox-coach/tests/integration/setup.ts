import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env.test", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(url) && process.env.ALLOW_REMOTE_TESTS !== "1") {
  throw new Error(`Integration tests create and delete users. Refusing to run against ${url} (set ALLOW_REMOTE_TESTS=1 to override).`);
}
