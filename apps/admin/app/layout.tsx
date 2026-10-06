import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "Restaurant OS", template: "%s · Restaurant OS" },
  description: "Run your restaurant: orders, menu, delivery and customers.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en-IN">
        <body suppressHydrationWarning className="min-h-dvh">
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
