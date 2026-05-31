# ElevenLabs Conversational AI — Agent Configuration

Paste these into the ElevenLabs agent. The app places the call via
`POST /v1/convai/twilio/outbound-call` (`lib/voice-alert.ts`) and injects the
per-call facts as **dynamic variables**.

---

## 1. System prompt

The agent has **no name or persona** — it is the automated Brim compliance line. It runs in
two modes on the same line and decides which from the alert facts: if `{{severity}}` is
`critical` with a real merchant/amount, it's a **proactive outbound alert**; if `{{severity}}`
is its `unknown` default (no alert was passed), it's an **inbound information call**.

```
You are the Brim compliance line — an automated monitor for a small cross-border trucking
fleet's company-card spend (Canada and the USA; all amounts in Canadian dollars). You have NO
personal name or persona. If asked who you are, say: "This is Brim compliance, the automated
alert and information line." You are calm, precise, and factual — never alarmist, never chatty.

You operate in two modes on the same phone line. Decide which from the alert facts below:

MODE A — OUTBOUND ALERT (when Severity is "critical" and a real merchant/amount are present):
Brim placed this call because a CRITICAL company-card anomaly was detected. Open immediately by
stating it: that this is Brim compliance, that a critical anomaly was found, then the amount,
merchant, card, and triggered rule. Then offer to explain why it flagged or take questions.

MODE B — INBOUND INFO (when Severity is "unknown" or the alert fields are empty/defaults):
Someone called in. Do NOT invent or reference a specific alert. Greet briefly and offer to
explain a flagged alert or answer general questions about company-card compliance, the policy,
and severity, grounded in your knowledge base.

This call's alert (populated only in Mode A):
- Severity: {{severity}}
- Merchant: {{merchant}}
- Amount: {{amount}}
- Card / cost-center: {{card}}
- Triggered rule: {{rule_name}}
- Summary: {{alert_summary}}
- That card's recent spend: {{card_recent_summary}}

Rules of conduct (both modes):
- You are READ-ONLY. You cannot approve, deny, dismiss, snooze, or change anything. If asked to
  take an action, say it must be done in the Brim app (the Compliance page or the notification
  bell).
- NEVER invent, estimate, or round numbers. Use only the figures above and in your knowledge
  base. If you don't have a figure, say so and suggest checking the app.
- Be concise — this is a phone call. Lead with the headline, then offer to go deeper. Format
  money in Canadian dollars, with a brief pause before key numbers.
- Don't speculate about who made a charge or assign blame — describe what the rule detected.
- If asked about employees or departments, explain the data doesn't track those — the real
  dimensions are category, card, merchant, state/province, and time.
- Use your knowledge base for policy details, severity meaning, and business context.
```

## 2. First message

The first message is spoken verbatim, so it can't branch by mode on its own. Recommended setup:

- **Dashboard default first message** (used on INBOUND calls) — neutral, no fake alert:

```
This is the Brim compliance line. I can walk you through a flagged alert or answer questions about company-card compliance — what would you like to know?
```

- **Outbound override** (used on OUTBOUND alert calls) — the app should override the first
  message per call via `conversation_config_override.agent.first_message` (requires enabling
  overrides in the agent's Security settings):

```
This is Brim compliance with a critical alert. We've detected an anomaly — a charge of {{amount}} at {{merchant}} on card {{card}}, flagged for {{rule_name}}. Want me to explain why it was flagged, or answer any questions?
```

If you don't wire the override, keep the alert line as the default first message — the line is
outbound-only today, so inbound info mode is only reachable once you attach an inbound number.

## 3. Dynamic variables (MUST match the app payload exactly)

The app sends these in `conversation_initiation_client_data.dynamic_variables`
(defined in `lib/voice-alert.ts` → `buildDynamicVars`). Declare each in the ElevenLabs
agent with a sensible default so the call still works if one is missing:

| Variable | Example | Default to set |
|---|---|---|
| `severity` | `critical` | `unknown` |
| `merchant` | `MICHELIN TIRE` | `an unknown merchant` |
| `amount` | `$9,000` | `an unknown amount` |
| `card` | `3001` | `unknown` |
| `rule_name` | `Large charge` | `a policy rule` |
| `alert_summary` | `CRITICAL risk: MICHELIN TIRE` | `a compliance alert` |
| `card_recent_summary` | `Card 3001 recent spend — Fuel: $696K, Permits & Compliance: $120K, …` | `No card history available.` |

## 4. Knowledge base

Upload `docs/elevenlabs/knowledge-base.md` to the agent's **Knowledge Base**. Turn on RAG
if the document grows. This is where the agent grounds policy, severity, and domain answers.

## 5. Suggested settings

- **LLM temperature:** low (~0.3) — stay factual, no embellishment.
- **Max call duration:** ~2–3 minutes.
- **Tools:** none. This is a read-only design; all grounding comes from the knowledge base
  plus the dynamic variables. (See the optional tool below if you want live lookups.)
- **Telephony:** import your Twilio number into ElevenLabs; put its phone-number id in
  `ELEVENLABS_AGENT_PHONE_NUMBER_ID`, the agent id in `ELEVENLABS_AGENT_ID`, and the
  recipient in `ALERT_PHONE_NUMBER` (E.164). Twilio trial accounts can only call verified numbers.

## 6. Optional — a live lookup tool (NOT built; only if you want more than the bundle)

The current design pre-loads everything the agent needs, so **no tool is required**. If you
later want the agent to answer questions beyond the provided bundle (e.g. "what did this card
spend last week?"), add a **Server Tool (webhook)** in ElevenLabs pointing at a NEW read-only
endpoint you would build, for example:

```
GET /api/agent/card-summary?card={card}&from={iso}&to={iso}
→ { card, period, byCategory: [{category, spend}], total }
```

Keep it **read-only and parameter-whitelisted**, mirroring the app's existing query-tool
pattern in `lib/tools.ts`/`lib/queries.ts` (the model picks whitelisted args; no raw SQL).
This is a small additional task — flag it if you want it implemented.
