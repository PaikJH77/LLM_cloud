# Architecture — Current Understanding

```text
Naver / Coupang / AliExpress / community sources
  -> Firecrawl / Exa adapters and platform parsers
  -> Acquisition + raw content + evidence
  -> normalization / product and seller entity resolution
  -> SQLite: product, variant, listing, seller, price observations, resolution audit
  -> Evaluation Input Schema (original v1.0 pending)
  -> Q/R/E/C evaluation -> recommendation
```

This diagram describes the intended architecture and modules observed in the v0.9 ZIP. The full source has not yet been committed to this repository. Live operation and evaluation contract compatibility remain unverified.
