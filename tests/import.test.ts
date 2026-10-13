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
