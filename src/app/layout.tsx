import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider } from "@clerk/nextjs";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DorCheck — Know the Local Rate",
    template: "%s | DorCheck",
  },

  description:
    "Travel smarter with DorCheck, an AI-powered price intelligence platform for Northeast India. Check taxi fares, verify parking fees, compare tour packages, and explore local price benchmarks before you pay.",

  applicationName: "DorCheck",

  keywords: [
    "DorCheck",
    "Northeast India",
    "Assam",
    "Meghalaya",
    "AI fare checker",
    "Taxi fare calculator",
    "Travel price comparison",
    "Parking fee verification",
    "Tourist safety",
    "Travel scams",
    "Price transparency",
  ],

  category: "travel",

  openGraph: {
    title: "DorCheck — Know the Local Rate",
    description:
      "Check travel prices, compare local rates, and make informed decisions before you pay. Built for safer travel across Northeast India.",
    siteName: "DorCheck",
    type: "website",
    locale: "en_IN",
  },

  twitter: {
    card: "summary_large_image",
    title: "DorCheck — Know the Local Rate",
    description:
      "AI-powered travel price intelligence for Assam, Meghalaya, and Northeast India.",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <TooltipProvider>
          <body
            className="min-h-full flex flex-col"
            suppressHydrationWarning={true}
          >
            {children}
          </body>
        </TooltipProvider>
      </html>
    </ClerkProvider>
  );
}
