ALTER TABLE pickup_addresses
ADD COLUMN IF NOT EXISTS smartship_hub_id VARCHAR(50);
