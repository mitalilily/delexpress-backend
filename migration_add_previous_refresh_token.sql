ALTER TABLE users
  ADD COLUMN "previousRefreshToken" varchar(500),
  ADD COLUMN "previousRefreshTokenExpiresAt" timestamp;
