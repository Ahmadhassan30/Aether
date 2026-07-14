import type { Metadata } from "next";
import localFont from "next/font/local";
import "@xyflow/react/dist/style.css";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Aether",
  description: "Live compiler visualization in the browser for tokens, AST, HIR, IR, disassembly, and VM execution.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--background)] text-[var(--foreground)]`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
