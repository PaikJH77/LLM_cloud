# Collector → Evaluator Interface (Audit Draft)

**Status: draft, not the original Evaluation Input Schema v1.0.**

Proposed inputs:
- product_id, variant_id, listing_id
- seller_entity_id, seller_account_id
- acquisition_id, source_url, collected_at, raw_sha256
- evidence_id, claim_id, evidence_type, evidence_validation_status
- observed_price, currency, observed_at
- resolution_status, resolution_conflict, missingness_reason
- schema_version and source provenance

Evaluation dimensions: Q=product quality; R=seller reliability; E=seller expertise; C=evidence credibility.

Before implementation, inspect actual SQLAlchemy models and obtain the original v1.0 JSON Schema. Reject unsupported mappings; never invent trust scores or convert missing evidence to positive evidence.
