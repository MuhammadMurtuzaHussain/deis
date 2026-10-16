"use client";

import { Check, Cloud, Desktop, HardDrives, Sparkle } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { DEFAULTS, type AiSettings } from "@/lib/ai/settings";
import { api, ApiError } from "@/lib/client/api";
import { effectiveModel, type EffectiveModel } from "@/lib/client/model";
import { useStore } from "@/lib/client/store";
import { CopyLine, PrivacyBadge, SpringSwitch } from "./settings/parts";
import { betterWritingDefault, useOllama } from "./settings/useOllama";
import { Button, Elapsed, Field, inputClass, Notice, PageHeader, Pill, selectClass } from "./ui";

// Where Gemma runs. The whole pitch of Deis is that this is the user's choice:
// their own laptop (free, private), their own free Google AI Studio key, or any
// server they run or rent. The hosted demo offers its own key, rate limited.
// What is preselected and what each option says about privacy come from
// effectiveModel (UX-5), so the page never claims "private" while calls go elsewhere.

type Choice = AiSettings["provider"];

/** The option that matches what really answers now: the demo default answered by local Gemma is the Ollama option. */
function choiceFor(m: EffectiveModel): Choice {
  return m.standIn ? "ollama" : m.settings.provider;
}

function Option({
  id,
  choice,
  setChoice,
  icon,
  title,
  sub,
  model,
  inUse,
  disabled,
  children,
}: {
  id: Choice;
  choice: Choice;
  setChoice: (c: Choice) => void;
  icon: ReactNode;
  title: string;
  sub: string;
  /** effectiveModel for this option, for its privacy badge and whether it can be used here. */
  model: EffectiveModel;
  inUse: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const on = choice === id && !disabled;
  return (
    <div className={`rounded-panel border bg-surface transition-[border-color,box-shadow] ${on ? "border-ink shadow-[inset_0_0_0_1px_var(--ink)]" : "border-line hover:border-control-border"} ${disabled ? "opacity-75" : ""}`}>
      <label className={`flex items-start gap-4 p-4 sm:p-5 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input type="radio" name="provider" checked={on} disabled={disabled} onChange={() => setChoice(id)} className="mt-2.5 size-5 shrink-0 accent-[var(--ink)]" />
        <span className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors ${on ? "bg-ink text-surface" : "bg-sunken text-ink-2"}`} aria-hidden>
          {icon}
        </span>
        <span className="grid min-w-0 flex-1 gap-1.5">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[16px] font-semibold text-ink">{title}</span>
            {inUse && <Pill icon={<Check size={14} weight="bold" aria-hidden />}>In use now</Pill>}
          </span>
          <span className="text-body text-ink-2">{sub}</span>
          <span className="flex flex-wrap gap-2">
            <PrivacyBadge privacy={model.privacy} />
          </span>
          {disabled && model.reason && <span className="text-caption text-ink-2">{model.reason}</span>}
        </span>
      </label>
      {on && children && <div className="border-t border-line p-4 sm:p-5 sm:pl-[4.75rem]">{children}</div>}
    </div>
  );
}

export function ModelSetup({ onDone, embedded }: { onDone?: () => void; embedded?: boolean }) {
  const { ai, setAi, status, effectiveModel: current } = useStore();
  const hosted = Boolean(status?.hosted);
  // Until the user picks, follow what really answers (status arrives a moment after the first render).
  const [picked, setPicked] = useState<Choice | null>(null);
  const choice = picked ?? choiceFor(current);
  const [googleKey, setGoogleKey] = useState(ai?.provider === "google" ? ai.apiKey : "");
  const [googleModel, setGoogleModel] = useState(ai?.provider === "google" ? ai.model : DEFAULTS.google);
  const [ollamaPicked, setOllamaModel] = useState<string | null>(ai?.provider === "ollama" ? ai.model : null);
  const [baseUrl, setBaseUrl] = useState(ai?.provider === "openai" ? ai.baseUrl : "http://127.0.0.1:1234/v1");
  const [customModel, setCustomModel] = useState(ai?.provider === "openai" ? ai.model : "");
  const [customKey, setCustomKey] = useState(ai?.provider === "openai" ? (ai.apiKey ?? "") : "");
  const { info: ollama, checking, refresh } = useOllama(hosted);
  // "Better writing": the 12B model writes the kit. null: not decided by the user yet.
  const [betterPicked, setBetterWriting] = useState<boolean | null>(ai?.provider === "ollama" ? Boolean(ai.kitModel) : null);
  const [test, setTest] = useState<{ state: "idle" | "running" | "ok" | "error"; message?: string; since?: number }>({ state: "idle" });

  // With no model saved, use the Gemma Ollama has (the default if it's there, else the first Gemma).
  const firstGemma = ollama?.models.find((m) => m.name === DEFAULTS.ollama)?.name ?? ollama?.models.find((m) => m.name.startsWith("gemma"))?.name;
  const ollamaModel = ollamaPicked ?? firstGemma ?? DEFAULTS.ollama;
  const gemmaInstalled = Boolean(ollama?.models.some((m) => m.name === ollamaModel));
  const kitInstalled = Boolean(ollama?.models.some((m) => m.name === DEFAULTS.kitModel));
  const betterWriting = (betterPicked ?? (ollama ? betterWritingDefault(ollama) : false)) && (ollama ? kitInstalled : true);

  const settingsFor = (c: Choice): AiSettings | null => {
    switch (c) {
      case "demo":
        return { provider: "demo" };
      case "google":
        return googleKey.trim().length >= 10 ? { provider: "google", apiKey: googleKey.trim(), model: googleModel } : { provider: "google", apiKey: "placeholder-key", model: googleModel };
      case "ollama":
        return { provider: "ollama", baseUrl: DEFAULTS.ollamaUrl, model: ollamaModel, ...(betterWriting && ollamaModel !== DEFAULTS.kitModel ? { kitModel: DEFAULTS.kitModel } : {}) };
      case "openai":
        return { provider: "openai", baseUrl: baseUrl.trim() || "http://127.0.0.1:1234/v1", model: customModel.trim() || "model" };
    }
  };
  // Only complete settings can be tested or saved.
  const settings = (): AiSettings | null => {
    if (choice === "google" && googleKey.trim().length < 10) return null;
    if (choice === "openai") return baseUrl && customModel ? { provider: "openai", baseUrl: baseUrl.trim(), model: customModel.trim(), apiKey: customKey.trim() || undefined } : null;
    return settingsFor(choice);
  };
  // Each option's badge and availability, as if it were chosen (effectiveModel is pure).
  const modelOf = (c: Choice) => effectiveModel(settingsFor(c), status);
  const inUse = (c: Choice) => choiceFor(current) === c;

  const runTest = async () => {
    const s = settings();
    if (!s) return;
    setTest({ state: "running", since: Date.now() });
    try {
      const r = await api<{ ms: number; model: string }>("/api/check", {}, { ai: s });
      setTest({ state: "ok", message: `${r.model} answered in ${(r.ms / 1000).toFixed(1)} s. Saved.` });
      setAi(s);
    } catch (e) {
      setTest({ state: "error", message: e instanceof ApiError ? e.message : "That didn't work. Check the details and try again." });
    }
  };

  const save = () => {
    const s = settings();
    if (!s) return;
    setAi(s);
    setTest({ state: "ok", message: "Saved." });
    onDone?.();
  };

  // The demo's Gemma: always on the hosted demo, and on local runs whose server has demo hosts set up.
  const showDemo = hosted || Boolean(status?.demoModel) || (current.settings.provider === "demo" && !current.standIn);
  const ollamaOpt = modelOf("ollama");

  return (
    <div className={embedded ? "" : "max-w-3xl"}>
      {!embedded && (
        <PageHeader
          title="Where should Gemma run?"
          description="Deis uses Gemma, Google's open-weight model, to read job ads and tailor your CV. You choose where it runs. No option charges per application."
        />
      )}

      <Notice tone="info" announce={false} className="mb-4" title={`In use now: ${current.label}`}>
        <span className="block">{current.detail}.</span>
        <span className="mt-1 block">{current.privacy.sentence}</span>
      </Notice>

      <fieldset className="grid gap-3">
        <legend className="sr-only">AI model</legend>

        {showDemo && (
          <Option
            id="demo"
            choice={choice}
            setChoice={setPicked}
            icon={<Sparkle size={20} />}
            title="The demo's Gemma, in the cloud"
            sub="Nothing to set up. Shared and rate limited, so it can be slow at busy times."
            model={modelOf("demo")}
            inUse={inUse("demo")}
            disabled={!modelOf("demo").usable}
          />
        )}

        <Option
          id="ollama"
          choice={choice}
          setChoice={setPicked}
          icon={<Desktop size={20} />}
          title="On this computer, with Ollama"
          sub="Free and private. Needs about 8 GB of memory and a 7 GB download, and works offline."
          model={ollamaOpt}
          inUse={inUse("ollama")}
          disabled={hosted}
        >
          {ollama === null ? (
            <p className="text-body text-ink-2">Looking for Ollama…</p>
          ) : !ollama.running ? (
            <div className="grid gap-3 text-body">
              <p className="text-ink">Ollama isn&apos;t running. Install it from ollama.com, open it, then fetch Gemma once in a terminal:</p>
              <CopyLine text={`ollama pull ${DEFAULTS.ollama}`} />
              <div>
                <Button size="sm" busy={checking} onClick={refresh}>
                  Check again
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <Field label="Model" help={gemmaInstalled ? "Downloaded and ready." : "Not downloaded yet. Run this once in a terminal, then check again:"}>
                {(id, d) => (
                  <select id={id} aria-describedby={d} value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} className={selectClass}>
                    {[...new Set([DEFAULTS.ollama, ...ollama.models.map((m) => m.name)])].map((m) => {
                      const got = ollama.models.find((x) => x.name === m);
                      return (
                        <option key={m} value={m}>
                          {m}
                          {got ? ` (${got.gb} GB)` : " (not downloaded)"}
                        </option>
                      );
                    })}
                  </select>
                )}
              </Field>
              {!gemmaInstalled && (
                <div className="grid gap-2">
                  <CopyLine text={`ollama pull ${ollamaModel}`} />
                  <div>
                    <Button size="sm" busy={checking} onClick={refresh}>
                      Check again
                    </Button>
                  </div>
                </div>
              )}
              {ollamaModel !== DEFAULTS.kitModel && (
                <div className="grid gap-2 rounded-panel bg-sunken p-4">
                  <SpringSwitch
                    checked={betterWriting}
                    onChange={setBetterWriting}
                    disabled={!kitInstalled}
                    label="Better writing (about 2 minutes per kit)"
                    description={
                      kitInstalled
                        ? `The larger ${DEFAULTS.kitModel} writes your CV, letter and answers. Best with 24 GB of memory or more${ollama.memoryGb ? `; this computer has ${ollama.memoryGb} GB` : ""}.`
                        : `Needs ${DEFAULTS.kitModel}, which isn't downloaded yet. Fetch it once in a terminal (about 8 GB), then check again.`
                    }
                  />
                  {!kitInstalled && <CopyLine text={`ollama pull ${DEFAULTS.kitModel}`} />}
                </div>
              )}
            </div>
          )}
        </Option>

        <Option
          id="google"
          choice={choice}
          setChoice={setPicked}
          icon={<Cloud size={20} />}
          title="With a free Google AI Studio key"
          sub="Faster than most laptops. Google's free tier runs open-weight Gemma at no cost. Takes a minute to set up."
          model={modelOf("google")}
          inUse={inUse("google")}
        >
          <ol className="mb-4 grid list-decimal gap-1 pl-5 text-body text-ink-2">
            <li>
              Open{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer noopener" className="link">
                aistudio.google.com/apikey
                <span className="sr-only"> (opens in a new tab)</span>
              </a>{" "}
              and sign in with a Google account.
            </li>
            <li>Choose Create API key. No card is needed.</li>
            <li>Copy the key and paste it here. It&apos;s kept on this device and sent with each request{hosted ? " through the demo server" : ""}.</li>
          </ol>
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <Field label="API key">
              {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" spellCheck={false} value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} className={inputClass} placeholder="AIza..." />}
            </Field>
            <Field label="Model">
              {(id, d) => (
                <select id={id} aria-describedby={d} value={googleModel} onChange={(e) => setGoogleModel(e.target.value)} className={selectClass}>
                  <option value="gemma-4-26b-a4b-it">Gemma 4 26B (fast)</option>
                  <option value="gemma-4-31b-it">Gemma 4 31B</option>
                </select>
              )}
            </Field>
          </div>
        </Option>

        <Option
          id="openai"
          choice={choice}
          setChoice={setPicked}
          icon={<HardDrives size={20} />}
          title="Another server you run or rent"
          sub="LM Studio, llama.cpp, vLLM, DigitalOcean, OpenRouter: anything that speaks the OpenAI API."
          model={modelOf("openai")}
          inUse={inUse("openai")}
        >
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
            Asking Gemma to say hello. The first call on a laptop loads the model and can take a minute. <Elapsed since={test.since ?? 0} />
          </Notice>
        )}
        {test.state === "ok" && <Notice tone="ok">{test.message}</Notice>}
        {test.state === "error" && <Notice tone="error">{test.message}</Notice>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={runTest} busy={test.state === "running"} disabled={!settings()}>
            Test and save
          </Button>
          <Button variant="primary" onClick={save} disabled={!settings() || test.state === "running"}>
            {embedded ? "Save" : "Use this"}
          </Button>
        </div>
      </div>
    </div>
  );
}
