/**
 * Seed the policy_rules table from the REAL Brim expense policy (decoded from the
 * provided PDF), then run an initial scan + AI severity pass.
 *
 *   npm run seed:policies
 */
import { getDb } from "../lib/db";
import { runScan, adjustSeverityWithAI } from "../lib/compliance";

type Seed = {
  name: string;
  rule_type: string;
  description: string;
  threshold_amount?: number;
  window?: string;
  scope_category?: string;
  scope_merchant?: string;
  severity_base: string;
  policy_clause: string;
};

const RULES: Seed[] = [
  {
    name: "High-Value Pre-Authorization",
    rule_type: "txn_threshold",
    description: "Material charges that require manager pre-authorization and receipts before reimbursement.",
    threshold_amount: 5000,
    window: "transaction",
    severity_base: "high",
    policy_clause: "All expenses over $50 must be pre-authorized by your manager and receipts are required before any expense is reimbursed.",
  },
  {
    name: "Split-Charge Evasion",
    rule_type: "split_charge",
    description: "Two or more charges to the same merchant on the same day by one card that together cross an approval threshold while each stays under it.",
    threshold_amount: 3000,
    window: "day",
    severity_base: "critical",
    policy_clause: "Abuse of this business expense policy, including falsifying expense reports... is expressly prohibited.",
  },
  {
    name: "Traffic / Parking Tickets",
    rule_type: "no_tickets",
    description: "Brim does not reimburse traffic or parking tickets. (Reasonable paid parking is reimbursable.)",
    severity_base: "medium",
    policy_clause: "Brim does not pay for traffic or parking tickets, or for cars rented for personal use.",
  },
  {
    name: "Restricted Category (Alcohol / Gambling)",
    rule_type: "restricted_mcc",
    description: "Alcohol is not permitted unless dining with a customer; gambling/entertainment is not reimbursable.",
    severity_base: "high",
    policy_clause: "Unless dining with a customer, expensing alcoholic beverages is not permitted.",
  },
  {
    name: "Large Cross-Border Charge Review",
    rule_type: "cross_border_review",
    description: "High-value US/foreign charges flagged for currency and documentation review.",
    threshold_amount: 10000,
    window: "transaction",
    severity_base: "medium",
    policy_clause: "You are expected to exercise good judgment with respect to any expenses you incur and check the accuracy of bills.",
  },
  {
    name: "Monthly Fuel Budget",
    rule_type: "category_limit",
    description: "Alerts when monthly fuel spend exceeds the budgeted ceiling.",
    threshold_amount: 100000,
    window: "month",
    scope_category: "Fuel",
    severity_base: "medium",
    policy_clause: "Use best efforts to submit receipts within the current month; manage costs against budget.",
  },
  {
    name: "Receipt Required (High-Value)",
    rule_type: "missing_receipt",
    description: "Material charges with no matching receipt on file — receipts are required before reimbursement.",
    threshold_amount: 1000,
    window: "transaction",
    severity_base: "medium",
    policy_clause: "All expenses over $50 ... receipts are required before any expense is reimbursed.",
  },
];

function main() {
  const db = getDb();
  // Violations FK-reference policy_rules, so clear children before parents.
  db.prepare("DELETE FROM violations").run();
  db.prepare("DELETE FROM policy_rules").run();
  const ins = db.prepare(`
    INSERT INTO policy_rules (name, rule_type, description, threshold_amount, window, scope_category, scope_merchant, severity_base, enabled, policy_clause)
    VALUES (@name, @rule_type, @description, @threshold_amount, @window, @scope_category, @scope_merchant, @severity_base, 1, @policy_clause)`);
  for (const r of RULES) {
    ins.run({
      threshold_amount: null,
      window: null,
      scope_category: null,
      scope_merchant: null,
      ...r,
    });
  }
  console.log(`✓ seeded ${RULES.length} policy rules from the real Brim policy`);

  const scan = runScan();
  console.log(`✓ initial scan: ${scan.total} violation rows`);
  for (const [name, n] of Object.entries(scan.byRule)) console.log(`   ${name.padEnd(38)} ${n}`);

  adjustSeverityWithAI()
    .then((n) => {
      console.log(`✓ AI severity review applied to ${n} violations`);
      process.exit(0);
    })
    .catch((e) => {
      console.error("AI review skipped:", e?.message);
      process.exit(0);
    });
}

main();
