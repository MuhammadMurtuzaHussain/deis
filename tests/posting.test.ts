import { describe, expect, it } from "vitest";
import { postingBlocks } from "@/lib/jobs/posting";

// The full posting, put back into headings, paragraphs and lists. The two shapes below are
// how real postings arrive after sanitize.ts: a board posting with "•" items, and a Google Jobs
// posting whose items lost their markers and sit between blank lines.

const long = (s: string) => `${s} ${"and more detail about the team, the product and the way we work together every day.".repeat(3)}`;

describe("postingBlocks", () => {
  it("keeps a board posting's headings and bullet lists", () => {
    const text = ["Who we are", "", "About Stripe", "", long("Stripe is a financial infrastructure platform."), "", "Responsibilities", "• Own the full sales cycle", "• Identify high-potential users", "", "Minimum requirements", "• 2+ years of closing sales experience"].join("\n");
    expect(postingBlocks(text)).toEqual([
      { kind: "heading", text: "Who we are" },
      { kind: "heading", text: "About Stripe" },
      { kind: "paragraph", text: long("Stripe is a financial infrastructure platform.") },
      { kind: "heading", text: "Responsibilities" },
      { kind: "list", items: ["Own the full sales cycle", "Identify high-potential users"] },
      { kind: "heading", text: "Minimum requirements" },
      { kind: "list", items: ["2+ years of closing sales experience"] },
    ]);
  });

  it("turns a Google Jobs run of unmarked short lines back into a list", () => {
    const text = [
      "Role Overview",
      "",
      "Location: Cork (Hybrid)",
      "",
      long("We're hiring graduate mobile engineers."),
      "",
      "What You Will Be Doing",
      "",
      "Building features in our native Android (Kotlin) and iOS (Swift) applications, from ticket to release.",
      "",
      "Owning the quality of what you build, including functional QA and release validation.",
      "",
      "Integrating APIs, SDKs and cloud services to power app functionality.",
      "",
      "What You Will Gain",
      "",
      "Hands-on experience shipping native apps used by millions of customers.",
      "",
      "Real ownership of quality, which is the fastest route to trust on this team.",
    ].join("\n");
    expect(postingBlocks(text)).toEqual([
      { kind: "heading", text: "Role Overview" },
      { kind: "paragraph", text: "Location: Cork (Hybrid)" },
      { kind: "paragraph", text: long("We're hiring graduate mobile engineers.") },
      { kind: "heading", text: "What You Will Be Doing" },
      {
        kind: "list",
        items: [
          "Building features in our native Android (Kotlin) and iOS (Swift) applications, from ticket to release.",
          "Owning the quality of what you build, including functional QA and release validation.",
          "Integrating APIs, SDKs and cloud services to power app functionality.",
        ],
      },
      { kind: "heading", text: "What You Will Gain" },
      { kind: "list", items: ["Hands-on experience shipping native apps used by millions of customers.", "Real ownership of quality, which is the fastest route to trust on this team."] },
    ]);
  });

  it("keeps a lead-in sentence as a paragraph above its bullets", () => {
    const text = ["We'd love to hear from you if you bring the following to the team:", "• SQL", "• Python"].join("\n");
    expect(postingBlocks(text)).toEqual([
      { kind: "paragraph", text: "We'd love to hear from you if you bring the following to the team:" },
      { kind: "list", items: ["SQL", "Python"] },
    ]);
  });

  it("keeps an unmarked list's lead-in out of the list", () => {
    const text = [
      "Here is a taster of the diverse work our AI & Data analysts do:",
      "Radically reimagine a client process with AI and be at the heart of the delivery",
      "Scale AI solutions for the world's largest companies as an AI engineer",
    ].join("\n");
    expect(postingBlocks(text)).toEqual([
      { kind: "paragraph", text: "Here is a taster of the diverse work our AI & Data analysts do:" },
      { kind: "list", items: ["Radically reimagine a client process with AI and be at the heart of the delivery", "Scale AI solutions for the world's largest companies as an AI engineer"] },
    ]);
  });

  it("keeps items without full stops in the list after a lead-in, and Title Case headings out of it", () => {
    const text = [
      "We are looking for graduates who are familiar with any number of the following:",
      "Knowledge of how data and AI can be used to solve business problems",
      "Experience with generative AI and agentic AI technologies",
      "Cloud data platform experience/knowledge (AWS, MS Azure, Google Cloud Platform)",
      "What You Will Gain",
      "Structured graduate training and mentoring.",
      "Hands-on experience working with real-world datasets.",
    ].join("\n");
    expect(postingBlocks(text)).toEqual([
      { kind: "paragraph", text: "We are looking for graduates who are familiar with any number of the following:" },
      {
        kind: "list",
        items: [
          "Knowledge of how data and AI can be used to solve business problems",
          "Experience with generative AI and agentic AI technologies",
          "Cloud data platform experience/knowledge (AWS, MS Azure, Google Cloud Platform)",
        ],
      },
      { kind: "heading", text: "What You Will Gain" },
      { kind: "list", items: ["Structured graduate training and mentoring.", "Hands-on experience working with real-world datasets."] },
    ]);
  });

  it("leaves two prose sentences after a paragraph as paragraphs", () => {
    const text = [
      long("Technology is changing the world faster than ever before."),
      "Every day around the world, we work with exceptional people, the latest and greatest tech and leading companies across industries.",
      "You'll learn, grow and advance in a diverse culture of shared success.",
    ].join("\n");
    expect(postingBlocks(text).map((b) => b.kind)).toEqual(["paragraph", "paragraph", "paragraph"]);
  });

  it("reads three or more bare labels in a row as a list, not headings", () => {
    expect(postingBlocks(["Skills", "", "Python", "SQL", "Power BI"].join("\n"))).toEqual([{ kind: "list", items: ["Skills", "Python", "SQL", "Power BI"] }]);
  });

  it("rejoins sentences Google Jobs split around bold words, without merging list items", () => {
    const text = [
      "Preferred Skills",
      "",
      "Basic knowledge of",
      "Python",
      ",",
      "R",
      ", or",
      "SQL",
      ".",
      "Familiarity with",
      "NumPy",
      ",",
      "Pandas",
      ", Matplotlib, or similar analytical libraries.",
      "Familiarity with",
      "Power BI",
      "or Tableau is an advantage.",
      "Basic understanding of machine learning concepts is advantageous.",
    ].join("\n");
    expect(postingBlocks(text)).toEqual([
      { kind: "heading", text: "Preferred Skills" },
      {
        kind: "list",
        items: [
          "Basic knowledge of Python, R, or SQL.",
          "Familiarity with NumPy, Pandas, Matplotlib, or similar analytical libraries.",
          "Familiarity with Power BI or Tableau is an advantage.",
          "Basic understanding of machine learning concepts is advantageous.",
        ],
      },
    ]);
  });

  it("leaves a single sentence alone and returns nothing for empty text", () => {
    expect(postingBlocks("A short note about the role.")).toEqual([{ kind: "paragraph", text: "A short note about the role." }]);
    expect(postingBlocks("  \n\n ")).toEqual([]);
  });
});
