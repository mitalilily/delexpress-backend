"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/plans.routes.ts
const express_1 = require("express");
const plans_controller_1 = require("../../controllers/admin/plans.controller");
const router = (0, express_1.Router)();
router.get('/', plans_controller_1.PlansController.getPlans); // GET /api/plans
router.post('/', plans_controller_1.PlansController.createPlan); // POST /api/plans
router.post('/assign-to-user', plans_controller_1.PlansController.assignPlanToUser); // aSSIGN /api/plans/:id
router.put('/:id', plans_controller_1.PlansController.updatePlan); // PUT /api/plans/:id
router.delete('/:id', plans_controller_1.PlansController.deletePlan); // DELETE /api/plans/:id
exports.default = router;
