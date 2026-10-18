// Fixture for `check_pack.py --extra exercises/_runner/fixtures/bad-cards.js`.
// A course file in the shape of courses/<id>/exercises.js, loaded after the
// real ones. Six cards each break ONE register rule the checker must name;
// the last is legal and must pass. Cards from --extra are exempt from the
// folder / README / INDEX checks (they have none) and nothing else.
COURSES.exercises("zz-test", [
  { id: "ZZ-1", title: "unknown scene", folder: "ZZ-1-x", scene: "nope", rig: null },
  { id: "ZZ-2", title: "unknown rig key", folder: "ZZ-2-x", scene: "sa1", rig: "no-such-rig" },
  { id: "ZZ-3", title: "rigParams key is not a control", folder: "ZZ-3-x", scene: "sa1", rig: null,
    rigParams: { inflowQ: 1 } },
  { id: "ZZ-4", title: "unknown card key", folder: "ZZ-4-x", scene: "sa1", rig: null,
    instrument: [] },
  { id: "ZZ-5", title: "ui.view names a Play button", folder: "ZZ-5-x", scene: "sa1", rig: null,
    ui: { view: ["playBtn"] } },
  { id: "ZZ-7", title: "a tab carries the retired `alias`", folder: "ZZ-7-x", scene: "sa1",
    rig: null, tabs: [{ key: "a", label: "A", alias: "ZZ-OLD" }, { key: "b", label: "B" }] },
  { id: "ZZ-6", title: "legal: a gauge field of u", folder: "ZZ-6-x", scene: "sa1", rig: null,
    viewParams: { gaugeField: "u" } },
]);
