import { describe, expect, it } from "vitest";
import type { EarningsCall, EvidenceDoc } from "./types";
import {
  callHashInput,
  closestPassage,
  containsVerbatim,
  normalizeText,
  quoteFromDocument,
  validateModelCall,
} from "./validate";

// Excerpts of Apple's fiscal Q4 2026 8-K EX-99.1 and 10-K MD&A, as the packet extractor produced them.
const PRESS_RELEASE: EvidenceDoc = {
  source: "press_release",
  form: "8-K EX-99.1",
  accession: "0000320193-26-000101",
  filedAt: "2026-11-02T21:30:00.000Z",
  periodEnd: "2026-09-26",
  url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000101/a8-kex991q4202609262026.htm",
  text: [
    "Apple reports fourth quarter results",
    "CUPERTINO, CALIFORNIA — Apple® today announced financial results for its fiscal 2026 fourth quarter ended September 26, 2026. The Company posted quarterly revenue of $114.5 billion, up 12 percent year over year. Company gross margin was 47.9 percent, including a favorable impact of approximately 1 percentage point from tariff refunds. Diluted earnings per share was $2.10, up 14 percent year over year, and included a favorable impact of $0.05 from tariff refunds.",
    "“Apple delivered September quarter records for net income and EPS. Our record September quarter capped off a strong fiscal 2026, with all-time record revenue of $479 billion and double-digit EPS growth,” said Kevan Parekh, Apple’s CFO. “We generated $28 billion in operating cash flow during the quarter, allowing us to return $28 billion to shareholders.”",
  ].join("\n"),
};

const MDNA: EvidenceDoc = {
  source: "mdna",
  form: "10-K",
  accession: "0000320193-26-000105",
  filedAt: "2026-10-30T20:05:00.000Z",
  periodEnd: "2026-09-26",
  url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000105/aapl-20260926.htm",
  text: [
    "Greater China net sales increased during 2026 compared to 2025 primarily due to higher net sales of iPhone and Mac. The strength in the renminbi relative to the U.S. dollar had a favorable year-over-year impact on Greater China net sales during 2026.",
    "Products gross margin and gross margin percentage increased during 2026 compared to 2025 primarily due to product mix and tariff refunds, partially offset by higher costs, including memory.",
    "Apple Inc. | 2026 Form 10-K | 26",
  ].join("\n"),
};

const DOCS = [PRESS_RELEASE, MDNA];
const CTX = {
  ticker: "AAPL",
  docs: DOCS,
  allowedNumbers: [344.63, 1.9, 8, 7.35, 3.24],
  line: 1.9,
  moves: [7.35, 3.24],
};

function validCall() {
  return {
    ticker: "AAPL",
    direction: "up",
    move: "under",
    confidence: 3,
    bull: {
      point: "Double-digit growth on a $114.5 billion quarter sets a high bar for the December quarter.",
      source: "press_release",
      quote: "The Company posted quarterly revenue of $114.5 billion, up 12 percent year over year.",
    },
    bear: {
      point: "Memory costs are rising while the tariff refund that propped up margins will not repeat.",
      source: "mdna",
      quote: "partially offset by higher costs, including memory",
    },
    thesis: "Record Q4 sales and 47.9 percent gross margin support a move inside the 1.9% line.",
    wrong_if: "Guidance implies margin below 47.9 percent once tariff refunds fade.",
  };
}

function errorsFor(raw: unknown): string[] {
  const result = validateModelCall(raw, CTX);
  return result.ok ? [] : result.errors;
}

describe("normalizeText", () => {
  it("folds quotes, dashes, pipes, spacing and case", () => {
    expect(normalizeText("Apple’s  “record” quarter — up− 12 | Form 10‑K")).toBe(
      "apple's \"record\" quarter - up- 12 form 10-k",
    );
  });
});

describe("containsVerbatim", () => {
  const text = normalizeText(PRESS_RELEASE.text);

  it("matches only at word boundaries", () => {
    expect(containsVerbatim(text, "quarterly revenue of $114.5 billion")).toBe(true);
    expect(containsVerbatim(text, "quarterly revenue of $114")).toBe(false);
    expect(containsVerbatim(text, "5 billion, up 12 percent")).toBe(false);
    expect(containsVerbatim(text, "ompany posted quarterly revenue")).toBe(false);
  });

  it("lets a quote stop right before a sentence-ending period", () => {
    expect(containsVerbatim(text, "up 12 percent year over year")).toBe(true);
  });
});

describe("validateModelCall", () => {
  it("accepts a well-formed call with verbatim quotes and evidenced numbers", () => {
    const result = validateModelCall(validCall(), CTX);
    expect(result).toEqual({
      ok: true,
      call: {
        ...validCall(),
        direction: "up",
        move: "under",
        confidence: 3,
        bull: { ...validCall().bull, source: "press_release" },
        bear: { ...validCall().bear, source: "mdna" },
      },
    });
  });

  it("tolerates curly quotes and wrapping quote marks in the quote", () => {
    const call = validCall();
    call.bull.quote = "“Apple delivered September quarter records for net income and EPS.”";
    expect(errorsFor(call)).toEqual([]);
  });

  describe("quote holes found by the evidence verifier", () => {
    const withBullQuote = (quote: string) => ({ ...validCall(), bull: { ...validCall().bull, quote } });

    it("rejects a truncated number prefix ($114 of $114.5)", () => {
      expect(errorsFor(withBullQuote("The Company posted quarterly revenue of $114"))).toEqual([
        "bull.quote_not_found_in_press_release",
      ]);
    });

    it("rejects a quote that starts mid-word", () => {
      expect(errorsFor(withBullQuote("ompany posted quarterly revenue of $114.5 billion, up 1"))).toEqual([
        "bull.quote_not_found_in_press_release",
      ]);
    });

    it("rejects a 5-word quote and a 26-word quote", () => {
      expect(errorsFor(withBullQuote("posted quarterly revenue of $114.5"))).toEqual(["bull.quote_word_count:5"]);
      const words25 =
        "Company gross margin was 47.9 percent, including a favorable impact of approximately 1 percentage point from tariff refunds. Diluted earnings per share was $2.10, up";
      expect(errorsFor(withBullQuote(words25))).toEqual([]);
      expect(errorsFor(withBullQuote(`${words25} 14`))).toEqual(["bull.quote_word_count:26"]);
      expect(errorsFor(withBullQuote("posted quarterly revenue of $114.5 billion,"))).toEqual([]);
    });

    it("rejects identical bull and bear quotes", () => {
      const call = validCall();
      call.bear = { ...call.bear, source: "press_release", quote: `"${call.bull.quote}"` };
      expect(errorsFor(call)).toEqual(["quotes_identical"]);
    });

    it("rejects a quote attributed to the wrong document", () => {
      const call = validCall();
      call.bear.source = "press_release";
      expect(errorsFor(call)).toEqual(["bear.quote_not_found_in_press_release"]);
    });

    it("rejects a source with no document in the packet", () => {
      const result = validateModelCall(validCall(), { ...CTX, docs: [PRESS_RELEASE] });
      expect(result).toEqual({ ok: false, errors: ["bear.source_doc_missing:mdna"] });
    });
  });

  describe("numbers in prose", () => {
    it("rejects a number in the thesis that is not in the evidence", () => {
      const thesis = "Revenue grew 12.4% on record iPhone demand, after a 7.35% fall last time.";
      const call = { ...validCall(), thesis };
      expect(errorsFor(call)).toEqual(["thesis.number_not_in_evidence:12.4"]);
    });

    it("accepts supplied figures within 0.05 and ignores quarter numbers, years and form names", () => {
      const call = {
        ...validCall(),
        thesis: "Q4 fiscal 2026 10-K shows memory costs; last reaction -7.35%, prior close $344.63, line 1.92%.",
      };
      expect(errorsFor(call)).toEqual([]);
    });

    it("checks points and wrong_if too, and reports each figure once", () => {
      const call = {
        ...validCall(),
        bull: { ...validCall().bull, point: "Services hit $30bn on the back of the installed base." },
        wrong_if: "Gross margin falls under 46 percent or 46% again.",
      };
      expect(errorsFor(call)).toEqual(["bull.point.number_not_in_evidence:30", "wrong_if.number_not_in_evidence:46"]);
    });

    it("compares values, so $479 billion and 1,234 forms both work", () => {
      const docs = [{ ...PRESS_RELEASE, text: `${PRESS_RELEASE.text}\nBacklog was 1,234 units.` }, MDNA];
      const call = { ...validCall(), thesis: "Full-year revenue of $479bn and a 1234-unit backlog; the line is 1.9%." };
      const result = validateModelCall(call, { ...CTX, docs });
      expect(result.ok).toBe(true);
    });
  });

  describe("shape", () => {
    it("rejects non-objects", () => {
      expect(errorsFor(null)).toEqual(["not_object"]);
      expect(errorsFor("{}")).toEqual(["not_object"]);
    });

    it("checks enums, ticker, confidence and required text", () => {
      const call = {
        ...validCall(),
        ticker: "MSFT",
        direction: "sideways",
        move: "flat",
        confidence: 3.5,
        thesis: " ",
      };
      expect(errorsFor(call)).toEqual([
        "ticker.mismatch",
        "direction.invalid",
        "move.invalid",
        "confidence.invalid",
        "thesis.empty",
      ]);
      expect(errorsFor({ ...validCall(), confidence: 0 })).toEqual(["confidence.invalid"]);
      expect(errorsFor({ ...validCall(), confidence: 6 })).toEqual(["confidence.invalid"]);
    });

    it("accepts a lowercase ticker and normalises it", () => {
      const result = validateModelCall({ ...validCall(), ticker: "aapl" }, CTX);
      expect(result.ok && result.call.ticker).toBe("AAPL");
    });

    it("enforces length limits", () => {
      const call = {
        ...validCall(),
        bull: { ...validCall().bull, point: "x".repeat(241) },
        thesis: `${"x".repeat(296)} 1.9%`,
        wrong_if: "x".repeat(241),
      };
      expect(errorsFor(call)).toEqual(["bull.point.too_long", "thesis.too_long", "wrong_if.too_long"]);
      const bull = { ...validCall().bull, point: "x".repeat(240) };
      const atLimit = { ...validCall(), bull, thesis: `${"x".repeat(295)} 1.9%` };
      expect(errorsFor(atLimit)).toEqual([]);
    });

    it("reports missing sides and bad sources", () => {
      expect(errorsFor({ ...validCall(), bull: undefined })).toEqual(["bull.missing"]);
      expect(errorsFor({ ...validCall(), bear: { ...validCall().bear, source: "risk_factors" } })).toEqual([
        "bear.source_invalid",
      ]);
      expect(errorsFor({ ...validCall(), bear: { ...validCall().bear, quote: "" } })).toEqual(["bear.quote.empty"]);
    });
  });
});

describe("published quotes", () => {
  it("cuts the quote out of the document, so the page shows the filing's own text", () => {
    const shouted = "APPLE DELIVERED SEPTEMBER QUARTER RECORDS FOR NET INCOME AND EPS.";
    expect(quoteFromDocument(PRESS_RELEASE.text, shouted)).toBe(
      "Apple delivered September quarter records for net income and EPS.",
    );
    expect(quoteFromDocument(PRESS_RELEASE.text, "Apple's CFO")).toBe("Apple’s CFO");
    expect(quoteFromDocument(MDNA.text, "including memory. Apple Inc. 2026 Form")).toBe(
      "including memory.\nApple Inc. | 2026 Form".replace(/\s+/g, " "),
    );
    expect(quoteFromDocument(PRESS_RELEASE.text, "quarterly revenue of $114")).toBeNull();
  });

  it("finds the sentence a misquote came from, for the retry", () => {
    // A real calls-v2 misquote: Target's 10-Q says "The increase reflected higher compensation expense".
    const text = [
      "For the three months ended August 1, 2026, our SG&A expense rate was 21.6 percent compared with 21.3 percent.",
      "The increase reflected higher compensation expense, including stores payroll and incentive compensation.",
    ].join(" ");
    const misquote = "This increase reflects higher compensation expense, including stores payroll";
    expect(closestPassage(text, misquote)).toEqual({
      text: "The increase reflected higher compensation expense, including stores payroll and incentive compensation.",
      shared: 7,
    });
    expect(closestPassage(text, "zzz")).toBeNull();
  });

  it("locks the document's text, not the model's", () => {
    const call = validCall();
    call.bull.quote = call.bull.quote.toUpperCase();
    const result = validateModelCall(call, CTX);
    expect(result.ok && result.call.bull.quote).toBe(validCall().bull.quote);
  });
});

describe("writing rules", () => {
  // Each thesis cites the line, so the move rule stays out of the way of the rule under test.
  const withThesis = (thesis: string) => errorsFor({ ...validCall(), thesis: `${thesis} Line 1.9%.` });
  const withWrongIf = (wrong_if: string) => errorsFor({ ...validCall(), wrong_if });
  const withBull = (bull: Partial<ReturnType<typeof validCall>["bull"]>) =>
    errorsFor({ ...validCall(), bull: { ...validCall().bull, ...bull } });

  it("rejects a wrong_if that restates how the call is graded (real calls-v1 output)", () => {
    expect(withWrongIf("The stock closes down or the absolute move exceeds 1.9%.")).toEqual([
      "wrong_if.restates_grading",
    ]);
    expect(withWrongIf("The shares fall after the print.")).toEqual(["wrong_if.restates_grading"]);
    expect(withWrongIf("A move above 1.9% on the graded session.")).toEqual(["wrong_if.restates_grading"]);
    expect(withWrongIf("Gross margin falls below 47.9 percent once tariff refunds fade.")).toEqual([]);
  });

  it("rejects talk of the line or the move size when there is no line", () => {
    const noLine = { ...CTX, line: null, moves: [], allowedNumbers: [344.63] };
    const errors = (fields: object) => {
      const thesis = "Record Q4 sales should carry into the December quarter.";
      const result = validateModelCall({ ...validCall(), thesis, ...fields }, noLine);
      return result.ok ? [] : result.errors;
    };
    expect(errors({ thesis: "Record Q4 sales should carry into the December quarter." })).toEqual([]);
    expect(
      errors({ wrong_if: "The stock closes up or the absolute move exceeds the median of the past two reactions." }),
    ).toEqual(["wrong_if.restates_grading", "wrong_if.no_line_mentioned"]);
    expect(errors({ thesis: "Record Q4 sales, but the typical move is large." })).toEqual([
      "thesis.no_line_mentioned",
    ]);
    expect(errors({})).toEqual([]);
    expect(errors({ thesis: validCall().thesis })).toEqual([
      "thesis.no_line_mentioned",
      "thesis.number_not_in_evidence:1.9",
    ]);
    // Without a line the past moves are not supplied figures either.
    expect(errors({ thesis: "Record Q4 sales after a 7.35% fall last time." })).toEqual([
      "thesis.number_not_in_evidence:7.35",
    ]);
  });

  it("needs the thesis to argue the move from the line or a past reaction when there is a line", () => {
    const thesisErrors = (thesis: string) => errorsFor({ ...validCall(), thesis });
    expect(thesisErrors("Record Q4 sales should carry into the December quarter.")).toEqual(["thesis.move_unargued"]);
    expect(thesisErrors("Record Q4 sales carry over; the -7.35% fall last time shows misses land hard.")).toEqual([]);
  });

  it("rejects advice, consensus talk and the first person, but not business words", () => {
    expect(withThesis("Investors should buy the stock before the December quarter.")).toEqual([
      "thesis.advice_language",
    ]);
    expect(withThesis("A price target is out of scope; record Q4 sales carry over.")).toEqual([
      "thesis.advice_language",
    ]);
    expect(withThesis("Revenue should beat consensus on record Q4 sales.")).toEqual(["thesis.invented_consensus"]);
    expect(withThesis("Analysts expect record Q4 sales to carry over.")).toEqual(["thesis.invented_consensus"]);
    expect(withBull({ point: "Our cloud business nearly quadrupled, and that demand should carry over." })).toEqual([
      "bull.point.first_person",
    ]);
    expect(withThesis("US demand and short lead times hold up record Q4 sales into the next quarter.")).toEqual([]);
  });

  it("rejects unsupplied stock-move figures, and percentages the documents only hold as plain numbers", () => {
    expect(withThesis("Record Q4 sales; the shares could rally 12% from here.")).toEqual([
      "thesis.stock_forecast:12",
    ]);
    expect(withThesis("Record Q4 sales; the stock fell 7.35% after the last report.")).toEqual([]);
    expect(withThesis("Services revenue grew 114.5% in Q4.")).toEqual(["thesis.number_not_in_evidence:114.5"]);
    expect(withThesis("Revenue grew 12% in Q4 on iPhone demand.")).toEqual([]);
  });

  it("allows ISO dates and small counts, but not other bare small numbers", () => {
    expect(withThesis("3 of the last 8 reactions beat the 1.9% line, including -7.35% on 2026-07-31.")).toEqual([]);
    expect(withThesis("A 2% revenue shortfall would undo the record Q4 sales.")).toEqual([
      "thesis.number_not_in_evidence:2",
    ]);
    expect(withThesis("Record Q4 sales, with results due on the 11th, 11 days out.")).toEqual([
      "thesis.number_not_in_evidence:11",
    ]);
  });

  it("rejects points that copy their quote, and points too short to say anything", () => {
    const quote = validCall().bull.quote;
    expect(withBull({ point: quote })).toEqual(["bull.point_copies_quote"]);
    expect(withBull({ point: `As reported, ${quote}` })).toEqual(["bull.point_copies_quote"]);
    expect(withBull({ point: "Revenue grew." })).toEqual(["bull.point.too_short"]);
  });

  it("rejects hedged policy and risk-factor quotes, but not hedged guidance with a figure", () => {
    const text = [
      "Revenue by segment in a particular period may be significantly impacted by the timing of revenue recognition for complex transactions with multiple performance obligations.",
      "Our revenue is concentrated among a limited number of direct and indirect customers and this trend may continue.",
      "Gross margin could be between 47 percent and 48 percent in the December quarter.",
      "We account for warrants as a reduction in revenue. Refer to Note 12 for details.",
    ].join("\n");
    const docs = [PRESS_RELEASE, { ...MDNA, text }];
    const bearQuote = (quote: string) => {
      const result = validateModelCall({ ...validCall(), bear: { ...validCall().bear, quote } }, { ...CTX, docs });
      return result.ok ? [] : result.errors;
    };
    const policy = "may be significantly impacted by the timing of revenue recognition for complex transactions";
    expect(bearQuote(policy)).toEqual([
      "bear.quote_boilerplate",
    ]);
    expect(bearQuote("limited number of direct and indirect customers and this trend may continue")).toEqual([
      "bear.quote_boilerplate",
    ]);
    expect(bearQuote("as a reduction in revenue. Refer to Note 12 for details.")).toEqual(["bear.quote_boilerplate"]);
    expect(bearQuote("Gross margin could be between 47 percent and 48 percent in the December quarter.")).toEqual([]);
  });
});

describe("callHashInput", () => {
  const call = {
    id: "2026-11-03:AAPL",
    ticker: "AAPL",
    line: { value: 1.9, reactions: [{ session: "2026-07-31", movePct: -7.35, timing: "amc", mapping: "accepted", accession: "a" }] },
    status: "locked",
    grade: null,
    voidReason: null,
    hash: "abc",
  } as unknown as EarningsCall;

  it("sorts keys at every depth and drops the mutable fields", () => {
    expect(callHashInput(call)).toBe(
      '{"id":"2026-11-03:AAPL","line":{"reactions":[{"accession":"a","mapping":"accepted","movePct":-7.35,"session":"2026-07-31","timing":"amc"}],"value":1.9},"ticker":"AAPL"}',
    );
  });

  it("does not change when the call is graded", () => {
    const later = { ...call, status: "graded", voidReason: null, grade: { movePct: -1.9 } } as unknown as EarningsCall;
    expect(callHashInput(later)).toBe(callHashInput(call));
  });

  it("is independent of key insertion order", () => {
    const reordered = { ticker: "AAPL", line: { reactions: call.line.reactions, value: 1.9 }, id: "2026-11-03:AAPL" };
    expect(callHashInput(reordered as unknown as EarningsCall)).toBe(callHashInput(call));
  });
});
