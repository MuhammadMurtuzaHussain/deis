import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next, Newsreader } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Atkinson Hyperlegible was designed by the Braille Institute for readers with low
// vision: letters that can't be mistaken for each other. Good for anyone reading
// forty job ads in a row.
const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin", "latin-ext"], weight: ["400", "500", "700"], style: ["normal", "italic"], adjustFontFallback: false });
const atkinsonMono = Atkinson_Hyperlegible_Mono({ variable: "--font-atkinson-mono", subsets: ["latin"], weight: ["400", "500"], adjustFontFallback: false });
// Newsreader is the display face only: page titles, the card title, the fit verdict, money
// and counts, and the italic wordmark. Variable, with the optical-size axis.
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin", "latin-ext"], style: ["normal", "italic"], axes: ["opsz"] });

const description = "Swipe through early-career jobs in Ireland. Your CV, tailored by open-weight Gemma on your own terms, with every line traced to something you told it.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://deis-bu83.onrender.com"),
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
    { media: "(prefers-color-scheme: light)", color: "#f4f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#121614" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IE" className={`${atkinson.variable} ${atkinsonMono.variable} ${newsreader.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-bg text-ink antialiased">
        {/* The saved light or dark choice, applied before first paint so there's no flash. */}
        <Script id="theme" strategy="beforeInteractive">{`try{var t=localStorage.getItem("deis.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`}</Script>
        {children}
      </body>
    </html>
  );
}
