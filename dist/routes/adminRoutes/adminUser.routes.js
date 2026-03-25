"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/admin.support.routes.ts
const express_1 = require("express");
const user_controller_1 = require("../../controllers/admin/user.controller");
const isAdmin_1 = require("../../middlewares/isAdmin");
const requireAuth_1 = require("../../middlewares/requireAuth");
const router = (0, express_1.Router)();
// Update ticket (status, due date)
router.get('/users-management', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.listUsers);
router.get('/search-sellers', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.searchSellers);
router.patch('/:id/approve', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.approveUser);
router.post('/:id/reset-password', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.resetUserPasswordController);
router.delete('/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.deleteUserController);
router.get('/:id/team-members', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.getTeamMembersForUser);
router.post('/:id/team-members', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.createTeamMemberForUser);
router.patch('/:id/team-members/:memberId/status', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.updateTeamMemberStatus);
router.delete('/:id/team-members/:memberId', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.deleteTeamMember);
router.get('/:id/bank-accounts', user_controller_1.getUserBankAccounts);
router.patch('/:id/bank-accounts/:accountId/status', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.updateUserBankAccountStatus);
router.get('/:id/kyc', requireAuth_1.requireAuth, user_controller_1.getKycDetailsByUserId);
router.post('/kyc/approve/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.approveKyc);
router.post('/kyc/reject/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.rejectKyc);
router.post('/kyc/revoke/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.revokeKyc);
// Document routes
router.post('/kyc/document/approve/:id/:key', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.approveDocument);
router.post('/kyc/document/reject/:id/:key', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, user_controller_1.rejectDocument);
exports.default = router;
