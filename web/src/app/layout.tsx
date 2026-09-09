import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Undercover",
  description: "Trouve les infiltrés avant qu'ils ne te démasquent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${specialElite.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
