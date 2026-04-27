/**
 * historyService.js
 * Unified history service — stores to MongoDB only
 */

const config = require('../config/config');
const db = require('./db');

let UploadHistory;

/**
 * Get the UploadHistory model (lazy-loaded to avoid errors when MongoDB is not connected)
 */
function getModel() {
  if (!UploadHistory) {
    UploadHistory = require('./models/UploadHistory');
  }
  return UploadHistory;
}

/**
 * Log an upload to MongoDB
 * @param {Object} uploadData - Upload result data
 */
async function logUpload(uploadData) {
  if (db.connected()) {
    try {
      const Model = getModel();
      await Model.create({
        fileType: uploadData.fileType || 'file',
        filename: uploadData.filename,
        hash: uploadData.hash,
        url: uploadData.url || uploadData.imageUrl,
        imageUrl: uploadData.imageUrl,
        thumbnailUrl: uploadData.thumbnailUrl,
        success: uploadData.success !== false,
        error: uploadData.error
      });
      console.log('📝 History saved to MongoDB');
    } catch (error) {
      console.error('❌ Failed to save history to MongoDB:', error.message);
    }
  } else {
    console.warn('⚠️ MongoDB not connected — history not saved.');
  }
}

/**
 * Log an error to MongoDB
 * @param {Object} errorData - Error data
 */
async function logError(errorData) {
  if (db.connected()) {
    try {
      const Model = getModel();
      await Model.create({
        fileType: 'file',
        filename: errorData.filename,
        success: false,
        error: errorData.error
      });
    } catch (error) {
      console.error('❌ Failed to save error to MongoDB:', error.message);
    }
  }
}

/**
 * Get recent history entries
 * @param {number} limit - Max entries to return
 * @returns {Promise<Array>} History entries
 */
async function getHistory(limit = 50) {
  if (db.connected()) {
    try {
      const Model = getModel();
      return await Model.find({ success: true })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      console.error('❌ Failed to fetch history from MongoDB:', error.message);
    }
  }
  return [];
}

/**
 * Prune old history entries (older than maxAge)
 * MongoDB handles this via TTL index, but this can force it too
 * @param {number} maxAgeMs - Max age in milliseconds
 * @returns {Promise<number>} Number of pruned entries
 */
async function pruneHistory(maxAgeMs) {
  let pruned = 0;

  if (db.connected()) {
    try {
      const Model = getModel();
      const cutoff = new Date(Date.now() - maxAgeMs);
      const result = await Model.deleteMany({ createdAt: { $lt: cutoff } });
      if (result.deletedCount > 0) {
        console.log(`🗑️ Pruned ${result.deletedCount} old entries from MongoDB`);
        pruned = result.deletedCount;
      }
    } catch (error) {
      console.error('❌ Failed to prune MongoDB history:', error.message);
    }
  }

  return pruned;
}

/**
 * Print history to console
 * @param {number} limit - Max entries to print
 */
async function printHistory(limit = 50) {
  const entries = await getHistory(limit);

  if (!entries || entries.length === 0) {
    console.log('\n📜 No upload history.\n');
    return;
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📜 UPLOAD HISTORY (${entries.length} entries)`);
  console.log('='.repeat(50));

  entries.forEach((entry, i) => {
    const ts = new Date(entry.createdAt).toLocaleString();
    const type = (entry.fileType || 'FILE').toUpperCase();
    const url = entry.url || entry.imageUrl || 'N/A';
    console.log(`  ${i + 1}. [${ts}] ${type} ${entry.filename} -> ${url}`);
  });

  console.log('='.repeat(50) + '\n');
}

module.exports = { logUpload, logError, getHistory, pruneHistory, printHistory };
