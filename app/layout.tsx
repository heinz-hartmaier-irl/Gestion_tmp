import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins, Modak } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header"; 
import Footer from "@/components/Footer"; // ✅ Import du Footer

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-poppins",
});

const modak = Modak({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-modak",
});

export const metadata: Metadata = {
  title: "Ze-Gestion Congés",
  description: "Application de gestion des temps de travail",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        // ✅ Ajout de 'min-h-screen flex flex-col' pour la structure Header/Contenu/Footer
        className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} ${modak.variable} antialiased bg-[#f0f2f8] min-h-screen flex flex-col`}
      >
        <Header />
        
        {/* ✅ 'flex-1' force le contenu à prendre toute la place disponible, poussant le footer en bas */}
        <main className="flex-1">
            {children}
        </main>
        
        <Footer />
        
      </body>
    </html>
  );
}