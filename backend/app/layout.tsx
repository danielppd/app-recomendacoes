import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bubble — descubra sua vibe",
  description:
    "Cruze gostos musicais com filmes, livros e experiências. Descubra coisas novas pela mesma vibe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
