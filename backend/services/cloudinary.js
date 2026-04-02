const { v2: cloudinary } = require('cloudinary');

let configured = false;

function resolveCloudinaryEnv() {
  const cloudUrl = process.env.CLOUDINARY_URL;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD || process.env.CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_KEY || process.env.API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_SECRET || process.env.API_SECRET;
  return { cloudUrl, cloudName, apiKey, apiSecret };
}

function hasCloudinaryConfig() {
  const { cloudUrl, cloudName, apiKey, apiSecret } = resolveCloudinaryEnv();
  if (cloudUrl && String(cloudUrl).trim()) return true;
  return Boolean(cloudName && apiKey && apiSecret);
}

function ensureCloudinaryConfigured() {
  if (configured) return cloudinary;

  const { cloudUrl, cloudName, apiKey, apiSecret } = resolveCloudinaryEnv();

  if (!cloudUrl && (!cloudName || !apiKey || !apiSecret)) {
    throw new Error('Cloudinary chưa được cấu hình. Thiếu CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET');
  }

  if (cloudUrl) {
    cloudinary.config({ cloudinary_url: cloudUrl, secure: true });
  } else {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }
  configured = true;
  return cloudinary;
}

module.exports = { ensureCloudinaryConfigured, hasCloudinaryConfig };
