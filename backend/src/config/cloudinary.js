import { v2 as cloudinary } from 'cloudinary'
import 'dotenv/config'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

export async function uploadToCloudinary(base64Image, folder) {
  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: `swiftdrop/${folder}`,
      resource_type: 'image',
      quality: 'auto'
    })
    return result.secure_url
  } catch (err) {
    console.error('Cloudinary upload failed:', err.message)
    throw new Error('Image upload failed')
  }
}

export default cloudinary