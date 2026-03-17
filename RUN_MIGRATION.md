# How to Run Courier Migration on Server

## ⚠️ IMPORTANT: Do NOT use `drizzle-kit push` - it will truncate tables!

## Steps to Run Migration:

### 1. Copy the migration file to your server
```bash
scp migrate-couriers-composite-key.ts your-server:/path/to/backend/
```

### 2. SSH into your server
```bash
ssh your-server
cd /path/to/backend
```

### 3. Make sure your .env.production has DATABASE_URL
```bash
# Check if DATABASE_URL is set
grep DATABASE_URL .env.production
```

### 4. Run the migration with tsx
```bash
npx tsx migrate-couriers-composite-key.ts
```

## Expected Output:
```
🔄 Starting courier composite key migration...

Step 1: Dropping FK constraint from Mera Courier Wala_zones...
  ✓ Done

Step 2: Updating NULL serviceProvider values to nimbuspost...
  ✓ Updated X rows

Step 3: Making serviceProvider NOT NULL...
  ✓ Done

Step 4: Dropping old primary key...
  ✓ Done

Step 5: Creating composite primary key (id, serviceProvider)...
  ✓ Done

✅ Migration completed successfully!
✅ Couriers table now uses composite primary key (id, serviceProvider)
⚠️  Note: FK constraint from zones table was not recreated.
```

## What This Migration Does:
1. ✅ Drops FK constraint from zones table (temporary)
2. ✅ Updates existing NULL serviceProvider values to 'nimbuspost'
3. ✅ Makes serviceProvider NOT NULL
4. ✅ Drops old single-column primary key (id)
5. ✅ Creates new composite primary key (id, serviceProvider)
6. ✅ **Preserves all existing data**

## After Migration:
- Same courier ID can exist for different service providers
- NimbusPost courier ID 3 and SmartShip courier ID 3 can coexist
- No data loss!

## Cleanup:
```bash
# After successful migration, you can delete the script
rm migrate-couriers-composite-key.ts
```
