import { eq } from 'drizzle-orm'
import { db } from '../client'
import { courier_credentials } from '../schema/courierCredentials'

const DEFAULT_DELHIVERY_API_BASE = 'https://track.delhivery.com'

export interface DelhiveryCredentials {
  apiBase: string
  clientName: string
  apiKey: string
}

export const getDelhiveryCredentials = async (): Promise<DelhiveryCredentials> => {
  const [credentials] = await db
    .select({
      apiBase: courier_credentials.apiBase,
      clientName: courier_credentials.clientName,
      apiKey: courier_credentials.apiKey,
    })
    .from(courier_credentials)
    .where(eq(courier_credentials.provider, 'delhivery'))
    .limit(1)

  return {
    apiBase: credentials?.apiBase || DEFAULT_DELHIVERY_API_BASE,
    clientName: credentials?.clientName || '',
    apiKey: credentials?.apiKey || '',
  }
}
