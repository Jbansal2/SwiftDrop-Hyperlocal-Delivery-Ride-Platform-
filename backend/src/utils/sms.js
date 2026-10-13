import axios from 'axios'
import { env, isProduction } from '../config/env.js'
import { childLogger } from '../lib/logger.js'

const log = childLogger('sms')

export async function sendOTPSms(phone, otp) {
  if (!isProduction) {
    log.info({ phone, devOtp: otp }, 'dev mode: OTP not sent by SMS')
    return true
  }
  try {
    const response = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
      params: {
        authorization: env.FAST2SMS_API_KEY,
        variables_values: otp,
        route: 'otp',
        numbers: phone
      },
      timeout: 10_000
    })
    return response.data.return
  } catch (err) {
    log.error({ err: err.message, phone }, 'otp sms failed')
    throw new Error('SMS send nahi hua')
  }
}

// plain text notification (driver approved / rejected). Never fails the caller:
// the DB change already happened, an SMS hiccup should not turn it into a 500.
export async function sendNotificationSms(phone, message) {
  if (!isProduction) {
    log.info({ phone, message }, 'dev mode: notification not sent by SMS')
    return true
  }
  try {
    const response = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
      params: { authorization: env.FAST2SMS_API_KEY, message, route: 'q', numbers: phone },
      timeout: 10_000
    })
    return response.data.return
  } catch (err) {
    log.warn({ err: err.message, phone }, 'notification sms failed')
    return false
  }
}
