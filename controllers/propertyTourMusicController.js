const db = require('../config/middleware/database');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const logger = require('../config/utils/logger');

let cloudinaryConfigured = false;
const ensureCloudinary = () => {
  if (cloudinaryConfigured) return true;
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return false;
  cloudinary.config({ cloud_name, api_key, api_secret });
  cloudinaryConfigured = true;
  return true;
};

const ALLOWED_AUDIO = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mp4', 'audio/m4a'];
const ALLOWED_EXT = ['.mp3', '.wav', '.aac', '.m4a'];

exports.listTracks = async (req, res) => {
  try {
    const { active, mood, includeArchived } = req.query;
    let where = '1=1';
    const params = [];
    if (active === 'true') where += ' AND is_active = TRUE AND is_archived = FALSE';
    if (mood) { params.push(mood); where += ` AND mood = $${params.length}`; }
    if (includeArchived !== 'true') where += ' AND is_archived = FALSE';
    const result = await db.query(`SELECT * FROM property_tour_music WHERE ${where} ORDER BY priority DESC, created_at DESC`, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('List tour music error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load music library' });
  }
};

exports.uploadTrack = async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'No audio file uploaded' });
    
    const mime = file.mimetype || '';
    const ext = (file.originalname || '').toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    if (!ALLOWED_AUDIO.includes(mime) && !ALLOWED_EXT.includes(ext)) {
      return res.status(400).json({ success: false, message: 'Unsupported audio format. Use MP3, WAV, AAC, or M4A.' });
    }
    
    let fileUrl = file.path;
    let filePublicId = file.filename || null;
    
    if (ensureCloudinary() && file.path) {
      try {
        const uploaded = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload(file.path, {
            resource_type: 'video',
            folder: 'rental_platform/property_tour/music',
            public_id: `tour_music_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
          }, (err, result) => err ? reject(err) : resolve(result));
        });
        fileUrl = uploaded.secure_url || uploaded.url;
        filePublicId = uploaded.public_id;
      } catch (e) {
        logger.warn('Cloudinary music upload failed, using local:', e.message);
      }
    }
    
    const { title, description, mood, property_types, priority, auto_select, commercial_use_approved, license_type, license_source, license_reference, license_expiry, license_notes } = req.body;
    
    const result = await db.query(
      `INSERT INTO property_tour_music 
       (title, description, file_url, file_public_id, file_type, file_size, mood, property_types, priority, auto_select, commercial_use_approved, license_type, license_source, license_reference, license_expiry, license_notes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        title || file.originalname || 'Untitled',
        description || null,
        fileUrl,
        filePublicId,
        mime,
        file.size || null,
        mood || null,
        JSON.stringify(Array.isArray(property_types) ? property_types : (property_types ? [property_types] : [])),
        priority ? parseInt(priority) : 0,
        auto_select !== 'false',
        commercial_use_approved === 'true' || commercial_use_approved === true,
        license_type || null,
        license_source || null,
        license_reference || null,
        license_expiry || null,
        license_notes || null,
        req.user?.id || null,
      ]
    );
    
    res.json({ success: true, data: result.rows[0], message: 'Track uploaded' });
  } catch (error) {
    logger.error('Upload tour music error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to upload track' });
  }
};

exports.updateTrack = async (req, res) => {
  try {
    const { id } = req.params;
    const fields = [];
    const params = [];
    let idx = 1;
    
    const allowed = ['title', 'description', 'mood', 'priority', 'auto_select', 'is_active', 'is_archived', 'commercial_use_approved', 'license_type', 'license_source', 'license_reference', 'license_expiry', 'license_notes'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] === 'boolean') {
          fields.push(`${key} = $${idx++}`);
          params.push(req.body[key]);
        } else if (key === 'priority') {
          fields.push(`${key} = $${idx++}`);
          params.push(parseInt(req.body[key]) || 0);
        } else {
          fields.push(`${key} = $${idx++}`);
          params.push(req.body[key] === '' ? null : req.body[key]);
        }
      }
    }
    if (req.body.property_types !== undefined) {
      fields.push(`property_types = $${idx++}`);
      params.push(JSON.stringify(Array.isArray(req.body.property_types) ? req.body.property_types : []));
    }
    if (!fields.length) return res.status(400).json({ success: false, message: 'No fields to update' });
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);
    const result = await db.query(`UPDATE property_tour_music SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Track not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Update tour music error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update track' });
  }
};

exports.deleteTrack = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('UPDATE property_tour_music SET is_archived = TRUE, is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Track not found' });
    res.json({ success: true, message: 'Track archived' });
  } catch (error) {
    logger.error('Delete tour music error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to archive track' });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM property_tour_music_settings WHERE id = 1');
    res.json({ success: true, data: result.rows[0] || { music_enabled: true, default_volume: 0.25, ducking_enabled: true, ducking_volume: 0.12 } });
  } catch (error) {
    logger.error('Get tour music settings error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { music_enabled, default_volume, ducking_enabled, ducking_volume } = req.body;
    const result = await db.query(
      `UPDATE property_tour_music_settings SET 
       music_enabled = COALESCE($1, music_enabled),
       default_volume = COALESCE($2, default_volume),
       ducking_enabled = COALESCE($3, ducking_enabled),
       ducking_volume = COALESCE($4, ducking_volume),
       updated_at = CURRENT_TIMESTAMP,
       updated_by = $5
       WHERE id = 1 RETURNING *`,
      [music_enabled, default_volume, ducking_enabled, ducking_volume, req.user?.id || null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Update tour music settings error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};

exports.getMusicSettings = async () => {
  try {
    const result = await db.query('SELECT * FROM property_tour_music_settings WHERE id = 1');
    const row = result.rows[0] || {};
    return {
      enabled: row.music_enabled !== false,
      volume: Number.isFinite(Number(row.default_volume)) ? Number(row.default_volume) : 0.25,
      ducking: row.ducking_enabled !== false,
      duckingVolume: Number.isFinite(Number(row.ducking_volume)) ? Number(row.ducking_volume) : 0.12,
    };
  } catch (error) {
    logger.warn('Tour music settings unavailable:', error.message);
    return { enabled: true, volume: 0.25, ducking: true, duckingVolume: 0.12 };
  }
};

exports.selectTrackForProperty = async (propertyType) => {
  try {
    const settings = await exports.getMusicSettings();
    if (!settings.enabled) return null;
    const type = String(propertyType || '').toLowerCase();
    const result = await db.query(
      `SELECT * FROM property_tour_music 
       WHERE is_active = TRUE AND is_archived = FALSE AND auto_select = TRUE AND commercial_use_approved = TRUE
       ORDER BY priority DESC, RANDOM() LIMIT 20`
    );
    if (!result.rows.length) return null;
    // Prefer matching property type
    for (const track of result.rows) {
      const types = Array.isArray(track.property_types) ? track.property_types : [];
      if (types.length === 0 || types.map(t => String(t).toLowerCase()).includes(type)) {
        return track;
      }
    }
    return result.rows[0];
  } catch (error) {
    logger.warn('Select tour music track error:', error.message);
    return null;
  }
};
