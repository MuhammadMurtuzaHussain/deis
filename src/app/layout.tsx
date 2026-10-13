import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Deis", description: "Swipe through early-career jobs in Ireland." };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IE">
      <body>{children}</body>
    </html>
  );
}
