import { Request, Response } from 'express'
import {
  getAllWallets,
  getWalletByUserId,
  getWalletTransactionsByUserId,
} from '../../models/services/adminWallet.service'
import { createWalletTransaction } from '../../models/services/wallet.service'

export const listWallets = async (req: Request, res: Response): Promise<any> => {
  try {
    const page = parseInt((req.query.page as string) || '1')
    const limit = parseInt((req.query.limit as string) || '20')
    const search = (req.query.search as string) || ''
    const sortBy =
      (req.query.sortBy as 'balance' | 'createdAt' | 'updatedAt' | 'email' | 'companyName' | undefined) ||
      'updatedAt'
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc' | undefined) || 'desc'

    const result = await getAllWallets({
      page,
      limit,
      search,
      sortBy,
      sortOrder,
    })

    res.status(200).json({ success: true, ...result })
  } catch (error) {
    console.error('Error fetching wallets:', error)
    res.status(500).json({ success: false, message: 'Server error fetching wallets' })
  }
}

export const getWallet = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.params
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' })
    }

    const wallet = await getWalletByUserId(userId)
    res.status(200).json({ success: true, data: wallet })
  } catch (error: any) {
    console.error('Error fetching wallet:', error)
    if (error.message === 'Wallet not found for this user') {
      return res.status(404).json({ success: false, message: error.message })
    }
    res.status(500).json({ success: false, message: 'Server error fetching wallet' })
  }
}

export const getWalletTransactions = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.params
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' })
    }

    const page = parseInt((req.query.page as string) || '1')
    const limit = parseInt((req.query.limit as string) || '50')
    const type = req.query.type as 'credit' | 'debit' | undefined
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined

    const result = await getWalletTransactionsByUserId({
      userId,
      page,
      limit,
      type,
      dateFrom,
      dateTo,
    })

    res.status(200).json({ success: true, ...result })
  } catch (error: any) {
    console.error('Error fetching wallet transactions:', error)
    if (error.message === 'Wallet not found for this user') {
      return res.status(404).json({ success: false, message: error.message })
    }
    res.status(500).json({ success: false, message: 'Server error fetching wallet transactions' })
  }
}

export const adjustWalletBalance = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.params
    const { type, amount, reason, notes } = req.body

    if (!userId || !type || !amount || !reason) {
      return res.status(400).json({
        success: false,
        message: 'userId, type, amount, and reason are required',
      })
    }

    if (type !== 'credit' && type !== 'debit') {
      return res.status(400).json({
        success: false,
        message: 'type must be either "credit" or "debit"',
      })
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'amount must be a positive number',
      })
    }

    // Get wallet
    const wallet = await getWalletByUserId(userId)

    // Create transaction
    await createWalletTransaction({
      walletId: wallet.id,
      amount: amountNum,
      type: type as 'credit' | 'debit',
      reason: reason,
      ref: `admin_adjustment_${Date.now()}`,
      meta: {
        adjustedBy: (req as any).user?.sub,
        notes: notes || '',
        timestamp: new Date().toISOString(),
      },
    })

    // Get updated wallet
    const updatedWallet = await getWalletByUserId(userId)

    res.status(200).json({
      success: true,
      message: `Wallet ${type === 'credit' ? 'credited' : 'debited'} successfully`,
      data: updatedWallet,
    })
  } catch (error: any) {
    console.error('Error adjusting wallet balance:', error)
    if (error.message === 'Wallet not found for this user') {
      return res.status(404).json({ success: false, message: error.message })
    }
    if (error.message === 'Insufficient wallet balance') {
      return res.status(400).json({ success: false, message: error.message })
    }
    res.status(500).json({ success: false, message: 'Server error adjusting wallet balance' })
  }
}

