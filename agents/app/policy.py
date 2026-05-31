"""Brim expense policy summary — mirror of POLICY_SUMMARY in lib/compliance.ts.
Keep the two in sync. Passed into compliance/approval prompts for grounding."""

POLICY_SUMMARY = """Brim Expense Policy (key controls):
- All expenses over $50 require manager pre-authorization; receipts required before reimbursement.
- Splitting a purchase to duck an approval threshold is prohibited (falsifying expense reports).
- Brim does NOT pay for traffic or parking TICKETS, or cars rented for personal use. (Reasonable PAID parking IS reimbursable.)
- Tolls are reimbursed; mileage at Canada Revenue Agency rates.
- No alcohol unless dining with a customer; guest names + purpose required.
- Tips up to 15% (services/porterage); meal tips not reimbursed above 20%.
Context: this is a small/medium business operating across Canada and the US. Recurring operational spend (e.g. permits, fuel, tolls, services) is normal and expected. Multiple charges to the same operational vendor on the same day are often legitimate (per-item fees), not evasion - judge by amount shape and merchant type."""
