import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";
import { prisma } from "@/server/db/prisma";
import { env } from "@/env";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "OPERATOR",
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 365, // Sesión persistente (365 días con renovación deslizante hasta cierre manual)
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    twoFactor({
      issuer: "Bot P2P Venezuela (SENIAT)",
    }),
  ],
});
