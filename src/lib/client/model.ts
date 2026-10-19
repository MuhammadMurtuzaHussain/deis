import { DEFAULTS, tierOf, type AiSettings, type Tier } from "../ai/settings";
import type { OfflineMode } from "./offline";

// Which model the app is really using, and how to say so. The one source for the sidebar
// pill, the defaults in Settings and Model setup, and every privacy sentence (UX-5,
// PRD-4/SEC-3). It mirrors modelChain() in src/mastra/model.ts: with no choice saved,
// requests go out as provider "demo", which on a local or desktop run with no demo
// hosts (or in offline mode) is Gemma on this computer, not a server.

/** What GET /api/status returns. No keys, no URLs. */
export type ServerStatus = {
  hosted: boolean;
  desktop: boolean;
  demoModel: boolean;
  offline?: { mode: OfflineMode; reachable?: boolean };
  /** The demo's hosts in the order it asks them: "Google AI Studio" or a host name. */
  demoHosts?: { label: string; model: string; healthy: boolean }[];
  services: { jobSearch: boolean; tracing: boolean; cache: string; cachePing?: unknown };
};

export type PrivacyWhere = "this computer" | "google" | "anthropic" | "openai" | "your server" | "deis demo server";

export const PRIVACY_BADGE: Record<PrivacyWhere, string> = {
  "this computer": "Stays on this computer",
  google: "Sent to Google AI Studio",
  anthropic: "Sent to Anthropic",
  openai: "Sent to OpenAI",
  "your server": "Sent to your server",
  "deis demo server": "Sent to the Deis demo server",
};

export type Privacy = {
  where: PrivacyWhere;
  /** Short badge text for a model option: "Stays on this computer". */
  badge: string;
  /** One plain sentence for privacy copy: what leaves the device, and to whom. */
  sentence: string;
};

export type EffectiveModel = {
  /** The settings requests are sent with (the saved choice, or the demo default). */
  settings: AiSettings;
  /** The user saved a choice; false means the default is in use. */
  chosen: boolean;
  /** The tier that will actually answer, after the local stand-in. */
  tier: Tier;
  /** For the sidebar pill and headings: "Gemma on this computer". */
  label: string;
  /** The model name when known: "gemma4:e4b", "gemma-4-26b-a4b-it". */
  model: string | null;
  /** One line of detail: "gemma4:e4b through Ollama", "Asked in turn: Google AI Studio, openrouter.ai". */
  detail: string;
  privacy: Privacy;
  /** False when the server will refuse these settings right now (reason says why). */
  usable: boolean;
  reason?: string;
  /** True when this choice keeps working in offline mode (it runs on this computer). */
  worksOffline: boolean;
  /** Provider "demo" answered by Gemma on this computer, because there are no demo hosts or offline mode is on. */
  standIn: boolean;
};

const LOOPBACK = /^https?:\/\/(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\])(:\d+)?(\/|$)/i;
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const OFFLINE_REASON = "Offline mode is on. Choose Gemma on this computer in Settings.";

function privacy(where: PrivacyWhere, sentence: string): Privacy {
  return { where, badge: PRIVACY_BADGE[where], sentence };
}

const STAYS = "Everything stays on this computer: your profile, the postings and every kit.";

/** Decide which model answers and how to describe it. Pure: safe to call per option in Settings. */
export function effectiveModel(ai: AiSettings | null, status: ServerStatus | null): EffectiveModel {
  const settings: AiSettings = ai ?? { provider: "demo" };
  const chosen = Boolean(ai);
  const hosted = Boolean(status?.hosted);
  const mode: OfflineMode = status?.offline?.mode ?? "off";
  const offline = mode !== "off";
  const base = { settings, chosen, usable: true, standIn: false } as const;

  switch (settings.provider) {
    case "demo": {
      // The server answers "demo" with Gemma on this computer when it has no demo hosts, or in offline mode.
      if (!hosted && status && (offline || !status.demoModel)) {
        return {
          ...base,
          tier: "local",
          label: "Gemma on this computer",
          model: DEFAULTS.ollama,
          detail: `${DEFAULTS.ollama} through Ollama`,
          privacy: privacy("this computer", STAYS),
          worksOffline: true,
          standIn: true,
        };
      }
      const hosts = status?.demoHosts ?? [];
      const names = hosts.map((h) => h.label);
      const first = names[0];
      const detail = names.length ? `Asked in turn: ${names.join(", ")}` : "Gemma 4 on the demo's hosts";
      if (hosted || !status) {
        return {
          ...base,
          tier: "demo",
          label: "Demo Gemma",
          model: hosts[0]?.model ?? null,
          detail,
          privacy: privacy(
            "deis demo server",
            `The facts used for each kit and the job posting are sent to the Deis demo server, which asks Gemma at ${first ?? "Google AI Studio"}${names.length > 1 ? " or a backup host" : ""}. On the web demo, try a demo profile rather than your real CV.`,
          ),
          worksOffline: false,
          usable: hosted ? status?.demoModel !== false : true,
          reason: hosted && status?.demoModel === false ? "The demo's Gemma isn't set up on this server." : undefined,
        };
      }
      // A local or self-hosted run with demo keys in its env: this server forwards to those hosts.
      const google = first === "Google AI Studio";
      return {
        ...base,
        tier: "demo",
        label: google ? "Gemma on AI Studio (server key)" : `Gemma at ${first ?? "the demo hosts"}`,
        model: hosts[0]?.model ?? null,
        detail,
        privacy: google
          ? privacy("google", `The facts used for each kit and the job posting are sent to Google AI Studio with this server's key${names.length > 1 ? `, then ${names.slice(1).join(", ")} if it fails` : ""}.`)
          : privacy("your server", `The facts used for each kit and the job posting are sent to ${names.join(", ")}, set up on this server.`),
        worksOffline: false,
      };
    }
    case "google":
      return {
        ...base,
        tier: "cloud",
        label: "Gemma on AI Studio",
        model: settings.model,
        detail: `${settings.model} on your Google AI Studio key`,
        privacy: privacy("google", "The facts used for each kit and the job posting are sent to Google AI Studio on your own key."),
        worksOffline: false,
        usable: !offline,
        reason: offline ? OFFLINE_REASON : undefined,
      };
    case "anthropic":
    case "openaiApi": {
      const a = settings.provider === "anthropic";
      const who = a ? "Anthropic" : "OpenAI";
      return {
        ...base,
        tier: "cloud",
        label: a ? "Claude on your Anthropic key" : "GPT on your OpenAI key",
        model: settings.model,
        detail: `${settings.model} on your ${who} key, ${settings.effort} effort`,
        privacy: privacy(a ? "anthropic" : "openai", `The facts used for each kit and the job posting are sent to ${who} on your own key, and the usage is billed to your ${who} account.`),
        worksOffline: false,
        usable: !offline,
        reason: offline ? OFFLINE_REASON : undefined,
      };
    }
    case "ollama": {
      const local = LOOPBACK.test(settings.baseUrl);
      const kit = settings.kitModel && settings.kitModel !== settings.model ? `, kits by ${settings.kitModel}` : "";
      if (hosted)
        return {
          ...base,
          tier: "local",
          label: "Gemma on this computer",
          model: settings.model,
          detail: `${settings.model} through Ollama${kit}`,
          privacy: privacy("this computer", STAYS),
          worksOffline: true,
          usable: false,
          reason: "Ollama runs on your own computer. Download the Deis app to use it.",
        };
      return local
        ? { ...base, tier: "local", label: "Gemma on this computer", model: settings.model, detail: `${settings.model} through Ollama${kit}`, privacy: privacy("this computer", STAYS), worksOffline: true }
        : {
            ...base,
            tier: "custom",
            label: "Gemma on your server",
            model: settings.model,
            detail: `${settings.model} at ${hostOf(settings.baseUrl)}${kit}`,
            privacy: privacy("your server", `The facts used for each kit and the job posting are sent to your Ollama server at ${hostOf(settings.baseUrl)}.`),
            worksOffline: false,
            usable: !offline,
            reason: offline ? OFFLINE_REASON : undefined,
          };
    }
    case "openai": {
      const tier = tierOf(settings);
      const host = hostOf(settings.baseUrl);
      if (tier === "local")
        return { ...base, tier, label: "Your model on this computer", model: settings.model, detail: `${settings.model} at ${host}`, privacy: privacy("this computer", STAYS), worksOffline: true };
      return {
        ...base,
        tier,
        label: "Your own server",
        model: settings.model,
        detail: `${settings.model} at ${host}`,
        privacy: privacy("your server", `The facts used for each kit and the job posting are sent to ${host}.`),
        worksOffline: false,
        usable: !offline,
        reason: offline ? OFFLINE_REASON : undefined,
      };
    }
  }
}

/** The sidebar pill: "Gemma on this computer · Offline". */
export function modelPill(m: EffectiveModel, offline: boolean): string {
  return offline ? `${m.label} · Offline` : m.label;
}
