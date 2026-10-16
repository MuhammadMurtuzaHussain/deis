import { describe, expect, it } from "vitest";
import { fromLinkedInExport, linkedinDate, parseCsv, splitDescription } from "@/lib/import/linkedin";

describe("LinkedIn export", () => {
  it("parses quoted CSV with commas and newlines inside fields", () => {
    const rows = parseCsv('Company Name,Title,Description\n"Kiln Coffee, Dublin",Barista,"Trained staff\nRan the till"\n');
    expect(rows).toEqual([{ "Company Name": "Kiln Coffee, Dublin", Title: "Barista", Description: "Trained staff\nRan the till" }]);
  });

  it("reads LinkedIn's month-year dates", () => {
    expect(linkedinDate("Jun 2023")).toBe("2023-06");
    expect(linkedinDate("2022")).toBe("2022");
    expect(linkedinDate("")).toBeNull();
  });

  it("splits a description into separate achievements", () => {
    expect(splitDescription("• Built a dashboard in React\n• Wrote SQL for refunds\n• ok")).toEqual(["Built a dashboard in React", "Wrote SQL for refunds"]);
    expect(splitDescription("Built a dashboard in React. Wrote SQL queries for refunds.")).toEqual(["Built a dashboard in React", "Wrote SQL queries for refunds"]);
  });

  it("turns the export into unconfirmed facts without any AI", () => {
    const out = fromLinkedInExport({
      "profile.csv": "First Name,Last Name,Headline,Summary,Geo Location\nAoife,Byrne,Graduate,,Dublin\n",
      "positions.csv": 'Company Name,Title,Description,Location,Started On,Finished On\nHarbour Payments,Software Engineering Intern,"Built a React dashboard for support agents. Raised test coverage from 41% to 68%.",Dublin,Jun 2025,Aug 2025\n',
      "education.csv": "School Name,Start Date,End Date,Notes,Degree Name,Activities\nUniversity College Dublin,2022,2026,,BSc Computer Science,NetSoc events officer\n",
      "skills.csv": "Name\nPython\nTypeScript\nSQL\n",
    });
    expect(out.header.name).toBe("Aoife Byrne");
    const role = out.facts.find((f) => f.kind === "role")!;
    expect(role).toMatchObject({ org: "Harbour Payments", start: "2025-06", end: "2025-08" });
    expect(out.facts.filter((f) => f.kind === "achievement" && f.org === "Harbour Payments").map((f) => f.text)).toEqual([
      "Built a React dashboard for support agents",
      "Raised test coverage from 41% to 68%",
    ]);
    expect(out.facts.find((f) => f.kind === "education")?.text).toBe("BSc Computer Science, University College Dublin");
    expect(out.facts.find((f) => f.kind === "skill")?.text).toBe("Python, TypeScript, SQL");
    expect(out.facts.every((f) => !f.confirmed && f.source === "linkedin_export")).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { languageLine, tidyImported } from "@/lib/import/linkedin";
import { readProfileFile } from "@/lib/import/files";

describe("CV import tidying (OQ-8)", () => {
  it("reads the date forms CVs use", () => {
    expect(linkedinDate("Sept 2021")).toBe("2021-09");
    expect(linkedinDate("September 2021")).toBe("2021-09");
    expect(linkedinDate("May 2025")).toBe("2025-05");
    expect(linkedinDate("09/2021")).toBe("2021-09");
    expect(linkedinDate("2021-09")).toBe("2021-09");
    expect(linkedinDate("Present")).toBe("present");
  });

  // What gemma4:e4b returned for the audit's sample CV (a made-up Cork graduate), and the CV's own skills line.
  const cv = "Excel (pivot tables, VLOOKUP, Power Query), Xero, Sage, basic Python, SQL\nLanguages: English (native), Irish (fluent), Spanish (B2)";
  it("stores dates so roles sort and the degree is the latest education", () => {
    const degree = tidyImported({ kind: "education" as const, text: "Bachelor of Commerce (International), Second Class Honours Grade 1 (2.1)", start: "Sept 2021", end: "May 2025" });
    const lc = tidyImported({ kind: "education" as const, text: "Leaving Certificate with 533 points", start: null, end: "2021" });
    expect([degree.start, degree.end]).toEqual(["2021-09", "2025-05"]);
    expect([lc, degree].sort((a, b) => (b.end ?? "").localeCompare(a.end ?? ""))[0]).toBe(degree);
    expect(tidyImported({ kind: "role" as const, text: "Sales Assistant", start: "Sept 2021 – May 2024", end: null })).toMatchObject({ start: "2021-09", end: "2024-05" });
    // Unspaced ranges too, or a finished degree reads as ongoing (R5).
    expect(tidyImported({ kind: "education" as const, text: "BSc", start: "2021-2025", end: null })).toMatchObject({ start: "2021", end: "2025" });
    expect(tidyImported({ kind: "education" as const, text: "BSc", start: "2021–2025", end: null })).toMatchObject({ start: "2021", end: "2025" });
    expect(tidyImported({ kind: "role" as const, text: "Sales Assistant", start: "Sep 2021-May 2024", end: null })).toMatchObject({ start: "2021-09", end: "2024-05" });
    expect(tidyImported({ kind: "role" as const, text: "Sales Assistant", start: "2021-09", end: null })).toMatchObject({ start: "2021-09", end: null });
    expect(tidyImported({ kind: "role" as const, text: "Finance Intern", start: "Jun 2024", end: "Aug 2024", where: " Cork " }).where).toBe("Cork");
  });
  it("writes languages the way a CV does", () => {
    expect(tidyImported({ kind: "language" as const, text: "Irish is fluent" }).text).toBe("Irish (fluent)");
    expect(languageLine("English is a native language")).toBe("English (native)");
    expect(languageLine("Spanish is at a B2 level")).toBe("Spanish (B2)");
    expect(languageLine("Fluent in Irish")).toBe("Irish (fluent)");
    expect(languageLine("English (fluent), Hindi, Malayalam")).toBe("English (fluent), Hindi, Malayalam");
  });
  it("keeps skills as the CV wrote them, without qualifiers it didn't use", () => {
    expect(tidyImported({ kind: "skill" as const, text: "Proficient in Excel including pivot tables, VLOOKUP, and Power Query" }, cv).text).toBe("Excel including pivot tables, VLOOKUP, and Power Query");
    expect(tidyImported({ kind: "skill" as const, text: "Experienced with Xero and Sage" }, cv).text).toBe("Xero and Sage");
    expect(tidyImported({ kind: "skill" as const, text: "Basic knowledge of Python and SQL" }, cv).text).toBe("Basic knowledge of Python and SQL");
  });
});

describe("LinkedIn ZIP limits (SEC-11)", () => {
  const zipFile = async (entries: Record<string, string>, name = "export.zip") => {
    const zip = new JSZip();
    for (const [n, text] of Object.entries(entries)) zip.file(n, text);
    return new File([await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })], name);
  };
  it("opens only the profile files, never messages or contacts", async () => {
    const file = await zipFile({
      "Positions.csv": "Company Name,Title,Description,Location,Started On,Finished On\nHarbour Payments,Intern,,Dublin,Jun 2025,Aug 2025\n",
      "messages.csv": "FROM,TO,CONTENT\na,b,private\n",
      "Connections.csv": "First Name\nSomeone\n",
    });
    const read = await readProfileFile(file);
    expect(read.kind).toBe("linkedin_export");
    if (read.kind === "linkedin_export") expect(read.result.files).toEqual(["positions.csv"]);
  });
  it("skips an entry over 5 MB and refuses an archive over 50 MB", async () => {
    const big = `Name\n${"x".repeat(6 * 1024 * 1024)}\n`;
    const read = await readProfileFile(await zipFile({ "Positions.csv": "Company Name,Title\nKiln Coffee,Barista\n", "Skills.csv": big }));
    if (read.kind === "linkedin_export") expect(read.result.files).toEqual(["positions.csv"]);
    const huge = { name: "export.zip", size: 51 * 1024 * 1024, type: "application/zip", arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File;
    await expect(readProfileFile(huge)).rejects.toThrow(/50 MB/);
  });
});

describe("pdf.js worker (OFF-10, CH-21)", () => {
  it("is the same version as the pdfjs-dist the app imports", () => {
    const { version } = JSON.parse(readFileSync("node_modules/pdfjs-dist/package.json", "utf8"));
    expect(readFileSync("public/pdf.worker.min.mjs", "utf8")).toContain(`"${version}"`);
  });
});
