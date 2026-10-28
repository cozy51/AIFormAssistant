import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AI帳票アシスタント",
  description:
    "資料を根拠に、技術文書をもっと確かに。Google Drive と Gemini による帳票作成支援",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
