import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OEM+ ChartScanner | Trading Vault",
  description: "Premium, mobile-first trading analysis workspace for Forex and Gold.",
  applicationName: "OEM+ ChartScanner",
  icons: { icon: "/oem-plus-mark.svg", shortcut: "/oem-plus-mark.svg", apple: "/oem-plus-mark.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">{children}</body>
    </html>
  );
}
