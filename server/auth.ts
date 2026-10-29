import { betterAuth } from "better-auth";
import { pool } from "./db.js";

const env = process.env;
export const auth = betterAuth({
  database: pool,
  baseURL: env.BETTER_AUTH_URL ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : env.VERCEL_URL ? `https://${env.VERCEL_URL}` : env.V0_RUNTIME_URL),
  emailAndPassword: { enabled: true, autoSignIn: true },
  trustedOrigins: [
    ...(env.NODE_ENV === "development" ? ["http://localhost:3000", "http://localhost:5173", ...[env.V0_RUNTIME_URL, env.V0_DEV_APP_URL, env.V0_BUILD_URL, env.V0_SANDBOX_URL].filter((value): value is string => Boolean(value))] : []),
    ...(env.NODE_ENV === "production" ? [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map((host) => `https://${host}`) : []),
  ],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  ...(env.NODE_ENV === "development" ? { advanced: { defaultCookieAttributes: { sameSite: "none" as const, secure: true } } } : {}),
});
