"use client";

import { GithubLogo } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { getMeta, setMeta } from "@/lib/client/db";
import type { KitParts } from "@/lib/client/kit";
import type { CvLength } from "@/lib/cv/schema";
import { useStore } from "@/lib/client/store";
import { LicenceForm } from "./Licence";
import { ModelSetup } from "./ModelSetup";
import { DataSection } from "./settings/DataSection";
import { OfflineSection } from "./settings/OfflineSection";
import { SettingsSection } from "./settings/parts";
import { Chip, PageHeader } from "./ui";

// Settings: the model, offline mode, how kits are built, appearance, and the user's own
// data, which they can export, restore or delete in one go. Each topic is a two-column
// section at large widths (settings/parts.tsx).

const SOURCE_URL = "https://github.com/MuhammadMurtuzaHussain/deis";

type Theme = "system" | "light" | "dark";

function applyTheme(t: Theme) {
  const d = document.documentElement;
  if (t === "system") delete d.dataset.theme;
  else d.dataset.theme = t;
  try {
    if (t === "system") localStorage.removeItem("deis.theme");
    else localStorage.setItem("deis.theme", t);
  } catch {
    // storage blocked: the choice lasts this session
  }
}

export function Settings() {
  const { status, licence, setLicence } = useStore();
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = typeof window === "undefined" ? null : localStorage.getItem("deis.theme");
      return t === "light" || t === "dark" ? t : "system";
    } catch {
      return "system";
    }
  });
  const [parts, setParts] = useState<KitParts>({ letter: true, answers: true });
  const [length, setLength] = useState<CvLength>("detailed");
  // /api/status may carry the build's commit (SEC-10); shown when it does.
  const commit = (status as { commit?: string } | null)?.commit;

  useEffect(() => {
    void getMeta<KitParts>("kitParts", { letter: true, answers: true }).then(setParts);
    void getMeta<CvLength>("cvLength", "detailed").then(setLength);
  }, []);

  const pickLength = (l: CvLength) => {
    setLength(l);
    void setMeta("cvLength", l);
  };
  const flip = (k: keyof KitParts) => {
    const next = { ...parts, [k]: !parts[k] };
    setParts(next);
    void setMeta("kitParts", next);
  };

  return (
    <div>
      <PageHeader title="Settings" description="The model, offline mode, how kits are built and your data." />

      <div className="grid gap-10">
        <SettingsSection title="AI model" description="Deis is the app; the model is yours. Switch any time, nothing is lost.">
          <ModelSetup embedded />
        </SettingsSection>

        {status && !status.hosted && <OfflineSection />}

        <SettingsSection title="After a swipe right" description="Quick or Careful is at the top of Jobs. On a laptop, a CV alone takes about half the time of a full kit.">
          <div role="group" aria-label="CV length" className="grid gap-2 sm:grid-cols-2">
            <Chip on={length === "detailed"} onClick={() => pickLength("detailed")}>
              Detailed CV: up to two pages
            </Chip>
            <Chip on={length === "short"} onClick={() => pickLength("short")}>
              Short CV: one page
            </Chip>
          </div>
          <div role="group" aria-label="What a kit includes" className="grid gap-2 sm:grid-cols-2">
            <Chip on={parts.letter} onClick={() => flip("letter")}>
              Write a cover letter
            </Chip>
            <Chip on={parts.answers} onClick={() => flip("answers")}>
              Draft form answers
            </Chip>
          </div>
        </SettingsSection>

        <SettingsSection title="Appearance">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Colour scheme">
            {(["system", "light", "dark"] as Theme[]).map((t) => (
              <Chip
                key={t}
                on={theme === t}
                onClick={() => {
                  setTheme(t);
                  applyTheme(t);
                }}
              >
                {t === "system" ? "Match my computer" : t === "light" ? "Light" : "Dark"}
              </Chip>
            ))}
          </div>
        </SettingsSection>

        <DataSection desktop={Boolean(status?.desktop)} />

        {licence && licence.state !== "off" && (
          <SettingsSection title="Your licence">
            <LicenceForm licence={licence} onChange={setLicence} />
          </SettingsSection>
        )}

        <SettingsSection title="About Deis">
          <div className="grid max-w-[64ch] gap-3 text-body text-ink-2">
            <p>
              <span lang="ga" className="font-semibold text-ink">
                Deis
              </span>{" "}
              is Irish for opportunity. It&apos;s open source under AGPL-3.0: you can read every line, build it yourself and run it for free. The paid app saves you the setup and pays for the daily Irish job feed.
            </p>
            <p>Job listings come from employers&apos; public job boards and Google Jobs. Deis is not affiliated with any employer, LinkedIn or Google. Information about permits is general, not immigration advice.</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <GithubLogo size={18} aria-hidden className="text-ink" />
              <a href={commit ? `${SOURCE_URL}/tree/${commit}` : SOURCE_URL} target="_blank" rel="noreferrer noopener" className="link">
                Source code (AGPL-3.0)
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {commit && <span className="font-mono text-caption text-ink-3">at {commit.slice(0, 7)}</span>}
            </p>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
