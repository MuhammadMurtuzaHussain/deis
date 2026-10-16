"use client";

import { CheckCircle, Cloud, Copy, Desktop, HardDrives, Sparkle } from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { DEFAULTS, type AiSettings } from "@/lib/ai/settings";
import { api, ApiError } from "@/lib/client/api";
import { useStore } from "@/lib/client/store";
import { Button, Elapsed, Field, inputClass, Notice } from "./ui";

// Where Gemma runs. The whole pitch of Deis is that this is the user's choice:
// their own laptop (free, private), their own free Google AI Studio key, or any
// server they run or rent. The hosted demo offers its own key, rate limited.

type Choice = AiSettings["provider"];
type Ollama = { running: boolean; models: { name: string; gb: number }[]; hosted?: boolean; memoryGb?: number };

function Option({ id, choice, setChoice, icon, title, sub, children }: { id: Choice; choice: Choice; setChoice: (c: Choice) => void; icon: ReactNode; title: string; sub: string; children?: ReactNode }) {
  const on = choice === id;
  return (
    <div className={`rounded-surface border bg-surface ${on ? "border-accent" : "border-line"}`}>
      <label className="flex cursor-pointer items-start gap-4 p-5">
        <input type="radio" name="provider" checked={on} onChange={() => setChoice(id)} className="mt-1.5 size-4 accent-[var(--accent)]" />
        <span className="mt-0.5 text-accent" aria-hidden>
          {icon}
        </span>
        <span>
          <span className="block font-bold">{title}</span>
          <span className="mt-1 block text-[15px] text-ink-2">{sub}</span>
        </span>
      </label>
      {on && children && <div className="border-t border-line p-5 pt-4">{children}</div>}
    </div>
  );
}

function CopyLine({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-control bg-surface-2 px-3 py-2">
      <code className="num text-sm">{text}</code>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm text-accent-text"
        onClick={async () => {
          await navigator.clipboard.writeText(text).catch(() => undefined);
          setDone(true);
        }}
      >
        <Copy size={16} aria-hidden />
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function ModelSetup({ onDone, embedded }: { onDone?: () => void; embedded?: boolean }) {
  const { ai, setAi, status } = useStore();
  const hosted = Boolean(status?.hosted);
  const [choice, setChoice] = useState<Choice>(ai?.provider ?? (hosted ? "demo" : "ollama"));
  const [googleKey, setGoogleKey] = useState(ai?.provider === "google" ? ai.apiKey : "");
  const [googleModel, setGoogleModel] = useState(ai?.provider === "google" ? ai.model : DEFAULTS.google);
  const [ollamaModel, setOllamaModel] = useState(ai?.provider === "ollama" ? ai.model : DEFAULTS.ollama);
  const [baseUrl, setBaseUrl] = useState(ai?.provider === "openai" ? ai.baseUrl : "http://127.0.0.1:1234/v1");
  const [customModel, setCustomModel] = useState(ai?.provider === "openai" ? ai.model : "");
  const [customKey, setCustomKey] = useState(ai?.provider === "openai" ? (ai.apiKey ?? "") : "");
  const [ollama, setOllama] = useState<Ollama | null>(null);
  // "Better writing": the 12B model writes the kit. Unset until we know this computer's memory.
  const [betterWriting, setBetterWriting] = useState<boolean | null>(ai?.provider === "ollama" ? Boolean(ai.kitModel) : null);
  const [test, setTest] = useState<{ state: "idle" | "running" | "ok" | "error"; message?: string; since?: number }>({ state: "idle" });

  useEffect(() => {
    if (hosted) return;
    fetch("/api/ollama")
      .then((r) => r.json())
      .then((d: Ollama) => {
        setOllama(d);
        const gemma = d.models.find((m) => m.name.startsWith("gemma"));
        if (gemma && !d.models.some((m) => m.name === ollamaModel)) setOllamaModel(gemma.name);
        // On by default with room for it (24 GB) and the model already downloaded.
        setBetterWriting((b) => b ?? ((d.memoryGb ?? 0) >= 24 && d.models.some((m) => m.name === DEFAULTS.kitModel)));
      })
      .catch(() => setOllama({ running: false, models: [] }));
    // Only on first look; the user can re-check with the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosted]);

  const settings = (): AiSettings | null => {
    switch (choice) {
      case "demo":
        return { provider: "demo" };
      case "google":
        return googleKey.trim().length >= 10 ? { provider: "google", apiKey: googleKey.trim(), model: googleModel } : null;
      case "ollama":
        return { provider: "ollama", baseUrl: DEFAULTS.ollamaUrl, model: ollamaModel, ...(betterWriting && ollamaModel !== DEFAULTS.kitModel ? { kitModel: DEFAULTS.kitModel } : {}) };
      case "openai":
        return baseUrl && customModel ? { provider: "openai", baseUrl: baseUrl.trim(), model: customModel.trim(), apiKey: customKey.trim() || undefined } : null;
    }
  };

  const runTest = async () => {
    const s = settings();
    if (!s) return;
    setTest({ state: "running", since: Date.now() });
    try {
      const r = await api<{ ms: number; model: string }>("/api/check", {}, { ai: s });
      setTest({ state: "ok", message: `${r.model} answered in ${(r.ms / 1000).toFixed(1)} s.` });
      setAi(s);
    } catch (e) {
      setTest({ state: "error", message: e instanceof ApiError ? e.message : "That didn't work. Check the details and try again." });
    }
  };

  const save = () => {
    const s = settings();
    if (!s) return;
    setAi(s);
    onDone?.();
  };

  const gemmaInstalled = ollama?.models.some((m) => m.name === ollamaModel);
  const kitInstalled = ollama?.models.some((m) => m.name === DEFAULTS.kitModel);

  return (
    <div className={embedded ? "" : "max-w-3xl"}>
      {!embedded && (
        <>
          <h1 className="text-3xl font-bold">Where should Gemma run?</h1>
          <p className="mt-3 max-w-[62ch] text-ink-2">
            Deis uses Gemma, Google&apos;s open-weight model, to read job ads and tailor your CV. You choose where it runs. Every option costs nothing per application.
          </p>
        </>
      )}

      <fieldset className="mt-6 grid gap-3">
        <legend className="sr-only">AI model</legend>

        {hosted && (
          <Option id="demo" choice={choice} setChoice={setChoice} icon={<Sparkle size={24} />} title="Try it with the demo's Gemma" sub="Nothing to set up. Shared and rate limited, so it can be slow at busy times." />
        )}

        {!hosted && (
          <Option id="ollama" choice={choice} setChoice={setChoice} icon={<Desktop size={24} />} title="On this computer, with Ollama" sub="Free and fully private: your CV never leaves your machine. Needs about 8 GB of memory and a 7 GB download.">
            {ollama === null ? (
              <p className="text-sm text-ink-2">Looking for Ollama…</p>
            ) : !ollama.running ? (
              <div className="grid gap-3 text-[15px]">
                <p>Ollama isn&apos;t running. Install it from ollama.com, open it, then fetch Gemma once:</p>
                <CopyLine text={`ollama pull ${DEFAULTS.ollama}`} />
              </div>
            ) : (
              <div className="grid gap-3">
                <Field label="Model" help={gemmaInstalled ? "Installed and ready." : `Not downloaded yet. Run this once in a terminal:`}>
                  {(id, d) => (
                    <select id={id} aria-describedby={d} value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} className={inputClass}>
                      {[...new Set([DEFAULTS.ollama, ...ollama.models.map((m) => m.name)])].map((m) => (
                        <option key={m} value={m}>
                          {m}
                          {ollama.models.find((x) => x.name === m) ? ` (${ollama.models.find((x) => x.name === m)!.gb} GB)` : " (not downloaded)"}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                {!gemmaInstalled && <CopyLine text={`ollama pull ${ollamaModel}`} />}
                {ollamaModel !== DEFAULTS.kitModel && (
                  <label className="flex cursor-pointer items-start gap-3 text-[15px]">
                    <input type="checkbox" checked={Boolean(betterWriting)} onChange={(e) => setBetterWriting(e.target.checked)} className="mt-1 size-5 accent-[var(--accent)]" />
                    <span>
                      <span className="block font-medium">Better writing (about 2 minutes per kit)</span>
                      <span className="block text-sm text-ink-2">
                        The larger {DEFAULTS.kitModel} writes your CV, letter and answers. Best with 24 GB of memory or more.{kitInstalled ? "" : " Until it's downloaded, the model above writes them."}
                      </span>
                    </span>
                  </label>
                )}
                {betterWriting && !kitInstalled && ollamaModel !== DEFAULTS.kitModel && <CopyLine text={`ollama pull ${DEFAULTS.kitModel}`} />}
              </div>
            )}
          </Option>
        )}

        <Option id="google" choice={choice} setChoice={setChoice} icon={<Cloud size={24} />} title="With a free Google AI Studio key" sub="Faster than most laptops. Google's free tier runs open-weight Gemma at no cost. Takes a minute to set up.">
          <ol className="mb-4 grid list-decimal gap-1 pl-5 text-[15px] text-ink-2">
            <li>
              Open{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-2">
                aistudio.google.com/apikey
              </a>{" "}
              and sign in with a Google account.
            </li>
            <li>Choose Create API key. No card is needed.</li>
            <li>Copy the key and paste it here. It stays on this device.</li>
          </ol>
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <Field label="API key">
              {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" spellCheck={false} value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} className={inputClass} placeholder="AIza..." />}
            </Field>
            <Field label="Model">
              {(id, d) => (
                <select id={id} aria-describedby={d} value={googleModel} onChange={(e) => setGoogleModel(e.target.value)} className={inputClass}>
                  <option value="gemma-4-26b-a4b-it">Gemma 4 26B (fast)</option>
                  <option value="gemma-4-31b-it">Gemma 4 31B</option>
                </select>
              )}
            </Field>
          </div>
        </Option>

        <Option id="openai" choice={choice} setChoice={setChoice} icon={<HardDrives size={24} />} title="Another server you run or rent" sub="LM Studio, llama.cpp, vLLM, DigitalOcean, OpenRouter: anything that speaks the OpenAI API.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Server address" help="Ends in /v1 for most servers.">
              {(id, d) => <input id={id} aria-describedby={d} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={inputClass} spellCheck={false} />}
            </Field>
            <Field label="Model name">
              {(id, d) => <input id={id} aria-describedby={d} value={customModel} onChange={(e) => setCustomModel(e.target.value)} className={inputClass} spellCheck={false} placeholder="gemma-3-12b-it" />}
            </Field>
            <Field label="API key, if it needs one">
              {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" value={customKey} onChange={(e) => setCustomKey(e.target.value)} className={inputClass} />}
            </Field>
          </div>
        </Option>
      </fieldset>

      <div className="mt-6 grid gap-4">
        {test.state === "running" && (
          <Notice>
            Asking Gemma to say hello… <Elapsed since={test.since!} />. The first call on a laptop loads the model and can take a minute.
          </Notice>
        )}
        {test.state === "ok" && (
          <Notice tone="ok">
            <span className="inline-flex items-center gap-2">
              <CheckCircle size={18} weight="fill" className="text-accent" aria-hidden />
              {test.message}
            </span>
          </Notice>
        )}
        {test.state === "error" && <Notice tone="error">{test.message}</Notice>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={runTest} disabled={!settings() || test.state === "running"}>
            Test connection
          </Button>
          <Button variant="primary" onClick={save} disabled={!settings()}>
            {embedded ? "Save" : "Use this"}
          </Button>
        </div>
      </div>
    </div>
  );
}
