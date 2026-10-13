export const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } }
}

export const lat = { type: 'number', minimum: -90, maximum: 90 }
export const lng = { type: 'number', minimum: -180, maximum: 180 }
export const otpBody = {
  type: 'object',
  required: ['otp'],
  properties: { otp: { type: 'string', pattern: '^[0-9]{6}$' } }
}
export const cancelBody = {
  type: 'object',
  properties: { reason: { type: 'string', maxLength: 300 } }
}
