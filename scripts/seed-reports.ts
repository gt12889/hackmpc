/**
 * Generate location-period expense reports + AI summaries.
 *   npm run seed:reports
 */
import { generateReports, summarizeReports } from "../lib/reports";

async function main() {
  const n = generateReports(12);
  console.log(`✓ generated ${n} location-period expense reports`);
  const s = await summarizeReports();
  console.log(`✓ AI summaries written for ${s} reports`);
  process.exit(0);
}
main();
