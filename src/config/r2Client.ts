import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import * as dotenv from 'dotenv'
import path from 'path'

// Determine environment
const env = process.env.NODE_ENV || 'development'

// Load the correct .env file
dotenv.config({ path: path.resolve(__dirname, `../.env.${env}`) })

export const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'placeholder',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export const downloadR2ObjectAsBuffer = async (bucket: string, key: string): Promise<Buffer> => {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
  const res = await r2.send(cmd)
  const chunks: Uint8Array[] = []
  for await (const chunk of res.Body as any) chunks.push(chunk)
  return Buffer.concat(chunks)
}
