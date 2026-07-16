import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { cn } from "@gamer-health/ui";
import { ThemeProvider } from "@gamer-health/ui/theme";
import { Toaster } from "@gamer-health/ui/toast";

import { env } from "~/env";
import { TRPCReactProvider } from "~/trpc/react";
import { AppNav } from "./_components/app-nav";

import "~/app/styles.css";

const description =
  "Log your gaming sessions, build healthy habits, check in on your mood, and level up your wellbeing.";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000",
  ),
  title: {
    default: "Gamer Health",
    template: "%s · Gamer Health",
  },
  description,
  openGraph: {
    title: "Gamer Health",
    description,
    siteName: "Gamer Health",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6faf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e141c" },
  ],
};

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "bg-background text-foreground min-h-screen font-sans antialiased",
          geistSans.variable,
          geistMono.variable,
        )}
      >
        <ThemeProvider>
          <AppNav />
          <TRPCReactProvider>{props.children}</TRPCReactProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
