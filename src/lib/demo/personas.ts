import type { Fact, Profile } from "../profile/types";

// Two fictional people for the demo and the evals. The universities are real places
// people study; the employers, societies and projects are invented, so nothing here
// is a record of a real person or a real company's hire.

const at = "2026-10-13T00:00:00.000Z";
const f = (id: string, kind: Fact["kind"], text: string, extra: Partial<Fact> = {}): Fact => ({
  id,
  kind,
  text,
  source: "demo",
  confirmed: true,
  createdAt: at,
  ...extra,
});

export const aoife: Profile = {
  header: { name: "Aoife Byrne", email: "aoife.byrne@example.ie", phone: "+353 85 000 0000", location: "Dublin, Ireland", links: ["github.com/example-aoife"] },
  neverClaim: ["any certification"],
  preferences: {
    cities: ["Dublin"],
    remoteOk: true,
    stage: "graduate",
    workStatus: "eu",
    languages: ["Irish"],
    roles: ["software engineer", "data engineer"],
    dealBreakers: [],
    showStretch: false,
  },
  facts: [
    f("ab1", "education", "BSc Computer Science, University College Dublin", { org: "University College Dublin", start: "2022", end: "2026" }),
    f("ab2", "project", "Final-year project: a timetable app for Dublin Bus that predicts delays from 6 months of open GTFS data, built in Python with scikit-learn", { org: "University College Dublin" }),
    f("ab3", "achievement", "Final-year project graded first class", { org: "University College Dublin" }),
    f("ab4", "role", "Software Engineering Intern", { org: "Harbour Payments", title: "Software Engineering Intern", start: "2025-06", end: "2025-08", where: "Dublin" }),
    f("ab5", "achievement", "Built an internal TypeScript and React dashboard that support agents used to look up failed card payments", { org: "Harbour Payments" }),
    f("ab6", "achievement", "Wrote SQL queries in PostgreSQL to find duplicate refunds, which the finance team reviewed weekly", { org: "Harbour Payments" }),
    f("ab7", "achievement", "Added unit tests that raised coverage on the refunds service from 41% to 68%", { org: "Harbour Payments" }),
    f("ab8", "role", "Weekend Barista", { org: "Kiln Coffee", title: "Barista", start: "2023-09", end: "2026-05", where: "Dublin" }),
    f("ab9", "achievement", "Trained 4 new staff on the till and opening checklist", { org: "Kiln Coffee" }),
    f("ab10", "leadership", "Events officer for the university's computer society, running 12 workshops in one year for 30 to 80 students each", { org: "UCD NetSoc" }),
    f("ab11", "skill", "Python, TypeScript, React, SQL, PostgreSQL, Git, Docker"),
    f("ab12", "language", "Irish (conversational)"),
  ],
};

export const rahul: Profile = {
  header: { name: "Rahul Menon", email: "rahul.menon@example.com", phone: "+353 87 000 0000", location: "Galway, Ireland", links: ["linkedin.com/in/example-rahul"] },
  neverClaim: ["any certification", "years of experience"],
  preferences: {
    cities: ["Galway", "Dublin", "Limerick"],
    remoteOk: true,
    stage: "graduate",
    workStatus: "stamp1g",
    languages: ["Hindi"],
    roles: ["data analyst", "business analyst"],
    dealBreakers: [],
    showStretch: true,
  },
  facts: [
    f("rm1", "education", "MSc Data Analytics, University of Galway", { org: "University of Galway", start: "2024", end: "2025" }),
    f("rm2", "education", "BTech Information Technology, Cochin University of Science and Technology", { org: "Cochin University of Science and Technology", start: "2019", end: "2023" }),
    f("rm3", "project", "MSc thesis: forecast weekly footfall for 3 Galway retail units using Python, Prophet and 2 years of sensor data", { org: "University of Galway" }),
    f("rm4", "role", "Junior Data Analyst", { org: "Lantern Logistics", title: "Junior Data Analyst", start: "2023-07", end: "2024-07", where: "Kochi, India" }),
    f("rm5", "achievement", "Built Power BI dashboards on delivery times for 5 regional managers", { org: "Lantern Logistics" }),
    f("rm6", "achievement", "Automated a weekly Excel report with Python, saving about 3 hours a week", { org: "Lantern Logistics" }),
    f("rm7", "achievement", "Cleaned and joined 2 years of shipment data in SQL to find late-delivery causes", { org: "Lantern Logistics" }),
    f("rm8", "role", "Part-time Customer Assistant", { org: "Corrib Grocers", title: "Customer Assistant", start: "2024-10", end: "present", where: "Galway" }),
    f("rm9", "achievement", "Handled stock counts and customer queries on 20-hour weekly shifts during the MSc", { org: "Corrib Grocers" }),
    f("rm10", "leadership", "Class representative for the MSc Data Analytics cohort", { org: "University of Galway" }),
    f("rm11", "skill", "Python, pandas, SQL, Power BI, Excel, R, Tableau"),
    f("rm12", "language", "English (fluent), Hindi, Malayalam"),
  ],
};

export const PERSONAS = { aoife, rahul } as const;
export type PersonaId = keyof typeof PERSONAS;
