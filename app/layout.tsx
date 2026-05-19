import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keinarra",
  description: "Keinarra App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
