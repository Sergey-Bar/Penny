-- Record per-sync native value, currency, and ILS cost basis alongside value_ils.
ALTER TABLE asset_snapshots ADD COLUMN cost_basis_ils REAL;
ALTER TABLE asset_snapshots ADD COLUMN value_native REAL;
ALTER TABLE asset_snapshots ADD COLUMN currency TEXT;
