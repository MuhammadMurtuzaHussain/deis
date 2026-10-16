import type { Metadata } from "next";
import Link from "next/link";
import { DownloadPicker } from "@/components/DownloadPicker";
import { Credit } from "@/components/Credit";
import { OfferNote } from "@/components/OfferNote";
import { Wordmark } from "@/components/ui";

export const metadata: Metadata = {
  title: "Download Deis for Mac, Windows, Linux or Android",
  description: "The Deis desktop app: your profile, the job deck and, with Ollama, Gemma itself, all on your own computer. Free for 14 days, then €9.99 once. Free on Android and iPhone.",
};

const REPO = "https://github.com/MuhammadMurtuzaHussain/deis";

const FIRST_OPEN = [
  {
    os: "Mac",
    steps: ["Open the downloaded file and drag Deis into Applications.", "Open Deis. macOS says it can't check the app for malicious software.", "Go to System Settings, Privacy & Security, and choose Open Anyway next to Deis. You only do this once."],
  },
  {
    os: "Windows",
    steps: ["Run the downloaded installer. Deis installs for you alone, with no admin password.", "If SmartScreen warns about an unrecognised app, choose More info, then Run anyway."],
  },
  {
    os: "Linux",
    steps: ["Make the file executable: chmod +x Deis-linux-x86_64.AppImage", "Run it. Some distributions need libfuse2 for AppImages."],
  },
  {
    os: "Android",
    steps: [
      "Open Deis-android.apk from your downloads.",
      "If Android asks, let your browser install unknown apps, then choose Install.",
      "If Play Protect doesn't recognise the developer, choose More details, then Install anyway.",
    ],
  },
  {
    os: "iPhone",
    steps: ["Open deiscareers.tech in Safari.", "Tap Share, then Add to Home Screen.", "Open Deis from your home screen. It runs full screen, like an app."],
  },
];

export default function DownloadPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 w-full max-w-[880px] items-center px-4 md:px-8">
        <Link href="/" className="-mx-2 inline-flex h-11 items-center rounded-pill px-2">
          <Wordmark />
          <span className="sr-only">, open the web app</span>
        </Link>
        <Link href="/" className="ml-auto text-caption font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          Try it in the browser first
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-[880px] gap-14 px-4 py-10 md:px-8 lg:py-16">
        <section className="grid gap-6">
          <div className="grid max-w-[60ch] gap-3">
            <h1 className="display text-[36px] leading-[1.05] text-ink text-balance sm:text-[48px]">Deis on your computer or phone</h1>
            <p className="text-lead text-ink-2">
              Your profile, the job deck and, with Ollama, Gemma itself stay on your computer. It works offline once the jobs are saved. Free for 14 days with everything included, then €9.99 once. On a phone, Deis is free.
            </p>
            <OfferNote />
          </div>
          <DownloadPicker />
        </section>

        <section aria-labelledby="first-open" className="grid gap-5">
          <div className="grid max-w-[60ch] gap-2">
            <h2 id="first-open" className="text-lead font-semibold text-ink">
              The first time you open it
            </h2>
            <p className="text-body text-ink-2">
              These builds aren&apos;t signed with an Apple or Microsoft certificate yet, so your computer asks you to confirm once. The Android app comes from here rather than Google Play, so your phone asks too.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FIRST_OPEN.map(({ os, steps }) => (
              <div key={os} className="grid content-start gap-3 rounded-panel bg-sunken p-5">
                <h3 className="text-body font-semibold text-ink">{os}</h3>
                <ol className="grid list-decimal gap-2 pl-5 text-body text-ink-2 marker:font-mono marker:text-[12px] marker:text-ink-3">
                  {steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="good-to-know" className="grid gap-4">
          <h2 id="good-to-know" className="text-lead font-semibold text-ink">
            Good to know
          </h2>
          <dl className="grid gap-4 text-body sm:grid-cols-2">
            <div>
              <dt className="font-medium text-ink">Updates</dt>
              <dd className="mt-1 text-ink-2">On Windows and Linux, Deis downloads new versions itself and installs them when you quit. On a Mac it tells you when one is out. Your profile and applications are kept.</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Gemma on your computer</dt>
              <dd className="mt-1 text-ink-2">
                Install{" "}
                <a href="https://ollama.com" className="underline underline-offset-2 hover:text-ink">
                  Ollama
                </a>{" "}
                and run the one command Deis shows you to get Gemma: about 8 GB of memory and a 7 GB download. Or use the demo&apos;s Gemma or your own free Google AI Studio key.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Open source</dt>
              <dd className="mt-1 text-ink-2">
                Every build comes from the public code (AGPL-3.0) through{" "}
                <a href={`${REPO}/actions/workflows/desktop.yml`} className="underline underline-offset-2 hover:text-ink">
                  GitHub Actions
                </a>
                . Release notes and older versions are on{" "}
                <a href={`${REPO}/releases`} className="underline underline-offset-2 hover:text-ink">
                  GitHub Releases
                </a>
                .
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">On your phone</dt>
              <dd className="mt-1 text-ink-2">
                The Android app and the iPhone home screen app are free. They run the same Deis as this website, with the demo&apos;s Gemma or your own free AI Studio key, since Deis can&apos;t run Gemma on a phone yet. Your profile stays on the phone.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">No account</dt>
              <dd className="mt-1 text-ink-2">There&apos;s nothing to sign up for. After the trial, the licence key from your purchase unlocks it. It&apos;s checked online once, then again about once a month when you&apos;re online.</dd>
            </div>
          </dl>
        </section>
      </main>
      <footer className="mx-auto w-full max-w-[880px] border-t border-line px-4 py-8 md:px-8">
        <Credit />
      </footer>
    </div>
  );
}
