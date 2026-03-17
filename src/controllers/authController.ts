import * as dotenv from 'dotenv'
import { Request, Response } from 'express'
import { OAuth2Client } from 'google-auth-library'
import path from 'path'
import twilio from 'twilio'
import {
  clearUserEmailToken,
  clearUserOtpByEmail,
  createUserWithWallet,
  findUserByEmail,
  findUserById,
  handleEmailVerificationRequest,
  markEmailVerified,
  saveRefreshToken,
  updateUserByEmail,
  updateUserOtpByEmail,
  verifyGoogleToken,
} from '../models/services/userService'

import axios from 'axios'
import { OTP_EXPIRY } from '../utils/constants'

import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { changeAdminPassword, loginAdmin } from '../models/services/adminAuth.service'
import { employees } from '../schema/schema'
import { sendVerificationEmail } from '../utils/emailSender'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt'

const env = process.env.NODE_ENV || 'development'

// Load the correct .env file
dotenv.config({ path: path.resolve(__dirname, `../.env.${env}`) })

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const allowInlineOtp = process.env.ALLOW_INLINE_OTP === 'true'

export const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString()

const sendSmsViaTwilio = async (phone: string, message: string) => {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: phone,
  })
}

/* ------------------------------------------------------------------ */
/* SILENT REFRESH                                                     */
/* ------------------------------------------------------------------ */
export const refreshTokenController = async (req: Request, res: Response): Promise<any> => {
  /* 1. Grab the old refresh token from header or body */
  const oldToken =
    (req.headers['x-refresh-token'] as string) ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.body?.refreshToken)

  if (!oldToken) {
    console.error('❌ [Refresh Token] No refresh token provided')
    return res.status(401).json({ error: 'No refresh token' })
  }

  try {
    /* 2. Verify & decode */
    const payload = verifyRefreshToken(oldToken) // throws if invalid/expired

    /* 3. Find user & ensure this is the latest token */
    const user = await findUserById(payload.sub)
    if (!user) {
      console.error(`❌ [Refresh Token] User not found: ${payload.sub}`)
      return res.status(401).json({ error: 'User not found' })
    }

    const now = new Date()
    const matchesCurrent =
      Boolean(user.refreshToken) && user.refreshToken === oldToken
    const matchesPrevious =
      !matchesCurrent &&
      Boolean(user.previousRefreshToken) &&
      user.previousRefreshToken === oldToken &&
      (!user.previousRefreshTokenExpiresAt ||
        now <= new Date(user.previousRefreshTokenExpiresAt))

    if (!matchesCurrent && !matchesPrevious) {
      console.error(`❌ [Refresh Token] Token mismatch for user ${user.id}`)
      return res.status(401).json({ error: 'Refresh token invalid or already used' })
    }

    // Check if refresh token has expired in database
    if (matchesCurrent && user.refreshTokenExpiresAt && now > new Date(user.refreshTokenExpiresAt)) {
      console.error(`❌ [Refresh Token] Refresh token expired for user ${user.id}`)
      return res.status(401).json({ error: 'Refresh token expired' })
    }
    if (matchesPrevious && user.previousRefreshTokenExpiresAt && now > new Date(user.previousRefreshTokenExpiresAt)) {
      console.error(`❌ [Refresh Token] Previous refresh token expired for user ${user.id}`)
      return res.status(401).json({ error: 'Refresh token expired' })
    }

    /* 4. Rotate: issue fresh tokens */
    const accessToken = signAccessToken(user.id, user.role ?? 'customer')
    const { token: refreshToken } = signRefreshToken(user.id, user.role ?? 'customer')

    /* 5. Persist only the raw refresh string */
    await saveRefreshToken(user.id, refreshToken, ONE_WEEK_MS, matchesCurrent ? oldToken : null)

    console.log(`✅ [Refresh Token] Successfully refreshed tokens for user ${user.id}`)

    /* 6. Return both tokens to the client */
    return res.json({ accessToken, refreshToken })
  } catch (err: any) {
    console.error('❌ [Refresh Token] Error:', err?.message || err)
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired' })
    }
    if (err?.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid refresh token' })
    }
    return res.status(401).json({ error: 'Refresh token invalid or expired' })
  }
}

export const logoutController = async (req: Request, res: Response): Promise<any> => {
  const token =
    (req.headers['x-refresh-token'] as string) ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null)

  if (token) {
    try {
      const { sub } = verifyRefreshToken(token) // decode userId
      await saveRefreshToken(sub, null, 0, null) // 👈 always pass null
    } catch (e) {
      console.error('Logout token decode error:', e)
      // Ignore: still log user out client‑side
    }
  }

  return res.json({ message: 'Logged out' })
}

// -------------------
// Request OTP (Email-based)
// -------------------
export const requestOtp = async (req: Request, res: Response): Promise<any> => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email is required' })

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const otp = generateOtp()
  const expiry = new Date(Date.now() + OTP_EXPIRY)

  try {
    // 1. Look up user by email
    const user = await findUserByEmail(normalizedEmail)

    if (user && user.role === 'employee') {
      const [employeeRecord] = await db
        .select({
          isActive: employees.isActive,
        })
        .from(employees)
        .where(eq(employees.userId, user.id))

      if (employeeRecord && !employeeRecord.isActive) {
        return res.status(403).json({
          error: 'Your account is temporarily suspended by your administrator.',
        })
      }
    }

    if (user) {
      await updateUserOtpByEmail(normalizedEmail, otp, expiry)
    } else {
      await createUserWithWallet({
        email: normalizedEmail,
        otp,
        otpExpiresAt: expiry,
        onboardingStep: 0,
        emailVerified: false,
      })
    }

    // 2. Send OTP via email
    await sendVerificationEmail(normalizedEmail, otp)

    return res.json({
      message: 'OTP sent successfully to your email',
      ...((env === 'development' || allowInlineOtp) ? { otp } : {}),
    })
  } catch (err) {
    console.error('Error in requestOtp:', err)
    return res.status(500).json({ error: 'Something went wrong while requesting OTP' })
  }
}

export const verifyOtp = async (req: Request, res: Response): Promise<any> => {
  const { email, otp } = req.body

  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' })

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' })
  }

  try {
    const normalizedEmail = email.trim().toLowerCase()
    const user = await findUserByEmail(normalizedEmail)

    if (user && user.role === 'employee') {
      const [employeeRecord] = await db
        .select({
          isActive: employees.isActive,
        })
        .from(employees)
        .where(eq(employees.userId, user.id))

      if (employeeRecord && !employeeRecord.isActive) {
        return res.status(403).json({
          error: 'Your account is temporarily suspended by your administrator.',
        })
      }
    }

    if (!user || !user.otp || !user.otpExpiresAt) {
      return res.status(400).json({ error: 'OTP not requested' })
    }

    if (Date.now() > new Date(user.otpExpiresAt).getTime()) {
      return res.status(400).json({
        error: 'Your OTP is no longer valid. Please resend to receive a new one.',
      })
    }

    if (user.otp !== otp) {
      return res.status(400).json({ error: 'Incorrect OTP' })
    }

    await clearUserOtpByEmail(normalizedEmail)
    await markEmailVerified(normalizedEmail) // update emailVerified = true
    const accessToken = signAccessToken(user.id, user.role ?? 'customer')

    const { token: refreshToken } = signRefreshToken(user.id, user.role ?? 'customer')

    /* ---------- persist newest refresh token ---------- */
    await saveRefreshToken(user.id, refreshToken, ONE_WEEK_MS)

    return res.json({
      message: 'OTP verified successfully',
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        email: user.email,
        emailVerified: true,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Error in verifyOtp:', error)
    return res.status(500).json({ error: 'Something went wrong while verifying OTP' })
  }
}

export const requestEmailVerification = async (req: Request, res: Response): Promise<any> => {
  const { idToken, password, email } = req.body

  try {
    let userEmail = email
    let googleId: string | null = null

    // If idToken is provided, verify it to extract email and googleId
    if (idToken) {
      const googleUser = await verifyGoogleToken(idToken)
      userEmail = googleUser.email
      googleId = googleUser.googleId
    }

    if (!userEmail) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const result = await handleEmailVerificationRequest(
      userEmail,
      password,
      googleId, // null for password logins
    )

    const user = result.data?.user

    // ✅ Employee active check
    if (user && user.role === 'employee') {
      const [employeeRecord] = await db
        .select({
          isActive: employees.isActive,
        })
        .from(employees)
        .where(eq(employees.userId, user.id))

      if (employeeRecord && !employeeRecord.isActive) {
        return res.status(403).json({
          error: 'Your account is temporarily suspended by your administrator.',
        })
      }
    }

    // ── If the flow returned a user (authenticated / verified)
    if (user) {
      const accessToken = signAccessToken(user.id, user.role ?? 'customer')
      const { token: refreshToken } = signRefreshToken(user.id, user.role ?? 'customer')

      // Save refresh token to DB
      await saveRefreshToken(user.id, refreshToken, ONE_WEEK_MS)

      result.data.token = accessToken
      result.data.refreshToken = refreshToken
    }

    return res.status(result.status).json(result.data)
  } catch (err) {
    console.error('Error in requestEmailVerification:', err)
    return res.status(401).json({ error: 'Invalid credentials or token' })
  }
}

export const verifyEmailToken = async (req: Request, res: Response): Promise<any> => {
  const { email, token } = req.body

  if (!email || !token) {
    return res.status(400).json({ error: 'Email and token are required' })
  }

  try {
    const user = await findUserByEmail(email)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (user.emailVerificationToken !== token) {
      return res.status(400).json({ error: 'Invalid verification token' })
    }

    const expiresAt = user.emailVerificationTokenExpiresAt
    if (!expiresAt || Date.now() > new Date(expiresAt).getTime()) {
      return res.status(400).json({ error: 'Verification token expired' })
    }

    await markEmailVerified(email)
    await clearUserEmailToken(email)
    /* ── Sign & Set JWTs ────────────────────────────────────────────── */
    const accessToken = signAccessToken(user.id, user.role ?? 'customer')

    const { token: refreshToken } = signRefreshToken(user.id, user.role ?? 'customer')

    /* ---------- persist newest refresh token ---------- */
    await saveRefreshToken(user.id, refreshToken, ONE_WEEK_MS)

    return res.json({
      message: 'Email verified successfully',
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: true,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('verifyEmailToken error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// Init Google client with your client ID
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export const googleOAuthLogin = async (req: Request, res: Response): Promise<any> => {
  const { code } = req.body

  if (!code) return res.status(400).json({ error: 'Missing authorization code' })

  try {
    // Step 1: Exchange code for access_token and id_token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    })

    const { access_token, id_token } = tokenResponse.data

    // ✅ Step 2: Verify id_token (crucial for security)
    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID, // Make sure this matches
    })

    const payload = ticket.getPayload()
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Google ID token is invalid or missing email' })
    }

    const { email, name, sub: googleId, picture } = payload

    // ✅ Step 3: Create or update user
    let user = await findUserByEmail(email)

    if (user) {
      await updateUserByEmail(email, {
        googleId,
        profilePicture: picture,
        emailVerified: true,
        // firstName: user.firstName ?? name,
      })
    } else {
      await db.transaction(async (tx) => {
        /* 1️⃣  Create user + wallet */
        await createUserWithWallet(
          {
            email,
            googleId,
            firstName: name,
            phone: '',
            emailVerified: true,
            onboardingStep: 0,
            onboardingComplete: false,
            profilePicture: picture,
          },
          tx, // <-- transaction‑scoped Drizzle instance
        )

        /* 2️⃣  Mark e‑mail as verified */
        await markEmailVerified(email, tx)
        // Any thrown error aborts here and rolls back everything automatically.
      })
    }

    user = await findUserByEmail(email)

    if (user) {
      /* ── Sign & Set JWTs ────────────────────────────────────────────── */
      const accessToken = signAccessToken(user.id, user.role ?? 'customer')

      const { token: refreshToken } = signRefreshToken(user.id, user.role ?? 'customer')

      /* ---------- persist newest refresh token ---------- */
      await saveRefreshToken(user.id, refreshToken, ONE_WEEK_MS)

      return res.json({
        message: 'Google login successful',
        token: accessToken,
        refreshToken,
        user: {
          id: user?.id,
          email: user?.email,
          emailVerified: user?.emailVerified,
          phone: user?.phone,
          phoneVerified: user?.phoneVerified,
          profilePicture: user?.profilePicture,
          role: user?.role,
        },
      })
    } else {
      return res.status(500).json({ error: 'User not found' })
    }
  } catch (error: any) {
    console.error('Google OAuth login failed:', error.response?.data || error.message)
    return res.status(500).json({ error: 'Google login failed' })
  }
}

export const adminLoginController = async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })

  try {
    const result = await loginAdmin(email, password)
    return res.status(200).json({
      message: 'Admin login successful',
      ...result,
    })
  } catch (err: any) {
    const isUnauthorized = err.message === 'Unauthorized' || err.message === 'Invalid credentials'
    return res
      .status(isUnauthorized ? 401 : 500)
      .json({ error: err.message || 'Internal server error' })
  }
}

export const adminChangePasswordController = async (req: Request, res: Response) => {
  const adminId = (req as any)?.user?.sub
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string
    newPassword?: string
  }

  if (!adminId) return res.status(401).json({ error: 'Unauthorized' })
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' })
  }

  try {
    await changeAdminPassword(adminId, currentPassword, newPassword)
    return res.status(200).json({ message: 'Password changed successfully' })
  } catch (err: any) {
    const msg = err?.message || 'Internal server error'
    const status =
      msg === 'Unauthorized'
        ? 401
        : msg.includes('required') || msg.includes('must be') || msg.includes('incorrect')
          ? 400
          : 500
    return res.status(status).json({ error: msg })
  }
}
