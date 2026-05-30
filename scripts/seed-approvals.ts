/**
 * Build the pre-approval queue from real high-value transactions and generate
 * AI recommendations.  npm run seed:approvals
 */
import { synthesizeRequests, generateRecommendations } from "../lib/approvals";

async function main() {
  const n = synthesizeRequests();
  console.log(`✓ synthesized ${n} pending approval requests`);
  const recs = await generateRecommendations();
  console.log(`✓ AI recommendations generated for ${recs} requests`);
  process.exit(0);
}
main();
