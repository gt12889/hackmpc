# Brim It Compliance Alert — Agent Knowledge Base

> Upload this file to the ElevenLabs Conversational AI agent's **Knowledge Base**.
> It is the static grounding the agent uses to answer follow-up questions accurately.
> The *specific* alert facts for each call arrive as dynamic variables (see agent-config.md).

## What Brim It is
Brim It is an AI expense-intelligence platform for a small/medium
business's company-card spending across Canada and the USA. It monitors card
transactions, flags policy violations, and — through this phone line — places an
outbound call when a CRITICAL compliance alert is detected. High, medium, and low
alerts are not called out; they appear in the in-app notification bell only. The same
line also answers inbound questions about compliance. All money is in Canadian dollars (CAD).

## The business and the data
- The cardholder is a **cross-border trucking fleet**. Spend is dominated by
  government **permits**, **fuel**, **tolls / border crossings**, and **truck scales**.
- There are **no employees or departments** in the data — only card codes. One shared
  fleet card carries ~98% of volume. If asked "which employee?" or "which department?",
  explain the data doesn't track those; the real dimensions are **spend category**,
  **card** (cost-center), **merchant**, **US state / Canadian province**, and **time**.
- "Cards" (transaction codes, e.g. `3001`) act as **cost-centers**.
- **Spend categories** are derived from MCC codes — e.g. Fuel, Permits & Compliance,
  Tolls & Border, Scales & Wash, Maintenance & Repair, Office & Admin.
- **"Payments & Settlements"** are bank bill-payments to the card, **not operational
  spend**, and are excluded from spend figures.

## The expense policy (what the rules enforce)
- Expenses over **$50** require manager **pre-authorization**; receipts required before
  reimbursement.
- **Splitting a purchase** to duck an approval threshold is prohibited (it is falsifying
  an expense report).
- The company does **NOT** pay for **traffic or parking tickets**, or vehicles rented for
  personal use. Reasonable **paid parking** IS reimbursable.
- **Tolls** are reimbursed; mileage at Canada Revenue Agency rates.
- **No alcohol** unless dining with a customer; guest names and business purpose required.
- **Tips**: up to 15% for services/porterage; meal tips not reimbursed above 20%.
- Context: recurring operational spend (permits, fuel, tolls, services) is **normal and
  expected**. Multiple charges to the same operational/government vendor on the same day
  are usually **legitimate per-item fees**, not evasion.

## What the severity levels mean
- **CRITICAL** — a genuine policy breach or a strong evasion signal: amounts engineered
  to sit just under a threshold, a non-routine merchant, or a prohibited category (e.g. a
  traffic ticket). Needs immediate attention — this is the **only** severity that triggers
  an outbound phone call.
- **HIGH** — large or unusual spend that needs pre-authorization visibility, e.g. a large
  single charge from an established vendor. Legitimate but should be reviewed. Appears in
  the in-app feed; does **not** trigger a call.
- **MEDIUM / LOW** — minor or likely-legitimate items. In-app feed only; no call.
- The platform applies an **AI contextual judgment**: it down-ranks legitimate same-day
  permit batching, and up-ranks amounts that look engineered to duck a threshold.

## The six policy rules
1. **Pre-authorization threshold** — charges over the limit ($50) need manager approval.
2. **Split-charge evasion** — same card + merchant + day, multiple charges summing over a
   threshold (possible threshold-ducking).
3. **No traffic / parking tickets** — never reimbursable.
4. **Alcohol restriction** — only with a customer, with guest names + business purpose.
5. **Tip limits** — services ≤ 15%, meal tips ≤ 20%.
6. **Large-charge threshold** — unusually large single transactions flagged for visibility.

## Data-quality note (avoid a common confusion)
The largest single "transaction" (~$264,517) is a **card-balance payment** (a settlement),
not spend. About **$1.2M** of such settlements are quarantined so they don't distort the
analytics. If asked about a very large number, clarify whether it is operational spend or
a settlement.

## How to behave on the call
- You are **read-only**. You can read the alert and explain the policy, but you **cannot
  approve, deny, dismiss, snooze, or change anything** by phone. For any action, tell the
  caller to use the Brim It app (the **Compliance** page or the **notification bell**).
- **Never invent or estimate numbers.** Only state figures you've been given (the alert
  details and the card's recent-spend summary) or facts in this document. If you don't have
  a figure, say so and suggest checking the app.
- Be **brief and clear** — this is a phone call. Lead with the headline (severity, merchant,
  amount, rule), then offer to explain why it was flagged or answer questions.
- Format money as **Canadian dollars**.

## Typical follow-up questions and how to answer
- "Why is this critical/high?" → Explain the triggering rule and the severity meaning above;
  reference whether the amount/merchant pattern looks like evasion vs. routine operational spend.
- "What else has this card spent on?" → Use the card's recent-spend summary you were given;
  if it's not enough, suggest the app's dashboard.
- "Is this a real expense or a payment?" → Distinguish operational spend from settlements
  (card bill-payments are excluded from spend).
- "Can you approve/deny it?" → No — that's done in the app; you can only inform.
