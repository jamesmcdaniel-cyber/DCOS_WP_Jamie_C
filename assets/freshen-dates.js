/*
 * freshen-dates.js — keep demo dates looking current.
 *
 * Each page declares an anchor month it was authored against:
 *
 *     <meta name="fresh-base" content="2026-03-01">
 *     <script src="../assets/freshen-dates.js"></script>
 *
 * On load every calendar date is shifted forward by the whole-month delta between
 * that anchor and today, so a page written "as of March 2026" reads as the current
 * month while every internal date keeps its original spacing. Open it in July and
 * "March 24" becomes "July 24"; the relationships between dates stay intact.
 *
 * What is left untouched:
 *   - fiscal-year framing (FY26, Q2–Q4 FY27) and fiscal boundary lines such as
 *     "FY26 = Feb 1, 2025 – Jan 31, 2026" — shifting these by a few months would
 *     corrupt their meaning, so wrap them in an element with [data-fresh-skip].
 *   - anything inside <script>/<style> or any [data-fresh-skip] subtree.
 *
 * For dates that live in a JS data array (rendered into the DOM later), call
 * Fresh.shiftData(array) once after defining it, and mark its render container
 * [data-fresh-skip] so it is not shifted a second time by the DOM pass.
 */
(function () {
  "use strict";

  var FULL = ["January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December"];
  var ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var MONTH_INDEX = {};
  FULL.forEach(function (m, i) { MONTH_INDEX[m.toLowerCase()] = i; });
  ABBR.forEach(function (m, i) { MONTH_INDEX[m.toLowerCase()] = i; });
  MONTH_INDEX.sept = 8; // common 4-letter abbreviation for September

  var FULL_LC = FULL.map(function (m) { return m.toLowerCase(); });

  // A month name followed by EITHER "day [ – day ] [ , year ]" OR a bare 4-digit year.
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
  var DATE_RE = new RegExp(DATE_SRC, "g");
  var HAS_DATE = new RegExp(DATE_SRC); // non-global, safe for .test()

  function readBase() {
    var meta = document.querySelector('meta[name="fresh-base"]');
    if (!meta) return null;
    var m = /(\d{4})-(\d{1,2})/.exec(meta.getAttribute("content") || "");
    return m ? { year: +m[1], month: +m[2] - 1 } : null;
  }

  var base = readBase();
  var now = new Date();
  var DELTA = base ? (now.getFullYear() - base.year) * 12 + (now.getMonth() - base.month) : 0;

  function daysInMonth(year, monthIdx) {
    return new Date(year, monthIdx + 1, 0).getDate();
  }

  function matchCase(out, token) {
    if (token === token.toUpperCase()) return out.toUpperCase();
    if (token === token.toLowerCase()) return out.toLowerCase();
    return out; // FULL/ABBR are already Title Case
  }

  function renderMonth(monthIdx, token) {
    var lc = token.toLowerCase();
    // "May" is both a full name and an abbreviation, and "Sept" is an abbreviated
    // form not in the full-name list — treat both as abbreviated style so the shifted
    // month matches the abbreviated dates around it.
    if (lc !== "may" && FULL_LC.indexOf(lc) !== -1) return matchCase(FULL[monthIdx], token);
    return matchCase(ABBR[monthIdx], token);
  }

  function renderDay(newDay, origDayStr) {
    var pad = origDayStr.length === 2 && origDayStr.charAt(0) === "0";
    return pad && newDay < 10 ? "0" + newDay : String(newDay);
  }

  function shiftString(str) {
    if (!DELTA || !str) return str;
    return str.replace(DATE_RE, function (whole, mon, dot, space, day1, range, day2, sep, year, yearOnly) {
      var monthIdx = MONTH_INDEX[mon.toLowerCase()];
      if (monthIdx === undefined) return whole;

      // Month + bare year (no day), e.g. "Dec 2026".
      if (yearOnly) {
        var absY = (+yearOnly) * 12 + monthIdx + DELTA;
        return renderMonth(((absY % 12) + 12) % 12, mon) + dot + space + Math.floor(absY / 12);
      }

      var hasYear = !!year;
      var origYear = hasYear ? +year : (base ? base.year : now.getFullYear());
      var abs = origYear * 12 + monthIdx + DELTA;
      var newYear = Math.floor(abs / 12);
      var newMonthIdx = ((abs % 12) + 12) % 12;
      var dim = daysInMonth(newYear, newMonthIdx);

      var out = renderMonth(newMonthIdx, mon) + dot + space +
                renderDay(Math.min(+day1, dim), day1);

      if (range) {
        var dash = range.slice(0, range.length - day2.length);
        out += dash + renderDay(Math.min(+day2, dim), day2);
      }

      return out + sep + (hasYear ? newYear : "");
    });
  }

  function shouldSkip(node) {
    var el = node.parentNode;
    while (el && el.nodeType === 1) {
      var tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return true;
      if (el.hasAttribute("data-fresh-skip")) return true;
      el = el.parentNode;
    }
    return false;
  }

  var didRun = false;
  function run() {
    if (didRun || !DELTA || !document.body) return;
    didRun = true;

    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !HAS_DATE.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) { node.nodeValue = shiftString(node.nodeValue); });
  }

  // Recursively shift every string in a data structure (mutates in place).
  function shiftData(obj) {
    if (!DELTA || obj == null) return obj;
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

  window.Fresh = {
    run: run,
    shiftString: shiftString,
    shiftData: shiftData,
    deltaMonths: DELTA
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
