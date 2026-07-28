/*
 * freshen-dates.js — keep demo dates permanently current.
 *
 * Each page declares the date it was authored against:
 *
 *     <meta name="fresh-base" content="2026-03-24">
 *     <script src="../assets/freshen-dates.js"></script>
 *
 * On load the page is shifted so that its anchor date renders as LAG_DAYS before
 * today, and every other calendar date moves by the same whole number of days.
 * A demo therefore always reads as though it were produced ~10 days ago, and the
 * spacing between its dates is preserved exactly: a milestone three weeks after
 * the report date stays three weeks after it.
 *
 *   anchor 2026-03-24, opened 2026-07-28  ->  target 2026-07-18, delta +116 days
 *     "March 24, 2026" -> "July 18, 2026"      (the as-of date)
 *     "Apr 8"          -> "Aug 2"              (still 15 days later)
 *
 * FISCAL FRAMING
 * Fiscal-year definitions and historical analytics must not drift, so they are
 * opted out and, where a label describes a period relative to the report date,
 * re-derived rather than shifted:
 *
 *   [data-fresh-skip]                 subtree is left completely alone. Use for
 *                                     FY definitions ("FY26 = Feb 1, 2025 - Jan
 *                                     31, 2026") and historical figures.
 *
 *   [data-fresh-quarter="FY27Q2"]     element text is replaced with that quarter
 *                                     rolled forward by however many fiscal
 *                                     quarters the shift actually crossed.
 *                                     Add data-fresh-show="months" to render
 *                                     "Q3 FY27 · Aug-Oct 2026".
 *
 *   [data-fresh-quarter-range="FY27Q2:FY27Q4"]
 *                                     same, for a span of quarters ->
 *                                     "Q3 FY27 - Q1 FY28".
 *
 *   [data-fresh-quarter-of="2027-07-01"]
 *                                     the quarter that ONE specific date lands
 *                                     in once shifted. Use this for a label
 *                                     printed next to a date, e.g.
 *                                     "July 1, 2027 (FY28Q2)".
 *
 * The last one exists because a uniform day shift does not move every date by
 * the same number of quarters: a date late in a quarter can cross two
 * boundaries while the report date crosses one. Labels tied to the report's own
 * framing use data-fresh-quarter; labels tied to a particular date must use
 * data-fresh-quarter-of or they drift out of agreement with the date beside them.
 *
 * Elements carrying any quarter attribute are skipped by the date pass, since
 * their text is generated rather than shifted.
 *
 * For dates that live in a JS data array (rendered into the DOM later), call
 * Fresh.shiftData(array) once after defining it, and mark its render container
 * [data-fresh-skip] so it is not shifted a second time by the DOM pass.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Fresh = api;
})(typeof window !== "undefined" ? window
   : (typeof globalThis !== "undefined" ? globalThis : null), function () {
  "use strict";

  // How far behind today a demo should always appear to have been produced.
  var LAG_DAYS = 10;

  // Fiscal calendar used by every demo in this deck: FY(N) runs Feb 1 (N-1)
  // through Jan 31 (N), so Q1 = Feb-Apr, Q2 = May-Jul, Q3 = Aug-Oct, Q4 = Nov-Jan.
  var FISCAL_START_MONTH = 1; // 0-indexed February

  var FULL = ["January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December"];
  var ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var MONTH_INDEX = {};
  FULL.forEach(function (m, i) { MONTH_INDEX[m.toLowerCase()] = i; });
  ABBR.forEach(function (m, i) { MONTH_INDEX[m.toLowerCase()] = i; });
  MONTH_INDEX.sept = 8; // common 4-letter abbreviation for September

  var FULL_LC = FULL.map(function (m) { return m.toLowerCase(); });

  // A month name followed by EITHER "day [ - day ] [ , year ]" OR a bare 4-digit year.
  // Requiring a day or a year avoids matching the bare words "May"/"March"/etc.
  // Groups: 1=month 2=dot 3=space  | branch A: 4=day1 5=range(incl dash) 6=day2 7=sep 8=year
  //                                | branch B: 9=year-only
  var MONTHS =
    "(January|February|March|April|May|June|July|August|September|October|November|December|Sept|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
  var DATE_SRC =
    "\\b" + MONTHS + "(\\.?)(\\s+)(?:" +
      "(\\d{1,2})(?!\\d)((?:\\s*[\\u2013\\u2014-]\\s*)(\\d{1,2}))?(,?\\s*)(\\d{4})?" + // day [range] [, year]
      "|(\\d{4})\\b" +                                                                // year only
    ")";
  // Case-insensitive: the decks contain all-caps dates ("CLOSES MAR 30",
  // "MAR 25 1:00 PM") that must shift along with everything else. Style is
  // restored per match by matchCase().
  var DATE_RE = new RegExp(DATE_SRC, "gi");
  var HAS_DATE = new RegExp(DATE_SRC, "i"); // non-global, safe for .test()

  var MS_PER_DAY = 86400000;

  // ---------------------------------------------------------------- calendar --

  // Whole days since the epoch. UTC throughout so a DST boundary can never make
  // a shift land a day early or late.
  function dayNum(year, monthIdx, day) {
    return Math.round(Date.UTC(year, monthIdx, day) / MS_PER_DAY);
  }

  function fromDayNum(n) {
    var d = new Date(n * MS_PER_DAY);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
  }

  function daysInMonth(year, monthIdx) {
    return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  }

  function parseISO(str) {
    var m = /(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(str || "");
    return m ? { year: +m[1], month: +m[2] - 1, day: m[3] ? +m[3] : 1 } : null;
  }

  // ------------------------------------------------------------------ fiscal --

  function fiscalYearOf(year, monthIdx) {
    return monthIdx >= FISCAL_START_MONTH ? year + 1 : year;
  }

  function fiscalQuarterOf(monthIdx) {
    return Math.floor(((monthIdx - FISCAL_START_MONTH + 12) % 12) / 3) + 1;
  }

  // A single monotonic number per fiscal quarter, so rolling is just addition.
  function absQuarter(year, monthIdx) {
    return fiscalYearOf(year, monthIdx) * 4 + (fiscalQuarterOf(monthIdx) - 1);
  }

  function quarterParts(absQ) {
    return { fy: Math.floor(absQ / 4), q: (absQ % 4) + 1 };
  }

  function quarterLabel(absQ) {
    var p = quarterParts(absQ);
    return "Q" + p.q + " FY" + String(p.fy % 100);
  }

  // Calendar months covered by a fiscal quarter, as {month, year} triples.
  function quarterMonths(absQ) {
    var p = quarterParts(absQ);
    var out = [];
    for (var i = 0; i < 3; i++) {
      var offset = FISCAL_START_MONTH + (p.q - 1) * 3 + i;
      out.push({ month: offset % 12, year: p.fy - 1 + Math.floor(offset / 12) });
    }
    return out;
  }

  // "Aug-Oct 2026" when the span sits in one calendar year, "Nov 2026-Jan 2027"
  // when it straddles one.
  function quarterMonthSpan(absQ) {
    var ms = quarterMonths(absQ);
    var first = ms[0], last = ms[2];
    if (first.year === last.year) {
      return ABBR[first.month] + "–" + ABBR[last.month] + " " + first.year;
    }
    return ABBR[first.month] + " " + first.year + "–" + ABBR[last.month] + " " + last.year;
  }

  // Accepts "FY27Q2", "2027Q2", "27Q2", "Q2 FY27" and "Q2FY2027".
  function parseQuarterRef(str) {
    var s = String(str || "").toUpperCase().replace(/\s+/g, "");
    var fy, q, m;
    if ((m = /^(?:FY)?(\d{2,4})Q([1-4])$/.exec(s))) { fy = +m[1]; q = +m[2]; }
    else if ((m = /^Q([1-4])(?:FY)?(\d{2,4})$/.exec(s))) { q = +m[1]; fy = +m[2]; }
    else return null;
    if (fy < 100) fy += 2000;
    return fy * 4 + (q - 1);
  }

  // ------------------------------------------------------------------ shifter --

  /**
   * Build the shifting functions for one page.
   * @param {string|object} base  anchor date ("YYYY-MM-DD" or {year,month,day})
   * @param {string|object} today the date to treat as "now"
   */
  function createShifter(base, today) {
    var b = typeof base === "string" ? parseISO(base) : base;
    var t = typeof today === "string" ? parseISO(today) : today;
    if (!b || !t) return inertShifter();

    var baseDay = dayNum(b.year, b.month, b.day);
    var targetDay = dayNum(t.year, t.month, t.day) - LAG_DAYS;
    var target = fromDayNum(targetDay);

    var deltaDays = targetDay - baseDay;
    // Month-only references ("Feb 2025") have no day to move, so they travel by
    // the whole-month distance between the anchor month and the target month.
    var deltaMonths = (target.year - b.year) * 12 + (target.month - b.month);
    var quarterDelta = absQuarter(target.year, target.month) - absQuarter(b.year, b.month);
    var yearDelta = fiscalYearOf(target.year, target.month) - fiscalYearOf(b.year, b.month);

    // A bare "Apr 15" carries no year. Pick the occurrence nearest the anchor —
    // on a page anchored in June, "May 31" is six weeks past, not eleven months out.
    function inferYear(monthIdx, day) {
      var best = null, bestDist = Infinity;
      for (var y = b.year - 1; y <= b.year + 1; y++) {
        var dist = Math.abs(dayNum(y, monthIdx, day) - baseDay);
        if (dist < bestDist) { bestDist = dist; best = y; }
      }
      return best;
    }

    function matchCase(out, token) {
      if (token === token.toUpperCase()) return out.toUpperCase();
      if (token === token.toLowerCase()) return out.toLowerCase();
      return out; // FULL/ABBR are already Title Case
    }

    function renderMonth(monthIdx, token) {
      var lc = token.toLowerCase();
      // "May" is both a full name and an abbreviation, and "Sept" is an abbreviated
      // form not in the full-name list — treat both as abbreviated style so the
      // shifted month matches the abbreviated dates around it.
      if (lc !== "may" && FULL_LC.indexOf(lc) !== -1) return matchCase(FULL[monthIdx], token);
      return matchCase(ABBR[monthIdx], token);
    }

    function renderDay(newDay, origDayStr) {
      var pad = origDayStr.length === 2 && origDayStr.charAt(0) === "0";
      return pad && newDay < 10 ? "0" + newDay : String(newDay);
    }

    function shiftString(str) {
      if (!str || (!deltaDays && !deltaMonths)) return str;
      return str.replace(DATE_RE, function (whole, mon, dot, space, day1, range, day2, sep, year, yearOnly) {
        var monthIdx = MONTH_INDEX[mon.toLowerCase()];
        if (monthIdx === undefined) return whole;

        // Month + bare year, e.g. "Feb 2025" — no day, so move by whole months.
        if (yearOnly) {
          var absM = (+yearOnly) * 12 + monthIdx + deltaMonths;
          return renderMonth(((absM % 12) + 12) % 12, mon) + dot + space + Math.floor(absM / 12);
        }

        var hasYear = !!year;
        var origYear = hasYear ? +year : inferYear(monthIdx, Math.min(+day1, 28));

        // Clamp to the source month so "Feb 30" cannot silently become March.
        var srcDay1 = Math.min(+day1, daysInMonth(origYear, monthIdx));
        var d1 = fromDayNum(dayNum(origYear, monthIdx, srcDay1) + deltaDays);

        var out = renderMonth(d1.month, mon) + dot + space + renderDay(d1.day, day1);

        if (range) {
          var dash = range.slice(0, range.length - day2.length);
          var srcDay2 = Math.min(+day2, daysInMonth(origYear, monthIdx));
          var d2 = fromDayNum(dayNum(origYear, monthIdx, srcDay2) + deltaDays);
          // "Mar 27-30" stays "Jul 21-24", but if the shift pushes the two ends
          // into different months the second one has to name its month again.
          out += dash + (d2.month === d1.month
            ? renderDay(d2.day, day2)
            : renderMonth(d2.month, mon) + dot + space + renderDay(d2.day, day2));
          if (hasYear && d2.year !== d1.year) return out + sep + d2.year;
        }

        return out + sep + (hasYear ? d1.year : "");
      });
    }

    // Recursively shift every string in a data structure (mutates in place).
    function shiftData(obj) {
      if (obj == null || (!deltaDays && !deltaMonths)) return obj;
      if (typeof obj === "string") return shiftString(obj);
      if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length; i++) obj[i] = shiftData(obj[i]);
        return obj;
      }
      if (typeof obj === "object") {
        for (var k in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) obj[k] = shiftData(obj[k]);
        }
      }
      return obj;
    }

    function rollQuarter(ref) {
      var absQ = parseQuarterRef(ref);
      return absQ === null ? null : absQ + quarterDelta;
    }

    function quarterText(ref, withMonths) {
      var absQ = rollQuarter(ref);
      if (absQ === null) return null;
      return withMonths ? quarterLabel(absQ) + " · " + quarterMonthSpan(absQ)
                        : quarterLabel(absQ);
    }

    // The fiscal quarter a specific date lands in AFTER shifting.
    //
    // A uniform day shift does not move every date by the same number of
    // quarters — a date late in a quarter can cross two boundaries while the
    // report date crosses one. So a label bolted to a particular date
    // ("July 1, 2027 (FY28Q2)") has to be re-derived from that date rather than
    // rolled by the page-wide quarter delta, or it drifts out of agreement with
    // the date printed beside it.
    function quarterOfDate(iso) {
      var d = typeof iso === "string" ? parseISO(iso) : iso;
      if (!d) return null;
      var moved = fromDayNum(dayNum(d.year, d.month, d.day) + deltaDays);
      return absQuarter(moved.year, moved.month);
    }

    function quarterOfDateText(iso, withMonths) {
      var absQ = quarterOfDate(iso);
      if (absQ === null) return null;
      return withMonths ? quarterLabel(absQ) + " · " + quarterMonthSpan(absQ)
                        : quarterLabel(absQ);
    }

    function quarterRangeText(ref) {
      var parts = String(ref || "").split(":");
      var from = rollQuarter(parts[0]);
      var to = rollQuarter(parts[1]);
      if (from === null || to === null) return null;
      var a = quarterParts(from), z = quarterParts(to);
      // "Q3-Q4 FY27" reads better than "Q3 FY27 - Q4 FY27" when the year is shared.
      if (a.fy === z.fy) return "Q" + a.q + "–Q" + z.q + " FY" + String(a.fy % 100);
      return quarterLabel(from) + "–" + quarterLabel(to);
    }

    return {
      shiftString: shiftString,
      shiftData: shiftData,
      rollQuarter: rollQuarter,
      quarterText: quarterText,
      quarterOfDate: quarterOfDate,
      quarterOfDateText: quarterOfDateText,
      quarterRangeText: quarterRangeText,
      deltaDays: deltaDays,
      deltaMonths: deltaMonths,
      quarterDelta: quarterDelta,
      yearDelta: yearDelta,
      base: b,
      target: target
    };
  }

  // Used when a page has no anchor: every operation is a no-op.
  function inertShifter() {
    var id = function (x) { return x; };
    return {
      shiftString: id, shiftData: id,
      rollQuarter: function () { return null; },
      quarterText: function () { return null; },
      quarterOfDate: function () { return null; },
      quarterOfDateText: function () { return null; },
      quarterRangeText: function () { return null; },
      deltaDays: 0, deltaMonths: 0, quarterDelta: 0, yearDelta: 0,
      base: null, target: null
    };
  }

  // --------------------------------------------------------------------- DOM --

  var active = inertShifter();

  function shouldSkip(node) {
    var el = node.parentNode;
    while (el && el.nodeType === 1) {
      var tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return true;
      if (el.hasAttribute("data-fresh-skip")) return true;
      // Quarter labels are generated from the fiscal calendar, not shifted.
      if (el.hasAttribute("data-fresh-quarter")) return true;
      if (el.hasAttribute("data-fresh-quarter-of")) return true;
      if (el.hasAttribute("data-fresh-quarter-range")) return true;
      el = el.parentNode;
    }
    return false;
  }

  function applyQuarterLabels() {
    var single = document.querySelectorAll("[data-fresh-quarter]");
    for (var i = 0; i < single.length; i++) {
      var el = single[i];
      var text = active.quarterText(el.getAttribute("data-fresh-quarter"),
                                    el.getAttribute("data-fresh-show") === "months");
      if (text !== null) el.textContent = text;
    }
    var ofDate = document.querySelectorAll("[data-fresh-quarter-of]");
    for (var k = 0; k < ofDate.length; k++) {
      var oEl = ofDate[k];
      var oText = active.quarterOfDateText(oEl.getAttribute("data-fresh-quarter-of"),
                                           oEl.getAttribute("data-fresh-show") === "months");
      if (oText !== null) oEl.textContent = oText;
    }
    var ranges = document.querySelectorAll("[data-fresh-quarter-range]");
    for (var j = 0; j < ranges.length; j++) {
      var rEl = ranges[j];
      var rText = active.quarterRangeText(rEl.getAttribute("data-fresh-quarter-range"));
      if (rText !== null) rEl.textContent = rText;
    }
  }

  function shiftDom() {
    if (!active.deltaDays && !active.deltaMonths) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !HAS_DATE.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) { node.nodeValue = active.shiftString(node.nodeValue); });
  }

  var didRun = false;
  function run() {
    if (didRun || typeof document === "undefined" || !document.body) return;
    didRun = true;
    applyQuarterLabels();
    shiftDom();
  }

  var api = {
    createShifter: createShifter,
    run: run,
    LAG_DAYS: LAG_DAYS,
    // Page-level conveniences, bound to this page's anchor.
    shiftString: function (s) { return active.shiftString(s); },
    shiftData: function (o) { return active.shiftData(o); },
    quarterText: function (r, m) { return active.quarterText(r, m); },
    quarterOfDateText: function (d, m) { return active.quarterOfDateText(d, m); },
    quarterRangeText: function (r) { return active.quarterRangeText(r); }
  };

  if (typeof document !== "undefined") {
    var meta = document.querySelector('meta[name="fresh-base"]');
    if (meta) {
      var now = new Date();
      active = createShifter(meta.getAttribute("content"),
                             { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() });
    }
    Object.defineProperty(api, "deltaDays", { get: function () { return active.deltaDays; } });
    Object.defineProperty(api, "deltaMonths", { get: function () { return active.deltaMonths; } });
    Object.defineProperty(api, "quarterDelta", { get: function () { return active.quarterDelta; } });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run);
    } else {
      run();
    }
  }

  return api;
});
