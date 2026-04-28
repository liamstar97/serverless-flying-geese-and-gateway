import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/AppShell";
import { cn } from "@/lib/utils";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "gloop — serverless goose agents on Fly",
  description: "Three goose personas, one agentgateway, virtual tools.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={cn("dark", geistSans.variable, geistMono.variable)}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <TooltipProvider>
          <AppShell>{children}</AppShell>
          <Toaster richColors theme="dark" position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
