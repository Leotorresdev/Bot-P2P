import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Bot P2P — Suite Contable & Fiscal SENIAT 16% (Binance C2C)",
  description:
    "Sistema automatizado de registro de ganancias P&L por lote (FIFO/WAC), conciliación multibancos Venezuela, cierres diarios 11:59 PM VET y provisión del 16% de impuesto SENIAT.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
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
      className={`${jakarta.variable} ${mono.variable}`}
    >
      <body className="min-h-screen bg-alpine-snow font-sans text-alpine-ink">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
