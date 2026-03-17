import { Request, Response } from 'express'
import {
  getBankAccountsByUserId,
  updateBankAccountStatusById,
} from '../../models/services/bankAccount.service'
import {
  getUserKycService,
  updateDocumentStatus,
  updateKycStatus,
} from '../../models/services/kyc.service'
import { deleteEmployeeService, getEmployeesByAdminService, toggleEmployeeStatusService, createEmployeeService } from '../../models/services/employee.service'
import { deleteUser, findUserById, getAllUsersWithRoleUser, resetUserPassword, updateUserApprovalStatus } from '../../models/services/userService'
import { sendKycStatusEmail } from '../../utils/emailSender'

export async function listUsers(req: any, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1
    const perPage = parseInt(req.query.perPage as string) || 10
    const search = (req.query.search as string) || ''
    const sortBy =
      (req.query.sortBy as
        | 'email'
        | 'role'
        | 'createdAt'
        | 'companyName'
        | 'contactPerson'
        | undefined) || 'createdAt'
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc' | undefined) || 'desc'
    const onboardingComplete = req.query.onboardingComplete ?? ''
    const approved = req.query.approved ?? ''
    // Normalize all status values into a single array
    let businessTypes = []

    const rawBusinessTypes = req.query['businessTypes[]'] ?? req.query.businessTypes

    if (Array.isArray(rawBusinessTypes)) {
      businessTypes = rawBusinessTypes.flat().filter(Boolean)
    } else if (typeof rawBusinessTypes === 'string') {
      businessTypes = [rawBusinessTypes]
    }

    const { data, totalCount } = await getAllUsersWithRoleUser({
      page,
      perPage,
      search,
      sortBy,
      sortOrder,
      onboardingComplete,
      businessTypes,
      approved,
    })

    res.status(200).json({ success: true, data, totalCount })
  } catch (error) {
    console.error('Error fetching users with role customer:', error)
    res.status(500).json({ success: false, message: 'Server error fetching users' })
  }
}

export async function getTeamMembersForUser(req: any, res: Response) {
  try {
    const adminId = req.params.id
    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 10
    const search = (req.query.search as string) || ''
    const statusQuery = (req.query.status as string) || ''
    const status =
      statusQuery === 'active' || statusQuery === 'inactive'
        ? (statusQuery as 'active' | 'inactive')
        : undefined

    if (!adminId) {
      return res.status(400).json({ success: false, message: 'User identifier is required' })
    }

    const { employees, page: currentPage, limit: perPage, hasMore, nextPage, totalCount } =
      await getEmployeesByAdminService(adminId, page, limit, search, status)

    res.status(200).json({
      success: true,
      members: employees,
      page: currentPage,
      perPage,
      totalCount,
      hasMore,
      nextPage,
    })
  } catch (error: any) {
    console.error('Error fetching team members for user:', error)
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch team members',
    })
  }
}

export async function createTeamMemberForUser(req: any, res: Response) {
  try {
    const adminId = req.params.id
    if (!adminId) {
      return res.status(400).json({ success: false, message: 'User identifier is required' })
    }

    const { name, email, phone, role, password, moduleAccess } = req.body || {}

    const trimmedName = typeof name === 'string' ? name.trim() : ''
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : undefined

    if (!trimmedName || !trimmedEmail) {
      return res
        .status(400)
        .json({ success: false, message: 'Name and email are required to create a team member' })
    }

    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: 'A password of at least 6 characters is required for team members',
      })
    }

    const payload = {
      adminId,
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      role: role || 'employee',
      password,
      moduleAccess: typeof moduleAccess === 'object' && moduleAccess !== null ? moduleAccess : {},
    }

    const { employee, user } = await createEmployeeService(payload, adminId)

    res.status(201).json({
      success: true,
      member: employee,
      user,
    })
  } catch (error: any) {
    console.error('Error creating team member for user:', error)
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to create team member',
    })
  }
}

export async function updateTeamMemberStatus(req: any, res: Response) {
  try {
    const adminId = req.params.id
    const memberId = req.params.memberId
    const { isActive } = req.body || {}

    if (!adminId || !memberId) {
      return res.status(400).json({ success: false, message: 'Invalid team member reference' })
    }

    if (typeof isActive !== 'boolean') {
      return res
        .status(400)
        .json({ success: false, message: 'The isActive flag must be provided as a boolean' })
    }

    const member = await toggleEmployeeStatusService(memberId, adminId, isActive)

    res.status(200).json({
      success: true,
      member,
    })
  } catch (error: any) {
    console.error('Error updating team member status:', error)
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update team member status',
    })
  }
}

export async function deleteTeamMember(req: any, res: Response) {
  try {
    const adminId = req.params.id
    const memberId = req.params.memberId

    if (!adminId || !memberId) {
      return res.status(400).json({ success: false, message: 'Invalid team member reference' })
    }

    const result = await deleteEmployeeService(memberId, adminId)

    res.status(200).json({
      success: true,
      member: result,
    })
  } catch (error: any) {
    console.error('Error deleting team member:', error)
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to delete team member',
    })
  }
}

// Search sellers by name for autocomplete
export async function searchSellers(req: any, res: Response) {
  try {
    const search = (req.query.q as string) || ''
    const limit = parseInt(req.query.limit as string) || 20

    if (!search.trim()) {
      return res.status(200).json({ success: true, data: [] })
    }

    const { data } = await getAllUsersWithRoleUser({
      page: 1,
      perPage: limit,
      search: search.trim(),
      sortBy: 'companyName',
      sortOrder: 'asc',
    })

    // Format for autocomplete
    const formatted = data.map((user: any) => ({
      id: user.id,
      label: user.companyName || user.contactPerson || user.email,
      value: user.id,
      email: user.email,
      companyName: user.companyName,
      contactPerson: user.contactPerson,
    }))

    res.status(200).json({ success: true, data: formatted })
  } catch (error) {
    console.error('Error searching sellers:', error)
    res.status(500).json({ success: false, message: 'Server error searching sellers' })
  }
}

export async function approveUser(req: any, res: Response) {
  try {
    const userId = req.params.id
    console.log(userId)
    // Fetch user to verify existence
    const user = await findUserById(userId)
    if (!user) {
      return res.status(200).json({ success: false, message: 'User not found' })
    }

    if (user.approved) {
      return res.status(400).json({ success: false, message: 'User is already approved' })
    }

    // Update approval status
    await updateUserApprovalStatus(userId, true)

    return res.status(200).json({ success: true, message: 'User approved successfully' })
  } catch (error) {
    console.error('Error approving user:', error)
    return res.status(500).json({ success: false, message: 'Server error approving user' })
  }
}

export async function resetUserPasswordController(req: any, res: Response) {
  try {
    const userId = req.params.id

    // Check if user exists (optional but recommended)
    const user = await findUserById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    const tempPassword = await resetUserPassword(userId)

    // Return the temp password to admin so they can share it manually
    return res.status(200).json({
      success: true,
      message: 'User password reset successfully',
      tempPassword,
    })
  } catch (error) {
    console.error('Error resetting user password:', error)
    return res.status(500).json({ success: false, message: 'Server error resetting password' })
  }
}

export async function getUserBankAccounts(req: any, res: Response) {
  try {
    const userId = req.params.id

    // Verify user exists first (optional but recommended)
    const user = await findUserById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    const bankAccounts = await getBankAccountsByUserId(userId)

    return res.status(200).json({ success: true, data: bankAccounts })
  } catch (error) {
    console.error('Error fetching user bank accounts:', error)
    return res.status(500).json({ success: false, message: 'Server error fetching bank accounts' })
  }
}

export async function updateUserBankAccountStatus(req: any, res: Response) {
  try {
    const userId = req.params.id
    const accountId = req.params.accountId
    const { status, rejectionReason } = req.body

    // Validate required fields
    if (!['verified', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' })
    }

    // Verify user exists
    const user = await findUserById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    // Call service to update bank account status
    await updateBankAccountStatusById(userId, accountId, status, rejectionReason)

    return res
      .status(200)
      .json({ success: true, message: 'Bank account status updated successfully' })
  } catch (error) {
    console.error('Error updating bank account status:', error)
    return res
      .status(500)
      .json({ success: false, message: 'Server error updating bank account status' })
  }
}

export const getKycDetailsByUserId = async (req: any, res: Response): Promise<any> => {
  const userId = req.params.id

  try {
    const added = await getUserKycService(userId)

    return res.json({
      message: 'KYC details fetched successfully',
      kyc: added,
    })
  } catch (err: any) {
    if (err?.statusCode === 200) {
      return res.status(200).json({ message: 'No KYC details found', kyc: {} })
    }
    return res.status(400).json({ message: (err as Error).message, kyc: {} })
  }
}

export const approveKyc = async (req: any, res: Response) => {
  try {
    const user = await findUserById(req.params.id)
    await updateKycStatus(req.params.id, 'verified')

    if (user?.email) {
      sendKycStatusEmail({
        to: user.email,
        userName: user.email,
        status: 'verified',
      }).catch((err) => console.error('Failed to send KYC approval email:', err))
    }

    res.json({ message: 'KYC approved' })
  } catch {
    res.status(400).json({ message: 'Failed to approve KYC' })
  }
}

// Reject KYC
export const rejectKyc = async (req: Request, res: Response) => {
  const { reason } = req.body
  if (!reason) return res.status(400).json({ message: 'Rejection reason required' })

  try {
    const user = await findUserById(req.params.id)
    await updateKycStatus(req.params.id, 'rejected', reason)

    if (user?.email) {
      sendKycStatusEmail({
        to: user.email,
        userName: user.email,
        status: 'rejected',
        reason,
      }).catch((err) => console.error('Failed to send KYC rejection email:', err))
    }

    res.json({ message: 'KYC rejected' })
  } catch {
    res.status(400).json({ message: 'Failed to reject KYC' })
  }
}

// Revoke KYC (move back to verification in progress)
export const revokeKyc = async (req: Request, res: Response) => {
  const { reason } = req.body
  if (!reason) return res.status(400).json({ message: 'Revocation reason required' })

  try {
    const user = await findUserById(req.params.id)
    await updateKycStatus(req.params.id, 'verification_in_progress', reason)

    if (user?.email) {
      sendKycStatusEmail({
        to: user.email,
        userName: user.email,
        status: 'rejected',
        reason: `KYC was revoked by admin. Re-verification required. Reason: ${reason}`,
      }).catch((err) => console.error('Failed to send KYC revoke email:', err))
    }

    res.json({ message: 'KYC revoked and moved to verification in progress' })
  } catch {
    res.status(400).json({ message: 'Failed to revoke KYC' })
  }
}

// Approve single document
export const approveDocument = async (req: Request, res: Response) => {
  const { key } = req.params
  try {
    await updateDocumentStatus(req.params.id, key, 'verified')
    res.json({ message: 'Document approved' })
  } catch {
    res.status(400).json({ message: 'Failed to approve document' })
  }
}

// Reject single document
export const rejectDocument = async (req: Request, res: Response) => {
  const { key } = req.params
  const { reason } = req.body
  if (!reason) return res.status(400).json({ message: 'Rejection reason required' })

  try {
    await updateDocumentStatus(req.params.id, key, 'rejected', reason)
    res.json({ message: 'Document rejected' })
  } catch {
    res.status(400).json({ message: 'Failed to reject document' })
  }
}

// Delete user
export async function deleteUserController(req: Request, res: Response) {
  try {
    const userId = req.params.id

    // Check if user exists
    const user = await findUserById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    // Prevent deleting admin users
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete admin users' })
    }

    // Delete user
    await deleteUser(userId)

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    })
  } catch (error: any) {
    console.error('Error deleting user:', error)
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error deleting user',
    })
  }
}
