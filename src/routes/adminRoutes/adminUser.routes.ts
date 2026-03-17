// src/routes/admin.support.routes.ts
import { Router } from 'express'
import {
  approveDocument,
  approveKyc,
  approveUser,
  createTeamMemberForUser,
  deleteTeamMember,
  deleteUserController,
  getKycDetailsByUserId,
  getTeamMembersForUser,
  getUserBankAccounts,
  listUsers,
  rejectDocument,
  rejectKyc,
  revokeKyc,
  resetUserPasswordController,
  searchSellers,
  updateTeamMemberStatus,
  updateUserBankAccountStatus,
} from '../../controllers/admin/user.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()

// Update ticket (status, due date)
router.get('/users-management', requireAuth, isAdminMiddleware, listUsers)
router.get('/search-sellers', requireAuth, isAdminMiddleware, searchSellers)
router.patch('/:id/approve', requireAuth, isAdminMiddleware, approveUser)
router.post('/:id/reset-password', requireAuth, isAdminMiddleware, resetUserPasswordController)
router.delete('/:id', requireAuth, isAdminMiddleware, deleteUserController)
router.get('/:id/team-members', requireAuth, isAdminMiddleware, getTeamMembersForUser)
router.post('/:id/team-members', requireAuth, isAdminMiddleware, createTeamMemberForUser)
router.patch(
  '/:id/team-members/:memberId/status',
  requireAuth,
  isAdminMiddleware,
  updateTeamMemberStatus,
)
router.delete('/:id/team-members/:memberId', requireAuth, isAdminMiddleware, deleteTeamMember)
router.get('/:id/bank-accounts', getUserBankAccounts)
router.patch(
  '/:id/bank-accounts/:accountId/status',
  requireAuth,
  isAdminMiddleware,
  updateUserBankAccountStatus,
)

router.get('/:id/kyc', requireAuth, getKycDetailsByUserId)
router.post('/kyc/approve/:id', requireAuth, isAdminMiddleware, approveKyc)
router.post('/kyc/reject/:id', requireAuth, isAdminMiddleware, rejectKyc)
router.post('/kyc/revoke/:id', requireAuth, isAdminMiddleware, revokeKyc)

// Document routes
router.post('/kyc/document/approve/:id/:key', requireAuth, isAdminMiddleware, approveDocument)
router.post('/kyc/document/reject/:id/:key', requireAuth, isAdminMiddleware, rejectDocument)

export default router
