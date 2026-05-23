# Blockers And Mock Strategy

| Area | Real Dependency | Current Strategy | Resume Trigger |
|---|---|---|---|
| Amazon SP-API | OAuth app, seller authorization, reports access | Use deterministic fixture data and adapter contracts | User provides app credentials and test seller authorization |
| Amazon Ads API | Ads API approval and profiles | Generate suggestions and audit actions without external writes | User provides Ads API credentials and explicit write approval |
| Keepa/SellerSprite/Helium 10 | Paid API keys and ToS approval | Use static competitor/review fixtures | User selects provider and provides API key/contract scope |
| LLM APIs | Provider key and budget | Use deterministic rules/explanations first | User provides LLM key and budget ceiling |
| Email/WeCom/WeChat | Accounts and templates | Store in-app notification records only | User provides channels and approves templates |
| Real store write operations | Production permission | Block or mock-execute through audit center | User explicitly enables per-action or per-module writes |
| Payment/Billing | Stripe/Alipay and merchant approval | Mock subscription/quota records | User provides payment provider credentials |
| Real beta validation | Real stores and beta sellers | Golden fixtures and replayable simulations | User provides seller authorization and beta cohort |
