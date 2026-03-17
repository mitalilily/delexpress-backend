import { boolean, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),

  /** Login identifiers */
  email: varchar('email', { length: 100 }).unique(),
  phone: varchar('phone', { length: 20 }).unique(),
  googleId: varchar('googleId', { length: 64 }).unique(),
  pendingEmail: varchar('pendingEmail', { length: 100 }),
  pendingPhone: varchar('pendingPhone', { length: 20 }),

  /** Auth stuff */
  passwordHash: varchar('passwordHash', { length: 200 }),
  refreshToken: varchar('refreshToken', { length: 500 }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  previousRefreshToken: varchar('previousRefreshToken', { length: 500 }),
  previousRefreshTokenExpiresAt: timestamp('previousRefreshTokenExpiresAt'),

  /** Verification & role */
  emailVerified: boolean('emailVerified').default(false),
  phoneVerified: boolean('phoneVerified').default(false),
  accountVerified: boolean('accountVerified').default(false),
  role: varchar('role', { length: 20 }).default('customer'),

  /** Misc */
  profilePicture: varchar('profilePicture', { length: 512 }),
  otp: varchar('otp', { length: 6 }),
  otpExpiresAt: timestamp('otpExpiresAt', { withTimezone: true }),
  emailVerificationToken: varchar('emailVerificationToken', { length: 8 }),
  emailVerificationTokenExpiresAt: timestamp('emailVerificationTokenExpiresAt', {
    withTimezone: true,
  }),

  /** House‑keeping */
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date()),
})
