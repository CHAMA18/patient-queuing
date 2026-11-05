import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter, Manrope } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Moms Care Flow — Lusaka Central Hospital",
  description:
    "Real-time maternal & paediatric patient flow, queuing and command centre for Lusaka Central Hospital. Track patients from OPD reception through vitals, consultation, laboratory and pharmacy.",
  keywords: ["hospital queue", "patient flow", "maternity", "paediatric", "Lusaka", "Zambia", "queuing system"],
  icons: {
    icon: "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#005c55"/><path d="M24 36c-1-.8-9-6.7-9-13a6.5 6.5 0 0 1 11.6-4l-.1-.2.1.2A6.5 6.5 0 0 1 38 23c0 6.3-8 12.2-9 13h-5z" fill="#9cf2e8" transform="translate(-7 0)"/><circle cx="31" cy="17" r="5" fill="#ffdbce"/></svg>`
    ),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#005c55",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* display=block is intentional: prevents icon ligature names flashing as text */}
        {/* eslint-disable-next-line @next/next/google-font-display, @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body
        className={`${plusJakarta.variable} ${inter.variable} ${manrope.variable} antialiased bg-background text-foreground font-body-md`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
