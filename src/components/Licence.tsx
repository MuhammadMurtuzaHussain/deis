"use client";

import { Check, GithubLogo, Key } from "@phosphor-icons/react";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { routeHref, useStore, type Licence as LicenceInfo } from "@/lib/client/store";
import { Button, Field, inputClass, LinkButton, Notice, PageHeader, Surface } from "./ui";

// The desktop app's licence: try everything for 14 days, then a Polar licence key.
// The code is AGPL, so this is honest about what the money pays for. LicenceScreen is
// the read-only lock bar's "Buy or enter a key" page (#/licence, inside the shell).

const SOURCE_URL = "https://github.com/MuhammadMurtuzaHussain/deis";

export function LicenceForm({ licence, onChange }: { licence: LicenceInfo; onChange: (l: LicenceInfo) => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // Checking a key needs Polar, so it waits until offline mode is off and the network is back.
  const { isOffline } = useStore();

  if (licence.state === "off") return null;
  if (licence.state === "licensed") return <p className="text-body text-ink-2">Licensed{licence.customer ? ` to ${licence.customer}` : ""}. Thank you for supporting Deis.</p>;

  return (
    <div className="grid gap-4">
      {licence.state === "trial" && (
        <p className="flex items-baseline gap-2 text-body text-ink-2">
          <span className="display num text-[28px] leading-none text-ink">{licence.daysLeft}</span>
          <span>{licence.daysLeft === 1 ? "day" : "days"} left in the free trial, with everything included.</span>
        </p>
      )}
      <form
        className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          try {
            const r = await api<{ ok: boolean; message: string; licence: LicenceInfo }>("/api/licence", { key });
            setMsg({ tone: "ok", text: r.message });
            onChange(r.licence);
          } catch (err) {
            setMsg({ tone: "error", text: err instanceof ApiError ? err.message : "That didn't work. Try again." });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Licence key" help={isOffline ? "Checking a key needs the internet. Turn offline mode off, or reconnect, to unlock." : "It's in your receipt email from Polar."}>
          {(id, d) => <input id={id} aria-describedby={d} value={key} onChange={(e) => setKey(e.target.value)} className={inputClass} autoComplete="off" spellCheck={false} />}
        </Field>
        <Button type="submit" variant="primary" busy={busy} disabled={isOffline || key.trim().length < 8} className="sm:mt-[30px]">
          {!busy && <Key size={18} aria-hidden />}
          {busy ? "Checking" : "Unlock"}
        </Button>
      </form>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {licence.buyUrl && (
        <div className="flex flex-wrap items-center gap-3">
          <LinkButton href={licence.buyUrl}>Get a key, €9 once</LinkButton>
          <span className="text-caption text-ink-2">Or build Deis yourself from the open source code, free.</span>
        </div>
      )}
    </div>
  );
}

const PAYS_FOR = [
  "The signed desktop app, so your computer trusts it without a terminal",
  "Updates as job boards and models change",
  "The daily Irish job feed the app reads",
];

export function LicenceScreen({ licence, onChange }: { licence: LicenceInfo; onChange: (l: LicenceInfo) => void }) {
  const ended = licence.state === "locked";
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={ended ? "Your free trial has ended" : "Licence"}
        description={
          ended
            ? "Your profile and applications are safe on this computer. Deis is read-only until you enter a key: you can still read, export and change settings."
            : "Try everything for 14 days. After that, a key keeps Deis building kits."
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-10">
        <Surface raised className="grid content-start gap-6 p-5 sm:p-7">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="display text-[44px] leading-none text-ink">€9 once</span>
            <span className="text-body text-ink-2">No subscription.</span>
          </p>
          <LicenceForm licence={licence} onChange={onChange} />
        </Surface>

        <div className="grid content-start gap-4">
          <div>
            <h2 className="text-body font-semibold text-ink">What the €9 pays for</h2>
            <ul className="mt-3 grid gap-3">
              {PAYS_FOR.map((t) => (
                <li key={t} className="grid grid-cols-[24px_1fr] items-start gap-2.5 text-body text-ink-2">
                  <span aria-hidden className="mt-0.5 grid size-6 place-items-center rounded-full bg-sunken text-ink">
                    <Check size={13} weight="bold" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-body text-ink-2">
            The code is free under AGPL-3.0: you can read every line, build it and run it yourself.{" "}
            <a href={SOURCE_URL} target="_blank" rel="noreferrer noopener" className="link inline-flex items-center gap-1">
              <GithubLogo size={16} aria-hidden />
              Source code<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
          {ended && (
            <p className="text-body text-ink-2">
              Meanwhile, <a href={routeHref({ name: "tracker" })} className="link">read your applications</a> or <a href={routeHref({ name: "settings" })} className="link">export your data</a>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
