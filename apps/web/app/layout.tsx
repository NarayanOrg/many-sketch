import { Geist_Mono, Inter, Roboto } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { Metadata } from "next";

const robotoHeading = Roboto({subsets:['latin'],variable:'--font-heading'});

const inter = Inter({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const siteUrl = "https://many-sketch-io.vercel.app" // replace with your actual domain
const title = "ManySketch — Draw Together in Real Time"
const description =
  "Create a lobby, invite friends, and sketch together in real time. Race the clock, chat live, and see everyone's drawings come together instantly. Free multiplayer drawing game — no downloads, just a link."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s | ManySketch",
  },
  description,
  applicationName: "ManySketch",
  keywords: [
    "multiplayer drawing game",
    "real-time sketching",
    "draw together online",
    "collaborative drawing app",
    "sketch with friends",
    "online drawing lobby",
    "timed drawing game",
    "drawing game with chat",
    "browser drawing game",
    "real-time whiteboard game",
  ],
  authors: [{ name: "ManySketch" }],
  creator: "ManySketch",
  publisher: "ManySketch",
  category: "Games",

  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },

  manifest: "/manifest.json",

  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "ManySketch",
    title,
    description,
    locale: "en_US",
    images: [
      {
        url: "/og-image.png", // 1200x630 recommended
        width: 1200,
        height: 630,
        alt: "ManySketch — real-time multiplayer sketching game",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
    creator: "@narayanbona",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  alternates: {
    canonical: siteUrl,
  },

  formatDetection: {
    telephone: false,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable, robotoHeading.variable)}
    >
      <body suppressContentEditableWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
      <Toaster position="top-center" closeButton/>
    </html>
  )
}
