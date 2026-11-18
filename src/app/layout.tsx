import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConfirmDialogHost } from "@/components/confirm-dialog";
import { TestSiteBar } from "@/components/test-site-bar";
import { testPrefixed } from "@/lib/app-env";
import { PRODUCT_NAME } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: testPrefixed(PRODUCT_NAME),
  description: "Consulting operations for firms",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <TestSiteBar />
        {children}
        <ConfirmDialogHost />
      </body>
    </html>
  );
}
