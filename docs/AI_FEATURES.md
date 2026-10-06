# AI Features — Future Layer

## Product principle

AI should be introduced where the system already has trusted structured data and the result can be verified.

## Candidate features

### AI business analyst

Questions:

- Why were sales down?
- Which products are driving repeat orders?
- Which days are weak?
- Which promotions appear unprofitable?

### AI campaign assistant

Prompt:

“Sales are slow this weekend. Suggest a campaign.”

Output should include:

- target segment;
- offer;
- rationale;
- estimated trade-offs;
- draft message;
- approval step.

### AI menu assistant

Can improve descriptions, classify tags and suggest merchandising order, but merchant approval is required.

### AI demand assistant

Later, forecast approximate demand and flag probable stock-out risk.

### AI support assistant

Summarize operational anomalies and propose next steps.

## AI safety

AI must not autonomously:

- issue refunds above configured threshold;
- change prices broadly;
- delete products;
- change payment settings;
- expose customer PII;
- send bulk marketing without explicit merchant approval.

## AI architecture direction

Keep AI as an application layer over domain APIs and analytics queries. Do not let an LLM write directly to production tables.

Suggested pattern:

`User -> AI Orchestrator -> Authorized tools/domain APIs -> validated result -> human approval where needed -> action`
