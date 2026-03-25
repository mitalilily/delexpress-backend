"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlansController = void 0;
const plan_service_1 = require("../../models/services/plan.service");
exports.PlansController = {
    getPlans: async (req, res) => {
        try {
            // Accept status filter from query params: ?status=active | inactive | all
            const status = req.query.status;
            const allPlans = await plan_service_1.PlansService.getAll({ status });
            res.json(allPlans);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch plans' });
        }
    },
    createPlan: async (req, res) => {
        try {
            const { name, description } = req.body;
            const plan = await plan_service_1.PlansService.create({ name, description });
            res.status(201).json(plan);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to create plan' });
        }
    },
    updatePlan: async (req, res) => {
        try {
            const { id } = req.params;
            const updatedPlan = await plan_service_1.PlansService.update(id, req.body);
            res.status(200).json({
                success: true,
                message: 'Plan updated successfully',
                data: updatedPlan,
            });
        }
        catch (err) {
            res.status(500).json({
                success: false,
                message: err instanceof Error ? err.message : 'Failed to update plan',
            });
            console.log('error updating plan', err);
        }
    },
    deletePlan: async (req, res) => {
        try {
            const { id } = req.params;
            const plan = await plan_service_1.PlansService.deactivate(id);
            if (!plan)
                return res.status(404).json({ error: 'Plan not found' });
            res.json({ message: 'Plan deactivated', plan });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to deactivate plan' });
        }
    },
    assignPlanToUser: async (req, res) => {
        try {
            const { userId, planId } = req.body;
            if (!userId || !planId)
                return res.status(400).json({ error: 'userId and planId are required' });
            const result = await plan_service_1.PlansService.assignOrUpdateUserPlan(userId, planId);
            res.status(200).json({
                success: true,
                message: 'Plan assigned/updated successfully',
                data: result,
            });
        }
        catch (err) {
            console.error('Error assigning plan to user:', err);
            res.status(500).json({
                success: false,
                message: err instanceof Error ? err.message : 'Failed to assign plan',
            });
        }
    },
};
