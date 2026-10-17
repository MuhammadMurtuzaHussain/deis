import { describe, expect, it } from "vitest";
import { CATEGORIES, categoriesForTitle, searchCategories } from "@/lib/jobs/categories";

const ids = (q: string) => searchCategories(q).map((c) => c.id);

describe("kinds of work", () => {
  it("has unique ids and covers work beyond tech", () => {
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
    for (const id of ["tax", "accounting", "management", "finance", "insurance", "health", "education", "retail", "construction", "public", "admin"]) expect(ids("")).toContain(id);
  });
  it("sorts tax, accounting and management titles into their own fields", () => {
    expect(categoriesForTitle("Tax Trainee")).toEqual(["tax"]);
    expect(categoriesForTitle("Trainee Accountant (ACA)")).toEqual(["accounting"]);
    expect(categoriesForTitle("Audit Associate")).toEqual(["accounting"]);
    expect(categoriesForTitle("Graduate Management Trainee")).toEqual(["management"]);
    expect(categoriesForTitle("Treasury Analyst")).toContain("finance");
    expect(categoriesForTitle("Treasury Analyst")).not.toContain("accounting");
  });
  it("finds fields by label, by extra words and by job title, ignoring case", () => {
    expect(ids("Tax")).toContain("tax");
    expect(ids("acc")).toContain("accounting");
    expect(ids("bookkeeping")).toEqual(["accounting"]);
    expect(ids("auditor")).toEqual(["accounting"]);
    expect(ids("management")).toContain("management");
    expect(ids("nursing")).toEqual(["health"]);
    expect(ids("  ")).toHaveLength(CATEGORIES.length);
    expect(ids("zzzz")).toEqual([]);
  });
});
