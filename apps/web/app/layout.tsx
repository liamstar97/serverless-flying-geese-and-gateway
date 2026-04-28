import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "gloop",
  description: "Serverless goose agents on Fly with agentgateway",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
