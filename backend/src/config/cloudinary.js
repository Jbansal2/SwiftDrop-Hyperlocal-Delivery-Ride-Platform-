import { v2 as cloudinary } from 'cloudinary'
import { env, isProduction } from './env.js'
import { childLogger } from '../lib/logger.js'

const log = childLogger('cloudinary')

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET
})

export async function uploadToCloudinary(base64Image, folder) {
  if (!isProduction && !env.CLOUDINARY_CLOUD_NAME) {
    // local dev / tests without cloudinary keys: pretend it uploaded
    log.debug({ folder }, 'cloudinary not configured, skipping upload')
    return `https://res.cloudinary.invalid/swiftdrop/${folder}.jpg`
  }
  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: `swiftdrop/${folder}`,
      resource_type: 'image',
      quality: 'auto'
    })
    return result.secure_url
  } catch (err) {
    log.error({ err, folder }, 'cloudinary upload failed')
    throw new Error('Image upload failed')
  }
}

export default cloudinary
