import { Response } from 'express'
import { getProfileByUserId, upsertUserProfile } from '../models/services/userProfile.service'
import {
  findUserByEmail,
  findUserById,
  findUserByPhone,
  updateUser,
} from '../models/services/userService'

export const getCurrentUser = async (req: any, res: Response): Promise<any> => {
  try {
    const { sub: userId } = req?.user

    const user = await findUserById(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.status(200).json({
      data: user,
      message: 'User data fetched successfully!',
    })
  } catch (err) {
    console.error('Error in /users/me:', err)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

export const getUserById = async (req: any, res: Response) => {
  try {
    const user = await findUserById(req.params.userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    return res.status(200).json({
      data: user,
      message: 'User data fetched successfully!',
    })
  } catch (err) {
    console.error('Error in /users/me:', err)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

export const completeRegistration = async (req: any, res: Response): Promise<any> => {
  const { step, data } = req.body
  const { sub: userId } = req?.user

  if (!step || !data || !userId) {
    return res.status(400).json({ error: 'User ID, step, and data are required' })
  }

  try {
    const user = await findUserById(userId)
    const userProfile = await getProfileByUserId(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    let updates: any = {}
    const isOnlyB2B =
      Array.isArray(data?.businessLegal?.businessCategory) &&
      data.businessLegal.businessCategory.length === 1 &&
      data.businessLegal.businessCategory[0]?.toLowerCase() === 'b2b'

    const phoneRaw = data?.basicInfo?.phone ?? ''
    const phoneDigits = phoneRaw.replace(/\D/g, '') // keep 10 digits
    const emailLower = (data?.basicInfo?.email ?? '').toLowerCase().trim()

    switch (step) {
      /* ─────────────────────────── STEP 1 ─────────────────────────── */
      case 1: {
        /* --- Validate phone (10 digits) --- */
        if (phoneDigits && !/^\d{10}$/.test(phoneDigits)) {
          return res.status(400).json({ error: 'Enter a valid 10‑digit phone number' })
        }

        /* --- Uniqueness checks --- */
        if (phoneDigits) {
          const other = await findUserByPhone(phoneDigits)
          if (other && other.id !== userId) {
            return res.status(400).json({
              error: 'Phone already linked to another account',
              user: {},
            })
          }
        }

        if (emailLower) {
          const other = await findUserByEmail(emailLower)
          if (other && other.id !== userId) {
            return res.status(400).json({
              error: 'Email already linked to another account',
              user: {},
            })
          }
        }

        updates = {
          companyInfo: {
            contactPerson: `${data?.basicInfo?.firstName} ${data?.basicInfo?.lastName}`,
            contactEmail: emailLower || user.email,
            contactNumber: phoneDigits || user.phone,
            pincode: data?.basicInfo?.pincode,
            state: data?.basicInfo?.state,
            POCEmailVerified: user?.emailVerified,
            POCPhoneVerified: user?.phoneVerified,
            businessName: data?.basicInfo?.companyName,
            city: data?.basicInfo?.city,
            profilePicture: user?.profilePicture,
          },
          onboardingStep: 1,
          profileCompletion: false,
          onboardingComplete: false,
        }
        break
      }

      /* ─────────────────────────── STEP 2 ─────────────────────────── */
      case 2:
        updates = {
          companyInfo: {
            ...userProfile?.companyInfo,
            brandName: data?.businessLegal?.brandName,
          },
          businessType: data?.businessLegal?.businessCategory,
          monthlyOrderCount: data?.businessLegal?.monthlyShipments,
          onboardingComplete: false,
          onboardingStep: 2,
        }
        break

      /* ─────────────────────────── STEP 3 ─────────────────────────── */
      case 3:
        updates = {
          onboardingStep: -1,
          onboardingComplete: true,
          companyInfo: {
            ...userProfile?.companyInfo,
            website: data?.basicInfo?.personalWebsite,
          },
        }
        break

      default:
        return res.status(400).json({ error: 'Invalid step' })
    }

    const updatedUser = await upsertUserProfile(userId, updates)
    await updateUser(userId, {
      email: emailLower || user.email,
      phone: phoneDigits || user.phone,
    })

    return res.json({
      message: `Step ${step} completed successfully`,
      user: updatedUser,
    })
  } catch (error) {
    console.error('Registration step error:', error)
    return res.status(500).json({ error: 'Failed to complete registration step' })
  }
}
