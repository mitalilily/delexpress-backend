import * as dotenv from 'dotenv'
import nodemailer from 'nodemailer'
import path from 'path'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@DelExpress.in'
const GOOGLE_SMTP_USER = process.env.GOOGLE_SMTP_USER || EMAIL_FROM
const GOOGLE_SMTP_PASSWORD = process.env.GOOGLE_SMTP_PASSWORD!
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = Number(process.env.SMTP_PORT || 587)
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'

/**
 * Send email via SMTP (Hostinger/custom SMTP if provided, else Gmail service)
 */
async function sendEmail(to: string, subject: string, htmlContent: string) {
  if (!GOOGLE_SMTP_PASSWORD) {
    console.warn('Google SMTP password not configured. Email not sent.')
    return
  }

  const transporter = SMTP_HOST
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
          user: GOOGLE_SMTP_USER,
          pass: GOOGLE_SMTP_PASSWORD,
        },
      })
    : nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: GOOGLE_SMTP_USER,
          pass: GOOGLE_SMTP_PASSWORD, // Use App Password for Gmail
        },
      })

  const mailOptions = {
    from: `"DelExpress" <${EMAIL_FROM}>`,
    to,
    subject,
    html: htmlContent,
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    console.log('Email sent successfully:', info.messageId)
  } catch (error) {
    console.error('Error sending email:', error)
    throw error
  }
}

interface WeightDiscrepancyNotification {
  userEmail: string
  userName: string
  orderNumber: string
  awbNumber?: string
  courierPartner?: string
  declaredWeight: number
  chargedWeight: number
  weightDifference: number
  additionalCharge: number
  discrepancyId: string
  autoAccepted?: boolean
  autoAcceptThreshold?: string
}

interface DailySummaryData {
  userEmail: string
  userName: string
  date: string
  totalDiscrepancies: number
  pendingCount: number
  acceptedCount: number
  disputedCount: number
  totalAdditionalCharges: number
  discrepancies: Array<{
    orderNumber: string
    weightDifference: number
    additionalCharge: number
    status: string
  }>
}

/**
 * Send weight discrepancy notification
 */
export async function sendWeightDiscrepancyEmail(data: WeightDiscrepancyNotification) {
  const {
    userEmail,
    userName,
    orderNumber,
    awbNumber,
    courierPartner,
    declaredWeight,
    chargedWeight,
    weightDifference,
    additionalCharge,
    discrepancyId,
    autoAccepted = false,
    autoAcceptThreshold,
  } = data

  const isLargeDiscrepancy = Math.abs(weightDifference) > 0.5 || additionalCharge > 100

  const subject = autoAccepted
    ? `✅ Weight Discrepancy Auto-Accepted - Order ${orderNumber}`
    : isLargeDiscrepancy
    ? `🚨 URGENT: Large Weight Discrepancy Detected - Order ${orderNumber}`
    : `⚖️ Weight Discrepancy Detected - Order ${orderNumber}`

  const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #333369; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
          .alert { background: ${
            autoAccepted ? '#d4edda' : isLargeDiscrepancy ? '#fff3cd' : '#d1ecf1'
          }; border-left: 4px solid ${
    autoAccepted ? '#28a745' : isLargeDiscrepancy ? '#ffc107' : '#0dcaf0'
  }; padding: 15px; margin: 20px 0; }
          .auto-accept-info { background: #e7f3ff; border-left: 4px solid #333369; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .label { font-weight: bold; color: #666; }
          .value { color: #333; }
          .highlight { color: ${
            weightDifference > 0 ? '#E74C3C' : '#27AE60'
          }; font-weight: bold; font-size: 18px; }
          .button { display: inline-block; background: #333369; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">${
              autoAccepted ? '✅ Weight Discrepancy Auto-Accepted' : '⚖️ Weight Discrepancy Alert'
            }</h2>
          </div>
          
          <div class="content">
            <p>Hi ${userName},</p>
            
            ${
              autoAccepted
                ? `<div class="alert">
                    <strong>✅ AUTO-ACCEPTED:</strong> This weight discrepancy has been automatically accepted based on your auto-acceptance settings.
                  </div>
                  <div class="auto-accept-info">
                    <h4 style="margin-top: 0; color: #333369;">What Happened Automatically:</h4>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                      <li><strong>Discrepancy Accepted:</strong> The weight difference (${Math.abs(
                        weightDifference,
                      ).toFixed(3)} kg) was within your auto-acceptance threshold${
                    autoAcceptThreshold ? ` (${autoAcceptThreshold} kg)` : ''
                  }</li>
                      <li><strong>Order Updated:</strong> The order's shipping charge has been updated to reflect the actual weight</li>
                      ${
                        additionalCharge > 0
                          ? `<li><strong>Wallet Charge Applied:</strong> ₹${additionalCharge.toFixed(
                              2,
                            )} has been automatically deducted from your wallet balance</li>`
                          : ''
                      }
                      <li><strong>Status:</strong> This discrepancy is now marked as "Accepted" and no further action is required</li>
                    </ul>
                    <p style="margin: 10px 0 0 0; font-size: 13px; color: #666;">
                      <strong>Note:</strong> You can review this discrepancy anytime in your weight reconciliation dashboard. If you believe this was processed incorrectly, you can still raise a dispute.
                    </p>
                  </div>`
                : isLargeDiscrepancy
                ? '<div class="alert"><strong>⚠️ URGENT:</strong> A significant weight discrepancy has been detected that requires your immediate attention.</div>'
                : '<p>A weight discrepancy has been detected for one of your orders.</p>'
            }
            
            <div class="details">
              <h3 style="margin-top: 0; color: #333369;">Order Details</h3>
              
              <div class="detail-row">
                <span class="label">Order Number:</span>
                <span class="value">${orderNumber}</span>
              </div>
              
              ${
                awbNumber
                  ? `<div class="detail-row">
                <span class="label">AWB Number:</span>
                <span class="value">${awbNumber}</span>
              </div>`
                  : ''
              }
              
              ${
                courierPartner
                  ? `<div class="detail-row">
                <span class="label">Courier Partner:</span>
                <span class="value">${courierPartner}</span>
              </div>`
                  : ''
              }
              
              <div class="detail-row">
                <span class="label">Declared Weight:</span>
                <span class="value">${declaredWeight.toFixed(3)} kg</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Charged Weight:</span>
                <span class="value">${chargedWeight.toFixed(3)} kg</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Weight Difference:</span>
                <span class="highlight">${
                  weightDifference > 0 ? '+' : ''
                }${weightDifference.toFixed(3)} kg</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Additional Charge:</span>
                <span class="highlight">₹${additionalCharge.toFixed(2)}</span>
              </div>
            </div>
            
            ${
              !autoAccepted
                ? `
            <p><strong>What should you do?</strong></p>
            <ul>
              <li>Review the discrepancy details</li>
              <li>Accept if the weight seems correct</li>
              <li>Raise a dispute if you believe the weight is incorrect</li>
            </ul>
            
            <center>
              <a href="${
                process.env.FRONTEND_URL || 'http://localhost:5173'
              }/reconciliation/weight/${discrepancyId}" class="button">
                Review Discrepancy
              </a>
            </center>
            
            <p style="margin-top: 30px; font-size: 13px; color: #666;">
              <strong>Tip:</strong> You can configure auto-acceptance thresholds in your settings to automatically accept minor discrepancies and avoid manual review.
            </p>
            `
                : `
            <center>
              <a href="${
                process.env.FRONTEND_URL || 'http://localhost:5173'
              }/reconciliation/weight/${discrepancyId}" class="button">
                View Details
              </a>
            </center>
            `
            }
          </div>
          
          <div class="footer">
            <p>This is an automated notification from DelExpress Weight Reconciliation System</p>
            <p>© ${new Date().getFullYear()} DelExpress. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `

  try {
    await sendEmail(userEmail, subject, html)
    console.log(`Weight discrepancy email sent to ${userEmail} for order ${orderNumber}`)
  } catch (error) {
    console.error('Error sending weight discrepancy email:', error)
  }
}

/**
 * Send daily weight reconciliation summary
 */
export async function sendDailySummaryEmail(data: DailySummaryData) {
  const {
    userEmail,
    userName,
    date,
    totalDiscrepancies,
    pendingCount,
    acceptedCount,
    disputedCount,
    totalAdditionalCharges,
    discrepancies,
  } = data

  const subject = `📊 Daily Weight Reconciliation Summary - ${date}`
  const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #333369; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
          .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
          .summary-card { background: white; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #ddd; }
          .summary-value { font-size: 24px; font-weight: bold; color: #333369; }
          .summary-label { font-size: 12px; color: #666; margin-top: 5px; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; }
          .table th { background: #f8f9fa; padding: 12px; text-align: left; font-weight: bold; border-bottom: 2px solid #ddd; }
          .table td { padding: 12px; border-bottom: 1px solid #eee; }
          .button { display: inline-block; background: #333369; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">📊 Daily Weight Reconciliation Summary</h2>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">${date}</p>
          </div>
          
          <div class="content">
            <p>Hi ${userName},</p>
            
            <p>Here's your daily summary of weight discrepancies:</p>
            
            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-value">${totalDiscrepancies}</div>
                <div class="summary-label">Total Discrepancies</div>
              </div>
              
              <div class="summary-card">
                <div class="summary-value" style="color: #F39C12;">${pendingCount}</div>
                <div class="summary-label">Pending Review</div>
              </div>
              
              <div class="summary-card">
                <div class="summary-value" style="color: #27AE60;">${acceptedCount}</div>
                <div class="summary-label">Accepted</div>
              </div>
              
              <div class="summary-card">
                <div class="summary-value" style="color: #3498DB;">${disputedCount}</div>
                <div class="summary-label">Disputed</div>
              </div>
            </div>
            
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
              <strong>Total Additional Charges:</strong> ₹${totalAdditionalCharges.toFixed(2)}
            </div>
            
            ${
              discrepancies.length > 0
                ? `
              <h3>Recent Discrepancies</h3>
              <table class="table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Weight Diff</th>
                    <th>Charge</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${discrepancies
                    .slice(0, 10)
                    .map(
                      (d) => `
                    <tr>
                      <td>${d.orderNumber}</td>
                      <td>${d.weightDifference > 0 ? '+' : ''}${d.weightDifference.toFixed(
                        3,
                      )} kg</td>
                      <td>₹${d.additionalCharge.toFixed(2)}</td>
                      <td><span style="color: ${
                        d.status === 'pending'
                          ? '#F39C12'
                          : d.status === 'accepted'
                          ? '#27AE60'
                          : '#3498DB'
                      };">${d.status.toUpperCase()}</span></td>
                    </tr>
                  `,
                    )
                    .join('')}
                </tbody>
              </table>
              ${
                discrepancies.length > 10
                  ? `<p><em>+ ${discrepancies.length - 10} more...</em></p>`
                  : ''
              }
            `
                : '<p>No discrepancies detected today! 🎉</p>'
            }
            
            <center>
              <a href="${
                process.env.FRONTEND_URL || 'http://localhost:5173'
              }/reconciliation/weight" class="button">
                View Full Report
              </a>
            </center>
          </div>
          
          <div class="footer">
            <p>This is an automated daily summary from DelExpress</p>
            <p>You can manage email preferences in your <a href="${
              process.env.FRONTEND_URL || 'http://localhost:5173'
            }/reconciliation/weight/settings">settings</a></p>
            <p>© ${new Date().getFullYear()} DelExpress. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `

  try {
    await sendEmail(userEmail, subject, html)
    console.log(`Daily summary email sent to ${userEmail}`)
  } catch (error) {
    console.error('Error sending daily summary email:', error)
  }
}

/**
 * Send dispute status update email
 */
export async function sendDisputeUpdateEmail(
  userEmail: string,
  userName: string,
  orderNumber: string,
  disputeStatus: string,
  adminComment?: string,
) {
  const statusColors: Record<string, string> = {
    approved: '#27AE60',
    rejected: '#E74C3C',
    under_review: '#3498DB',
  }

  const subject = `🔔 Dispute Update - Order ${orderNumber}`
  const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #333369; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
          .status-badge { display: inline-block; padding: 8px 16px; border-radius: 5px; font-weight: bold; color: white; background: ${
            statusColors[disputeStatus] || '#6B7280'
          }; }
          .comment { background: white; padding: 20px; border-left: 4px solid #333369; margin: 20px 0; }
          .button { display: inline-block; background: #333369; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">🔔 Dispute Status Update</h2>
          </div>
          
          <div class="content">
            <p>Hi ${userName},</p>
            
            <p>Your dispute for order <strong>${orderNumber}</strong> has been updated.</p>
            
            <p>New Status: <span class="status-badge">${disputeStatus.toUpperCase()}</span></p>
            
            ${
              adminComment
                ? `
              <div class="comment">
                <h4 style="margin-top: 0;">Admin Response:</h4>
                <p>${adminComment}</p>
              </div>
            `
                : ''
            }
            
            <center>
              <a href="${
                process.env.FRONTEND_URL || 'http://localhost:5173'
              }/reconciliation/weight" class="button">
                View Details
              </a>
            </center>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} DelExpress. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `

  try {
    await sendEmail(userEmail, subject, html)
    console.log(`Dispute update email sent to ${userEmail}`)
  } catch (error) {
    console.error('Error sending dispute update email:', error)
  }
}

interface WeeklyReportData {
  userEmail: string
  userName: string
  weekStart: string
  weekEnd: string
  totalDiscrepancies: number
  pendingCount: number
  acceptedCount: number
  disputedCount: number
  resolvedCount: number
  rejectedCount: number
  totalAdditionalCharges: number
  avgWeightDifference: number
  maxWeightDifference: number
  autoAcceptedCount: number
  courierBreakdown: Array<{
    courierPartner: string
    count: number
    totalCharge: number
    avgWeightDiff: number
  }>
  topDiscrepancies: Array<{
    orderNumber: string
    weightDifference: number
    additionalCharge: number
    status: string
    courierPartner: string
  }>
}

/**
 * Send weekly weight reconciliation report
 */
export async function sendWeeklyReportEmail(data: WeeklyReportData) {
  const {
    userEmail,
    userName,
    weekStart,
    weekEnd,
    totalDiscrepancies,
    pendingCount,
    acceptedCount,
    disputedCount,
    resolvedCount,
    rejectedCount,
    totalAdditionalCharges,
    avgWeightDifference,
    maxWeightDifference,
    autoAcceptedCount,
    courierBreakdown,
    topDiscrepancies,
  } = data

  const subject = `📊 Weekly Weight Reconciliation Report - ${weekStart} to ${weekEnd}`
  const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 700px; margin: 0 auto; padding: 20px; }
          .header { background: #333369; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
          .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
          .summary-card { background: white; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #ddd; }
          .summary-value { font-size: 24px; font-weight: bold; color: #333369; }
          .summary-label { font-size: 12px; color: #666; margin-top: 5px; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; }
          .table th { background: #f8f9fa; padding: 12px; text-align: left; font-weight: bold; border-bottom: 2px solid #ddd; }
          .table td { padding: 12px; border-bottom: 1px solid #eee; }
          .button { display: inline-block; background: #333369; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .highlight-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2 style="margin: 0;">📊 Weekly Weight Reconciliation Report</h2>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">${weekStart} to ${weekEnd}</p>
          </div>
          
          <div class="content">
            <p>Hi ${userName},</p>
            
            <p>Here's your comprehensive weekly summary of weight reconciliation activities:</p>
            
            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-value">${totalDiscrepancies}</div>
                <div class="summary-label">Total Discrepancies</div>
              </div>
              
              <div class="summary-card">
                <div class="summary-value" style="color: #F39C12;">${pendingCount}</div>
                <div class="summary-label">Pending</div>
              </div>
              
              <div class="summary-card">
                <div class="summary-value" style="color: #27AE60;">${acceptedCount}</div>
                <div class="summary-label">Accepted</div>
              </div>
              
              <div class="summary-card">
                <div class="summary-value" style="color: #3498DB;">${disputedCount}</div>
                <div class="summary-label">Disputed</div>
              </div>
              
              <div class="summary-card">
                <div class="summary-value" style="color: #27AE60;">${resolvedCount}</div>
                <div class="summary-label">Resolved</div>
              </div>
              
              <div class="summary-card">
                <div class="summary-value" style="color: #E74C3C;">${rejectedCount}</div>
                <div class="summary-label">Rejected</div>
              </div>
            </div>
            
            <div class="highlight-box">
              <h3 style="margin-top: 0;">Financial Summary</h3>
              <p><strong>Total Additional Charges:</strong> ₹${totalAdditionalCharges.toFixed(
                2,
              )}</p>
              <p><strong>Average Weight Difference:</strong> ${
                avgWeightDifference > 0 ? '+' : ''
              }${avgWeightDifference.toFixed(3)} kg</p>
              <p><strong>Maximum Weight Difference:</strong> ${
                maxWeightDifference > 0 ? '+' : ''
              }${maxWeightDifference.toFixed(3)} kg</p>
              <p><strong>Auto-Accepted:</strong> ${autoAcceptedCount} discrepancies</p>
            </div>
            
            ${
              courierBreakdown.length > 0
                ? `
              <h3>Courier Breakdown</h3>
              <table class="table">
                <thead>
                  <tr>
                    <th>Courier</th>
                    <th>Count</th>
                    <th>Total Charge</th>
                    <th>Avg Weight Diff</th>
                  </tr>
                </thead>
                <tbody>
                  ${courierBreakdown
                    .map(
                      (c) => `
                    <tr>
                      <td>${c.courierPartner || 'N/A'}</td>
                      <td>${c.count}</td>
                      <td>₹${c.totalCharge.toFixed(2)}</td>
                      <td>${c.avgWeightDiff > 0 ? '+' : ''}${c.avgWeightDiff.toFixed(3)} kg</td>
                    </tr>
                  `,
                    )
                    .join('')}
                </tbody>
              </table>
            `
                : ''
            }
            
            ${
              topDiscrepancies.length > 0
                ? `
              <h3>Top Discrepancies</h3>
              <table class="table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Courier</th>
                    <th>Weight Diff</th>
                    <th>Charge</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${topDiscrepancies
                    .slice(0, 10)
                    .map(
                      (d) => `
                    <tr>
                      <td>${d.orderNumber}</td>
                      <td>${d.courierPartner || 'N/A'}</td>
                      <td>${d.weightDifference > 0 ? '+' : ''}${d.weightDifference.toFixed(
                        3,
                      )} kg</td>
                      <td>₹${d.additionalCharge.toFixed(2)}</td>
                      <td><span style="color: ${
                        d.status === 'pending'
                          ? '#F39C12'
                          : d.status === 'accepted'
                          ? '#27AE60'
                          : '#3498DB'
                      };">${d.status.toUpperCase()}</span></td>
                    </tr>
                  `,
                    )
                    .join('')}
                </tbody>
              </table>
            `
                : ''
            }
            
            <center>
              <a href="${
                process.env.FRONTEND_URL || 'http://localhost:5173'
              }/reconciliation/weight" class="button">
                View Full Report
              </a>
            </center>
          </div>
          
          <div class="footer">
            <p>This is an automated weekly report from DelExpress</p>
            <p>You can manage email preferences in your <a href="${
              process.env.FRONTEND_URL || 'http://localhost:5173'
            }/reconciliation/weight/settings">settings</a></p>
            <p>© ${new Date().getFullYear()} DelExpress. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `

  try {
    await sendEmail(userEmail, subject, html)
    console.log(`Weekly report email sent to ${userEmail}`)
  } catch (error) {
    console.error('Error sending weekly report email:', error)
  }
}
