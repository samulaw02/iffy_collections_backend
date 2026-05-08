const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

/**
 * Upload a buffer to Supabase Storage and return the public URL.
 * @param {Buffer} buffer - File contents
 * @param {string} bucket - Storage bucket name
 * @param {string} path - Storage path, e.g. "avatars/user-id.jpg"
 * @param {string} mimetype - e.g. "image/jpeg"
 * @returns {Promise<string>} Public URL
 */
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET;

const uploadFile = async (buffer, path, mimetype) => {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimetype, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

module.exports = { uploadFile };
