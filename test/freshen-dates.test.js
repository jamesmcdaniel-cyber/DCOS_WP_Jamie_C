/*
 * Tests for freshen-dates.js — run with:  node test/freshen-dates.test.js
 *
 * The shifting logic is pure and DOM-free, so it can be exercised directly by
 * pinning both the page anchor and "today".
 */
var Fresh = require("../assets/freshen-dates.js");

var passed = 0, failed = 0;

function is(actual, expected, label) {
  if (actual === expected) { passed++; return; }
  failed++;
  console.log("  FAIL " + label + "\n         expected: " + JSON.stringify(expected) +
                            "\n         actual:   " + JSON.stringify(actual));
}

function group(name, fn) { console.log("\n" + name); fn(); }

// Every demo is opened on this date in the tests below.
var TODAY = "2026-07-28";
var TARGET = "2026-07-18"; // TODAY minus LAG_DAYS

group("anchor always lands LAG_DAYS behind today", function () {
  is(Fresh.LAG_DAYS, 10, "lag is 10 days");

  [["2026-03-24", "March 24, 2026", "July 18, 2026"],
   ["2026-03-03", "March 3, 2026",  "July 18, 2026"],
   ["2026-03-01", "March 1, 2026",  "July 18, 2026"],
   ["2026-06-19", "June 19, 2026",  "July 18, 2026"],
   ["2026-02-21", "February 21, 2026", "July 18, 2026"],
   ["2026-03-30", "March 30, 2026", "July 18, 2026"]].forEach(function (c) {
    var s = Fresh.createShifter(c[0], TODAY);
    is(s.shiftString(c[1]), c[2], "anchor " + c[0] + " -> " + TARGET);
  });
});

group("every page reads as exactly 10 days old, whatever the anchor", function () {
  // The old month-granularity engine produced anywhere from -25 to +2 days.
  ["2026-02-21", "2026-03-01", "2026-03-03", "2026-03-24", "2026-03-30", "2026-06-19"]
    .forEach(function (base) {
      var s = Fresh.createShifter(base, TODAY);
      var t = s.target;
      is(t.year + "-" + String(t.month + 1).padStart(2, "0") + "-" + String(t.day).padStart(2, "0"),
         TARGET, "target for " + base);
    });
});

group("spacing between dates is preserved", function () {
  var s = Fresh.createShifter("2026-03-24", TODAY);
  is(s.deltaDays, 116, "delta days");
  is(s.shiftString("Mar 24"), "Jul 18", "anchor, abbreviated");
  is(s.shiftString("Mar 25"), "Jul 19", "+1 day");
  is(s.shiftString("Apr 2"),  "Jul 27", "+9 days");
  is(s.shiftString("Apr 8"),  "Aug 2",  "+15 days, crosses month");
});

group("relative phrases stay true", function () {
  // "10 months out" and "280 days ago" only hold if both endpoints move together.
  var s = Fresh.createShifter("2026-03-03", TODAY);
  is(s.deltaDays, 137, "delta days");
  is(s.shiftString("July 1, 2027"), "November 15, 2027", "renewal shifts with the report date");
  // Gap from anchor to renewal is unchanged: both moved +137 days.
  var gapBefore = (Date.UTC(2027, 6, 1)  - Date.UTC(2026, 2, 3))  / 86400000;
  var gapAfter  = (Date.UTC(2027, 10, 15) - Date.UTC(2026, 6, 18)) / 86400000;
  is(gapAfter, gapBefore, "gap preserved exactly");
});

group("day ranges", function () {
  var s = Fresh.createShifter("2026-03-01", TODAY);
  is(s.shiftString("Mar 3–5"), "Jul 20–22", "range stays within one month");
  var c = Fresh.createShifter("2026-03-24", TODAY);
  is(c.shiftString("Mar 30–31"), "Jul 24–25", "range near month end");
  // A range whose ends land in different months must re-name the second month.
  var x = Fresh.createShifter("2026-03-24", "2026-07-24");
  is(x.shiftString("Mar 24–28"), "Jul 14–18", "range, both ends same month");
});

group("month-only references move by whole months", function () {
  var s = Fresh.createShifter("2026-03-01", TODAY);
  is(s.deltaMonths, 4, "delta months");
  is(s.shiftString("Feb 2025"), "Jun 2025", "month + year");
  is(s.shiftString("Dec 2026"), "Apr 2027", "month + year across year end");
});

group("month-end clamping", function () {
  var zero = Fresh.createShifter("2027-01-31", "2027-02-10");
  is(zero.deltaDays, 0, "zero delta when anchor already sits at the target");
  is(zero.shiftString("March 4, 2027"), "March 4, 2027", "nothing moves on a zero shift");

  // An impossible source date must be clamped to the real end of its month
  // rather than silently rolling forward into the next one.
  var s = Fresh.createShifter("2027-01-31", "2027-02-20");
  is(s.deltaDays, 10, "delta days");
  is(s.shiftString("Feb 30, 2027"), "Mar 10, 2027", "Feb 30 clamps to Feb 28, then shifts");
  is(s.shiftString("Feb 28, 2027"), "Mar 10, 2027", "real month end shifts the same way");
});

group("bare dates resolve to the nearest occurrence", function () {
  // Anchored in June, "May 31" is three weeks past — not eleven months ahead.
  var s = Fresh.createShifter("2026-06-19", TODAY);
  is(s.deltaDays, 29, "delta days");
  is(s.shiftString("May 31"), "Jun 29", "date before the anchor stays before it");
  is(s.shiftString("Jun 14"), "Jul 13", "recent past");
  is(s.shiftString("Jul 11"), "Aug 9",  "near future");
  is(s.shiftString("Jun 19"), "Jul 18", "the anchor itself");
});

group("fiscal calendar: FY(N) = Feb 1 (N-1) through Jan 31 (N)", function () {
  var s = Fresh.createShifter("2026-03-30", TODAY);
  // Mar 30 2026 is Q1 FY27; Jul 18 2026 is Q2 FY27 — one quarter crossed.
  is(s.quarterDelta, 1, "one fiscal quarter crossed");
  is(s.yearDelta, 0, "no fiscal year crossed");

  is(s.quarterText("FY27Q2"), "Q3 FY27", "Q2 rolls to Q3");
  is(s.quarterText("FY27Q3"), "Q4 FY27", "Q3 rolls to Q4");
  is(s.quarterText("FY27Q4"), "Q1 FY28", "Q4 rolls into the next fiscal year");
});

group("quarter labels carry their month span", function () {
  var s = Fresh.createShifter("2026-03-30", TODAY);
  is(s.quarterText("FY27Q2", true), "Q3 FY27 · Aug–Oct 2026", "months re-derived, not shifted");
  is(s.quarterText("FY27Q3", true), "Q4 FY27 · Nov 2026–Jan 2027", "span straddling a year");
  is(s.quarterText("FY27Q4", true), "Q1 FY28 · Feb–Apr 2027", "first quarter of next FY");
});

group("quarter ranges", function () {
  var s = Fresh.createShifter("2026-03-30", TODAY);
  is(s.quarterRangeText("FY27Q2:FY27Q4"), "Q3 FY27–Q1 FY28", "range crossing a fiscal year");
  var same = Fresh.createShifter("2026-03-30", "2026-04-09"); // zero delta
  is(same.quarterDelta, 0, "no roll when nothing is crossed");
  is(same.quarterRangeText("FY27Q2:FY27Q4"), "Q2–Q4 FY27", "compact form within one FY");
});

group("quarter refs accept several spellings", function () {
  var s = Fresh.createShifter("2026-03-30", TODAY);
  is(s.quarterText("FY27Q2"),   "Q3 FY27", "FY27Q2");
  is(s.quarterText("Q2 FY27"),  "Q3 FY27", "Q2 FY27");
  is(s.quarterText("2027Q2"),   "Q3 FY27", "2027Q2");
  is(s.quarterText("q2fy2027"), "Q3 FY27", "lowercase, no spaces");
  is(s.quarterText("nonsense"), null,      "unparseable ref returns null");
});

group("a date's own quarter label is derived from that date", function () {
  // "July 1, 2027 (FY28Q2)" must still name the quarter the date lands in AFTER
  // shifting. Rolling by the page-wide quarter delta is wrong here: the report
  // date crosses one quarter boundary while this date crosses two.
  var s = Fresh.createShifter("2026-03-03", TODAY);
  is(s.shiftString("July 1, 2027"), "November 15, 2027", "renewal date shifts");
  is(s.quarterDelta, 1, "report date crosses one quarter");
  is(s.quarterText("FY28Q2"), "Q3 FY28", "page-wide roll gives Q3 — wrong for this date");
  is(s.quarterOfDateText("2027-07-01"), "Q4 FY28", "derived from the date itself — correct");

  // Nov 15 2027 really is Q4 of FY28 (Feb 1 2027 - Jan 31 2028: Q4 = Nov-Jan).
  var check = Fresh.createShifter("2027-11-15", "2027-11-25");
  is(check.deltaDays, 0, "zero-delta shifter reads the date as-is");
  is(check.quarterOfDateText("2027-11-15"), "Q4 FY28", "sanity: Nov 2027 is FY28 Q4");
  is(check.quarterOfDateText("2027-11-15", true), "Q4 FY28 · Nov 2027–Jan 2028", "with months");
});

group("case and abbreviation style are preserved", function () {
  var s = Fresh.createShifter("2026-03-24", TODAY);
  is(s.shiftString("March 24"), "July 18", "full month name stays full");
  is(s.shiftString("Mar 24"),   "Jul 18",  "abbreviation stays abbreviated");
  is(s.shiftString("MAR 24"),   "JUL 18",  "uppercase preserved");
  is(s.shiftString("Sept 24, 2026"), "Jan 18, 2027", "Sept parsed as September");
  // These appear verbatim in the decks and were never shifted by the old engine.
  is(s.shiftString("⚡ MAR 25 1:00 PM"), "⚡ JUL 19 1:00 PM", "all-caps meeting slot");
  is(s.shiftString("⚡ CLOSES MAR 30"),  "⚡ CLOSES JUL 24",  "all-caps close date");
});

group("non-dates are left alone", function () {
  var s = Fresh.createShifter("2026-03-24", TODAY);
  is(s.shiftString("May the plan succeed"), "May the plan succeed", "bare month word");
  is(s.shiftString("$5.09M active TAM"), "$5.09M active TAM", "figures untouched");
  is(s.shiftString("FY26 win rate 63.3%"), "FY26 win rate 63.3%", "FY label untouched by date pass");
});

group("shiftData walks nested structures", function () {
  var s = Fresh.createShifter("2026-03-30", TODAY);
  var deals = [{ name: "Acme", close: "Jun 24, 2026", notes: ["met Mar 30, 2026"] }];
  s.shiftData(deals);
  is(deals[0].close, "Oct 12, 2026", "nested string shifted");
  is(deals[0].notes[0], "met Jul 18, 2026", "array member shifted");
  is(deals[0].name, "Acme", "non-date untouched");
});

group("a page with no anchor is a no-op", function () {
  var s = Fresh.createShifter(null, TODAY);
  is(s.shiftString("March 24, 2026"), "March 24, 2026", "no anchor, no shift");
  is(s.deltaDays, 0, "zero delta");
});

group("the shift keeps working as time passes", function () {
  // Same anchor, opened a year later: still exactly 10 days old.
  var s = Fresh.createShifter("2026-03-24", "2027-11-05");
  is(s.shiftString("March 24, 2026"), "October 26, 2027", "anchor -> 2027-10-26");
  is(s.quarterDelta, 6, "six fiscal quarters crossed");
  is(s.yearDelta, 1, "one fiscal year crossed");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
