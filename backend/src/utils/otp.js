// OTP generate
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Phone number 
export function validatePhone(phone) {
  return /^[6-9]\d{9}$/.test(phone)
}