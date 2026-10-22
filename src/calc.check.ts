// Run: npm run check
import assert from "node:assert/strict";
import * as c from "./calc.ts";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

// Splits add up exactly, leftover lands on the last pour
assert.deepEqual(c.splitWater(300, [4, 6]), [120, 180]);
assert.deepEqual(c.splitWater(300, [1, 2, 3, 3]), [33, 67, 100, 100]);
assert.deepEqual(c.splitWater(300, [2, 2, 2, 2, 2]), [60, 60, 60, 60, 60]);
assert.deepEqual(c.splitWater(240, [1, 2, 3, 3]), [27, 53, 80, 80]);
assert.equal(sum(c.splitWater(251, [1, 1.5, 2])), 251);

// First part of the pattern is the bloom; interval sets start times
const plan = c.planPours({ total: 300, pattern: [1, 2, 3, 3], interval: 45 });
assert.deepEqual(plan.map((p) => p.water), [33, 67, 100, 100]);
assert.deepEqual(plan.map((p) => p.start), [0, 45, 90, 135]);

// Tiny totals never yield negative pours
assert.ok(c.splitWater(4, [1, 1, 1, 1, 1, 1, 1]).every((g) => g >= 0));

// Pattern validation
assert.deepEqual(c.parsePattern("1:1.5:2"), [1, 1.5, 2]);
assert.equal(c.parsePattern("1::2"), null);
assert.equal(c.parsePattern("0:2"), null);
assert.equal(c.parsePattern("-1:2"), null);
assert.equal(c.parsePattern(""), null);

// Per pour <-> target weight round trip
const per = [50, 100, 100];
assert.deepEqual(c.toTargets(per), [50, 150, 250]);
assert.deepEqual(c.fromTargets(c.toTargets(per)), per);

// Ratio solver
assert.equal(c.solveRatio({ dose: 15, liquid: null, ratio: 16 }, "liquid"), 240);
assert.equal(c.solveRatio({ dose: null, liquid: 250, ratio: 15 }, "dose"), 16.7);
assert.equal(c.solveRatio({ dose: 18, liquid: 36, ratio: null }, "ratio"), 2);

// Rotation dial: total = (r * npr + n) * cpn + c
const zp = { dial_type: "rotation" as const, clicks_per_number: 2, numbers_per_rotation: 10, um_per_step: 12.5 };
assert.equal(c.dialToClicks("2.4.1", zp), 49);
assert.equal(c.dialToClicks("2.4", zp), 48);
assert.equal(c.dialToClicks("2.12.0", zp), null); // number out of range
assert.equal(c.dialToClicks("30", zp), 30);
assert.equal(c.dialToClicks("24.5", { dial_type: "clicks" }), 24.5);
assert.equal(c.estimateMicrons(49, zp), 613);
assert.equal(c.estimateMicrons(10, { dial_type: "stepless", um_per_step: 5 }), null);

// Ice split and final ratio
assert.deepEqual(c.iceSplit(20, 15, 40), { hot: 180, ice: 120 });
assert.equal(c.finalRatio(20, 180, 120, false), 15);
assert.equal(c.finalRatio(20, 180, null, true), null);

// Times
assert.equal(c.parseTime("1:45"), 105);
assert.equal(c.parseTime("45"), 45);
assert.equal(c.parseTime("230"), 150);
assert.equal(c.parseTime("330"), 210);
assert.equal(c.parseTime("1230"), 750);
assert.equal(c.parseTime("1:x"), null);
assert.equal(c.fmtTime(105), "1:45");

// Sheets serial dates survive a round trip in local wall-clock time
const d = new Date(2026, 9, 21, 8, 30, 0);
assert.equal(c.fromSerial(c.toSerial(d)).getTime(), d.getTime());
assert.equal(c.daysOffRoast(c.toSerial(new Date(2026, 9, 7)), c.toSerial(d)), 14);

// Chill stages land on the timeline
const ctx = { total: 180, phaseStarts: [0, 45, 90], pre: 0, yieldG: null };
assert.deepEqual(c.stageToTime("phase:2", ctx), { t: 45, approx: false });
assert.deepEqual(c.stageToTime("t:30", ctx), { t: 30, approx: false });
assert.deepEqual(c.stageToTime("t:150", ctx), { t: 150, approx: false });
assert.equal(c.stageToTime("phase:9", ctx), null);
assert.deepEqual(c.stageToTime("t:1:30", ctx), { t: 90, approx: false });
assert.deepEqual(c.stageToTime("y:18", { total: 30, pre: 6, yieldG: 36 }), { t: 18, approx: true });

// AI reply validation: unknown keys ignored, values clamped, bad colour falls back to strongest axis
const ax = c.DEFAULT_AXES;
const layers = c.cleanLayers({
  notes: [
    { note: "Blueberry", color: "#5b4b9e", acidity: 12.4, sweetness: "6", body: -3, extra: 9 },
    { note: "Cocoa", color: "red", bitterness: 7.3, body: 6 },
    { note: "", acidity: 5 },
  ],
}, ax);
assert.equal(layers.length, 2);
assert.deepEqual(layers[0], {
  note: "Blueberry", color: "#5b4b9e", v: { sweetness: 6, aroma: 0, bitterness: 0, body: 0, acidity: 10, finish: 0 },
});
assert.equal(layers[1].color, c.DEFAULT_AXES.find((a) => a.key === "bitterness")!.color);
assert.equal(layers[1].v.bitterness, 7.5);
assert.deepEqual(c.profile(layers, ax), { sweetness: 6, aroma: 0, bitterness: 7.5, body: 6, acidity: 10, finish: 0 });
assert.throws(() => c.cleanLayers("text", ax));
assert.deepEqual(c.splitNotes("blueberry, jasmine; cane sugar\n"), ["blueberry", "jasmine", "cane sugar"]);

// Custom axes: dedupe, colour fallback, too few falls back to the template
const custom = c.cleanAxes([{ label: "Juicy", color: "#ff0000" }, { label: "Juicy" }, { label: "Tea like", color: "x" }, { label: "Clean" }]);
assert.deepEqual(custom.map((a) => a.key), ["juicy", "tea_like", "clean"]);
assert.equal(custom[1].color, "#7A766E");
assert.equal(c.cleanAxes([{ label: "One" }]), c.DEFAULT_AXES);
const stored = JSON.stringify({ axes: custom, layers: [{ note: "Hibiscus", color: "#c2185b", v: { juicy: 8, clean: 3 } }] });
const fl = c.parseFlavour(stored, ax);
assert.equal(fl.axes.length, 3);
assert.deepEqual(fl.layers[0].v, { juicy: 8, tea_like: 0, clean: 3 });
assert.deepEqual(c.parseFlavour("not json", ax), { axes: ax, layers: [] });

// Aeropress press phases
assert.deepEqual(c.pressTimes([{ start: 90, duration: 20 }, { start: 120, duration: 15 }]), { steep: 90, total: 135 });

// Imported formulas stay text; ordinary notes are untouched
assert.equal(c.defuse('=HYPERLINK("https://x","y")'), `'=HYPERLINK("https://x","y")`);
assert.equal(c.defuse("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
assert.equal(c.defuse("@SUM(A1)"), "'@SUM(A1)");
assert.equal(c.defuse("-2 clicks finer"), "-2 clicks finer");
assert.equal(c.defuse("Bright, jammy (washed)"), "Bright, jammy (washed)");
assert.equal(c.defuse("-2+3+cmd|' /C calc'!A0"), "'-2+3+cmd|' /C calc'!A0");
assert.equal(c.defuse("+HYPERLINK(\"x\")"), "'+HYPERLINK(\"x\")");
for (const note of ["-1 step (finer)", "+2 clicks (coarser)", "- Bright (lemon)", "- Juicy!", "@roaster (IG)"]) assert.equal(c.defuse(note), note);
assert.equal(c.defuse(c.defuse("=X(1)")), "'=X(1)"); // idempotent, so stored values match on re-import

console.log("calc checks passed");
