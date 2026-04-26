# VAT Rollout Checklist

## Pre-migration
- Export all active SKU with `category_id`, `vat_rate`, `tax_override_enabled`, `tax_tags`.
- Flag and fix rows missing tax mapping before enabling strict mode.
- Create initial `TaxPolicy` draft with legal basis and exclusion rules.

## Migration
- Deploy backend with `TaxPolicy` model and VAT engine.
- Enable tax snapshot fields on new invoices.
- Keep legacy reports running in parallel for comparison.

## Dual-run (2-4 weeks)
- Compare `legacy_tax_amount` vs `tax_amount` by invoice and by line.
- Alert when delta exceeds:
  - `0.01` per line
  - `0.05` per invoice
- Daily reconciliation by store and by tax bucket.

## Go-live gate
- >= 99.5% active SKU mapped to valid tax source.
- <= 0.1% invoices/day over allowed delta.
- 100% active policy actions include `reason_code`, actor, timestamp.

## Rollback
- Turn off strict compliance in store tax settings.
- Keep invoice snapshots immutable (no rewrite).
- Open incident with affected invoice ids and root-cause tags.
