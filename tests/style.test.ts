import { describe, expect, it } from "vitest";
import { FIRST_PERSON, houseStyle } from "@/lib/cv/style";

// House style garbled live text (audit OQ-7, OQ-X3). Each case here is a sentence it broke.

describe("buzzwords go only when they describe the person", () => {
  it("rewrites 'passionate about' instead of leaving 'I am about'", () => {
    expect(houseStyle("I am passionate about public transport data.")).toBe("I am interested in public transport data.");
    expect(houseStyle("Passionate about data")).toBe("Interested in data");
  });
  it("leaves ordinary uses of the words alone", () => {
    expect(houseStyle("Studied dynamic programming and graph algorithms.")).toBe("Studied dynamic programming and graph algorithms.");
    expect(houseStyle("Built a dynamic dashboard in React.")).toBe("Built a dynamic dashboard in React.");
    expect(houseStyle("A dynamic, fast-paced team")).toBe("A dynamic, fast-paced team");
    expect(houseStyle("Delivered a self-starter pack for new members")).toBe("Delivered a self-starter pack for new members");
  });
  it("never deletes a sentence-initial verb", () => {
    expect(houseStyle("Motivated 4 new staff to follow the checklist.")).toBe("Motivated 4 new staff to follow the checklist.");
    expect(houseStyle("Motivated the team leader to plan the rota.")).toBe("Motivated the team leader to plan the rota.");
  });
  it("still trims the person-describing ones, keeping the article right", () => {
    expect(houseStyle("Highly motivated Computer Science graduate with a 2.1")).toBe("Computer Science graduate with a 2.1");
    expect(houseStyle("A motivated and detail-oriented graduate")).toBe("A graduate");
    expect(houseStyle("A hard-working engineer")).toBe("An engineer");
    expect(houseStyle("Results-driven analyst")).toBe("Analyst");
  });
});

describe("tool names keep their own casing", () => {
  it("doesn't capitalise pandas, scikit-learn or iOS at the start of a line", () => {
    expect(houseStyle("pandas")).toBe("pandas");
    expect(houseStyle("scikit-learn")).toBe("scikit-learn");
    expect(houseStyle("iOS")).toBe("iOS");
    expect(houseStyle("macOS development")).toBe("macOS development");
    expect(houseStyle("built a dashboard")).toBe("Built a dashboard");
  });
});

describe("first person on a CV", () => {
  it("reads the Roman numeral I in course and grade names as a numeral", () => {
    for (const s of ["Modules: Calculus I, Linear Algebra", "Grade I piano", "Financial Accounting I and II", "Passed Level I of the exam", "Statistics I (A1)", "Calculus I"]) {
      expect(FIRST_PERSON.test(s), s).toBe(false);
    }
  });
  it("still catches I, I'm, my and me", () => {
    for (const s of ["I built a dashboard", "In Cork I built a dashboard", "My role was support", "I'm keen to learn", "It taught me SQL"]) {
      expect(FIRST_PERSON.test(s), s).toBe(true);
    }
  });
});
