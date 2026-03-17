-- Allow merchants to connect multiple stores/channels by removing one-store-per-user constraint
ALTER TABLE "stores" DROP CONSTRAINT IF EXISTS "stores_userId_key";
