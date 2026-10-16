import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// v3 "Highlighter" type (docs/DESIGN.md "Type"). Bricolage Grotesque is the display face:
// page titles, the card title, big numbers and the wordmark. Variable, with the
// optical-size axis; the UI uses the 600 and 800 cuts. Geist is all UI and body text;
// Geist Mono is fact ids, trace markers and counts.
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin", "latin-ext"], axes: ["opsz"] });
const geist = Geist({ variable: "--font-geist", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const description = "Swipe through early-career jobs in Ireland. Your CV, tailored by open-weight Gemma on your own terms, with every line traced to something you told it.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://deiscareers.tech"),
  title: "Deis · Jobs you can actually get",
  description,
  applicationName: "Deis",
  openGraph: { title: "Deis", description, type: "website", locale: "en_IE" },
  twitter: { card: "summary_large_image", title: "Deis", description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IE" className={`${bricolage.variable} ${geist.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-bg text-ink antialiased">
        {/* The saved light or dark choice, applied before first paint so there's no flash. */}
        <Script id="theme" strategy="beforeInteractive">{`try{var t=localStorage.getItem("deis.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`}</Script>
        {children}
      </body>
    </html>
  );
}
