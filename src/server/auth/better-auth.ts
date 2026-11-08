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
    expiresIn: 60 * 60 * 8, // 8 horas máximo (Política de Bóveda Contable)
    updateAge: 60 * 15,
  },
  plugins: [
    twoFactor({
      issuer: "Bot P2P Venezuela (SENIAT)",
    }),
  ],
});
