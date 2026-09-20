// Run every test in a timezone west of UTC. Date bugs (e.g. parsing "YYYY-MM-DD"
// as UTC, which lands on the previous day) only show up there, so pinning it
// keeps the suite deterministic and able to catch them on any machine or CI.
export default function setup() {
  process.env.TZ = "America/New_York"
}
