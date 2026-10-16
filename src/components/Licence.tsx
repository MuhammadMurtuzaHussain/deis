"use client";

import { Key } from "@phosphor-icons/react";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { routeHref, useStore, type Licence as LicenceInfo } from "@/lib/client/store";
import { Button, Field, inputClass, LinkButton, Notice } from "./ui";

// The desktop app's licence: try everything for 14 days, then a Polar licence key.
// The code is AGPL, so this is honest about what the money pays for.

export function LicenceForm({ licence, onChange }: { licence: LicenceInfo; onChange: (l: LicenceInfo) => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // Checking a key needs Polar, so it waits until offline mode is off.
  const offline = (useStore().status?.offline?.mode ?? "off") !== "off";

  if (licence.state === "off") return null;
  if (licence.state === "licensed") return <p className="text-ink-2">Licensed{licence.customer ? ` to ${licence.customer}` : ""}. Thank you for supporting Deis.</p>;

  return (
    <div className="grid gap-4">
      {licence.state === "trial" && (
        <p className="text-ink-2">
          Free trial: <span className="num font-bold text-ink">{licence.daysLeft}</span> {licence.daysLeft === 1 ? "day" : "days"} left with everything included.
        </p>
      )}
      <form
        className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
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
        <Field label="Licence key" help="It's in your receipt email from Polar.">
          {(id, d) => <input id={id} aria-describedby={d} value={key} onChange={(e) => setKey(e.target.value)} className={inputClass} autoComplete="off" spellCheck={false} />}
        </Field>
        <Button type="submit" variant="primary" disabled={busy || offline || key.trim().length < 8}>
          <Key size={18} aria-hidden />
          {busy ? "Checking…" : "Unlock"}
        </Button>
      </form>
      {offline && <p className="text-sm text-ink-2">Deis is in offline mode. Turn it off to check a key.</p>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {licence.buyUrl && (
        <div className="flex flex-wrap items-center gap-3">
          <LinkButton href={licence.buyUrl}>Get a key, €9 once</LinkButton>
          <span className="text-sm text-ink-3">Or build Deis yourself from the open source code, free.</span>
        </div>
      )}
    </div>
  );
}

export function LicenceScreen({ licence, onChange }: { licence: LicenceInfo; onChange: (l: LicenceInfo) => void }) {
  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-xl content-center gap-6 px-6">
      <span className="ga text-3xl">Deis</span>
      <h1 className="text-3xl font-bold">Your free trial has ended</h1>
      <p className="text-ink-2">
        Your profile and applications are safe on this computer. A licence key keeps the app, its updates and the daily Irish job feed going, for €9 once. No subscription.
      </p>
      <LicenceForm licence={licence} onChange={onChange} />
      <p className="text-ink-2">
        You can still <a href={routeHref({ name: "tracker" })} className="font-medium underline">read your applications</a> and{" "}
        <a href={routeHref({ name: "settings" })} className="font-medium underline">export your data</a>.
      </p>
    </main>
  );
}
