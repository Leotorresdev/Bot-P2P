import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

const resolveAuthBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
};

export const authClient = createAuthClient({
  baseURL: resolveAuthBaseUrl(),
  plugins: [twoFactorClient()],
});
