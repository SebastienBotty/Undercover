import type { Metadata, Viewport } from "next";
import { Special_Elite, Inter } from "next/font/google";
import "./globals.css";

const specialElite = Special_Elite({
  variable: "--font-special-elite",
  weight: "400",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const TITLE = "Undercover — jeu du menteur en ligne entre amis";
const DESCRIPTION =
  "Undercover est un jeu de société multijoueur gratuit à jouer dans le navigateur, façon Loup-Garou/Mr. White : chacun reçoit un personnage secret, un ou plusieurs joueurs sont des infiltrés avec un personnage légèrement différent. Donnez des indices à tour de rôle et démasquez-les au vote.";

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: "%s · Undercover",
  },
  description: DESCRIPTION,
  keywords: [
    "undercover",
    "jeu du menteur",
    "jeu mr white",
    "jeu de société en ligne",
    "jeu multijoueur entre amis",
    "jeu d'ambiance",
    "loup garou en ligne",
    "jeu de soirée gratuit",
  ],
  applicationName: "Undercover",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Undercover",
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#12201a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${specialElite.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
