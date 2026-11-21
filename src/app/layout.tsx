import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0E11" },
    { media: "(prefers-color-scheme: light)", color: "#F4F7F9" },
  ],
};

export const metadata: Metadata = {
  applicationName: "Bot P2P",
  manifest: "/manifest.webmanifest",
  title: "Bot P2P — Suite Contable & Fiscal SENIAT 16% (Binance C2C)",
  description:
    "Sistema automatizado de registro de ganancias P&L, conciliación multibancos Venezuela, control de jornadas y provisión de impuesto SENIAT.",
  appleWebApp: {
    capable: true,
    title: "Bot P2P",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/icons/icon-192x192.png",
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html
      lang="es-VE"
      suppressHydrationWarning
      className={`dark ${jakarta.variable} ${mono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen bg-alpine-snow font-sans text-alpine-ink dark:bg-[#0B0E11] dark:text-[#EAECEF]"
      >
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
