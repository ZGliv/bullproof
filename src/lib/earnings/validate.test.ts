import { describe, expect, it } from "vitest";
import type { EarningsCall, EvidenceDoc } from "./types";
import { callHashInput, containsVerbatim, normalizeText, validateModelCall } from "./validate";

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
const CTX = { ticker: "AAPL", docs: DOCS, allowedNumbers: [1.9, 344.63, -7.35, 3.24] };

function validCall() {
  return {
    ticker: "AAPL",
    direction: "up",
    move: "under",
    confidence: 3,
    bull: {
      point: "Revenue reached $114.5 billion, up 12 percent.",
      source: "press_release",
      quote: "The Company posted quarterly revenue of $114.5 billion, up 12 percent year over year.",
    },
    bear: {
      point: "Margins carried a one-off tariff refund benefit.",
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
      const call = { ...validCall(), thesis: "Revenue grew 12.4% on record iPhone demand." };
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
        bull: { ...validCall().bull, point: "Services hit $30bn." },
        wrong_if: "Gross margin falls under 46 percent or 46% again.",
      };
      expect(errorsFor(call)).toEqual(["bull.point.number_not_in_evidence:30", "wrong_if.number_not_in_evidence:46"]);
    });

    it("compares values, so $479 billion and 1,234 forms both work", () => {
      const docs = [{ ...PRESS_RELEASE, text: `${PRESS_RELEASE.text}\nBacklog was 1,234 units.` }, MDNA];
      const call = { ...validCall(), thesis: "Full-year revenue of $479bn and a 1234-unit backlog." };
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
        thesis: "x".repeat(301),
        wrong_if: "x".repeat(241),
      };
      expect(errorsFor(call)).toEqual(["bull.point.too_long", "thesis.too_long", "wrong_if.too_long"]);
      const atLimit = { ...validCall(), bull: { ...validCall().bull, point: "x".repeat(240) }, thesis: "x".repeat(300) };
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
