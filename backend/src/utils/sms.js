import axios from 'axios'

export async function sendOTPSms(phone, otp) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEV] OTP for ${phone}: ${otp}`)
    return true
  }
  try {
    const response = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
      params: {
        authorization: process.env.FAST2SMS_API_KEY,
        variables_values: otp,
        route: 'otp',
        numbers: phone
      }
    })
    return response.data.return
  } catch (err) {
    console.error('SMS failed:', err.message)
    throw new Error('SMS send nahi hua')
  }
}