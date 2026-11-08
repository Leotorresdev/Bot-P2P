import { hc } from "hono/client";
import type { AppType } from "@/server/hono/app";

const getBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
};

export const apiClient = hc<AppType>(getBaseUrl());
