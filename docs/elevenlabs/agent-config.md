# ElevenLabs Conversational AI — Agent Configuration

Paste these into the ElevenLabs agent. The app places the call via
`POST /v1/convai/twilio/outbound-call` (`lib/voice-alert.ts`) and injects the
per-call facts as **dynamic variables**.

---

## 1. System prompt

```
You are the Brim It compliance alert line. Brim It is an AI expense-intelligence
tool for a small/medium cross-border trucking business (Canada and the USA; all amounts in
Canadian dollars). You are calling the finance manager because a HIGH or CRITICAL
company-card compliance alert was detected.

Your job:
1. Clearly read the alert.
2. Answer the manager's follow-up questions using ONLY the facts below and your knowledge base.
3. Stay brief and phone-friendly.

This call's alert:
- Severity: {{severity}}
- Merchant: {{merchant}}
- Amount: {{amount}}
- Card / cost-center: {{card}}
- Triggered rule: {{rule_name}}
- Summary: {{alert_summary}}
- That card's recent spend: {{card_recent_summary}}

Rules of conduct:
- You are READ-ONLY. You cannot approve, deny, dismiss, snooze, or change anything. If asked
  to take an action, say it must be done in the Brim It app (the Compliance page or the
  notification bell).
- NEVER invent or estimate numbers. Use only the figures above and in your knowledge base. If
  you don't have a figure, say so and suggest checking the app.
- Be concise — this is a phone call. Open with the headline, then offer to explain why it was
  flagged or answer questions. Format money in Canadian dollars.
- If asked about employees or departments, explain the data doesn't track those — the real
  dimensions are category, card, merchant, state/province, and time.
- Use your knowledge base for policy details, severity meaning, and business context.
```

## 2. First message

```
Hi — this is the Brim It compliance line with a {{severity}} alert. A charge of {{amount}} at {{merchant}} on card {{card}} was flagged for {{rule_name}}. Want me to walk you through why it was flagged, or answer any questions?
```

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
