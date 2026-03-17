import { Response } from 'express'
import {
  addBankAccount,
  deleteBankAccount,
  getBankAccounts,
  updateBankAccount,
} from '../models/services/bankAccount.service'
import { HttpError } from '../utils/classes'

export const addBankAccountHandler = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user.sub as string
    const mode = (req.body.mode as 'manual' | 'pennyDrop') ?? 'manual'

    await addBankAccount(userId, req.body, mode)
    return res.status(201).json({ message: 'Bank account added' })
  } catch (err) {
    const e = err as HttpError
    console.error(e)
    return res.status(e.statusCode ?? 500).json({ error: e.message })
  }
}

export const getBankAccountsHandler = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user.sub
    const accounts = await getBankAccounts(userId)
    return res.status(200).json({ accounts })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to fetch accounts' })
  }
}

// export const verifyUpiController = async (
//   req: any,
//   res: Response
// ): Promise<any> => {
//   const { vpa } = req.body;
//   if (!vpa) return res.status(400).json({ message: "VPA is required" });

//   try {
//     const result = await validateVPA(vpa);
//     res.json(result);
//   } catch (err) {
//     res.status(500).json({ message: (err as Error).message });
//   }
// };

/**
 * PATCH /api/bank-account/:id
 * Authenticated user can update their own bank account.
 * fundAccountId is ignored, and status is auto-handled.
 */
export const editBankAccount = async (req: any, res: Response): Promise<any> => {
  const userId = req.user.sub // from requireAuth middleware
  const accountId = req.params.id
  const patch = req.body

  // 🧼 Allow only editable fields
  const allowedFields = [
    'bankName',
    'branch',
    'accountHolder',
    'upiId',
    'accountNumber',
    'accountType',
    'ifsc',
    'chequeImageUrl',
    'isPrimary',
  ]

  const sanitized: Record<string, any> = {}
  for (const key of allowedFields) {
    if (patch[key] !== undefined) sanitized[key] = patch[key]
  }

  try {
    const updated = await updateBankAccount(userId, accountId, sanitized)
    return res.json({ account: updated })
  } catch (err) {
    console.error('Bank account update error:', err)
    return res.status(400).json({ message: (err as Error).message })
  }
}

export const removeBankAccount = async (req: any, res: Response): Promise<any> => {
  const userId = req.user.sub // from requireAuth middleware
  const { id } = req.params

  try {
    await deleteBankAccount(userId, id)
    return res.status(204).send() // No Content
  } catch (err) {
    return res.status(400).json({ message: (err as Error).message })
  }
}
