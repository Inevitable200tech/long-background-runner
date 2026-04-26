/**
 * linkedListerFilter.js
 * Filters files from linked-lister API
 * Separates videos from images, checks for duplicates
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class LinkedListerFilter {
  constructor() {
    this.videoExts = new Set(config.processing.supportedVideoExts.map(e => e.toLowerCase()));
    this.imageExts = new Set(config.processing.supportedImageExts.map(e => e.toLowerCase()));
    this.uploadedHashes = this._loadUploadHistory();
  }

  /**
   * Load previously uploaded file hashes from history
   * @private
   */
  _loadUploadHistory() {
    const hashes = new Set();

    if (fs.existsSync(config.logging.historyFile)) {
      try {
        const content = fs.readFileSync(config.logging.historyFile, 'utf-8');
        const lines = content.split('\n');

        lines.forEach(line => {
          // Parse: [TIMESTAMP] {type} {filename} -> HotPic URL: {url}
          const hashMatch = line.match(/\[hash:\s*([a-f0-9]+)\]/i);
          if (hashMatch) {
            hashes.add(hashMatch[1]);
          }
        });

        console.log(`📚 Loaded ${hashes.size} previously uploaded file hashes`);
      } catch (error) {
        console.warn('⚠️ Could not load upload history:', error.message);
      }
    }

    return hashes;
  }

  /**
   * Separate files into videos and images
   * @param {Array} files - Array of file objects from linked-lister
   * @returns {Object} { videos: [], images: [] }
   */
  filterByType(files) {
    const videos = [];
    const images = [];
    const skipped = [];

    files.forEach(file => {
      if (!file || !file.filename) {
        skipped.push({ file, reason: 'Missing filename' });
        return;
      }

      const ext = path.extname(file.filename).toLowerCase();

      if (this.videoExts.has(ext)) {
        videos.push(file);
      } else if (this.imageExts.has(ext)) {
        images.push(file);
      } else {
        skipped.push({ file, reason: `Unsupported extension: ${ext}` });
      }
    });

    if (config.logging.verbose) {
      console.log(`📊 Filter results: ${videos.length} videos, ${images.length} images, ${skipped.length} skipped`);
      skipped.forEach(({ file, reason }) => {
        console.log(`  ⏭️ Skipped ${file.filename}: ${reason}`);
      });
    }

    return { videos, images };
  }

  /**
   * Remove duplicates (already uploaded files)
   * @param {Array} files - Array of file objects
   * @returns {Array} Filtered array without duplicates
   */
  removeDuplicates(files) {
    if (!config.features.deduplicateByHash) {
      return files;
    }

    const filtered = files.filter(file => {
      if (this.uploadedHashes.has(file.hash)) {
        if (config.logging.verbose) {
          console.log(`⏭️ Skipping duplicate (already uploaded): ${file.filename} [${file.hash}]`);
        }
        return false;
      }
      return true;
    });

    if (config.logging.verbose) {
      const duplicateCount = files.length - filtered.length;
      if (duplicateCount > 0) {
        console.log(`🔄 Removed ${duplicateCount} duplicate(s)`);
      }
    }

    return filtered;
  }

  /**
   * Filter files by type (video, image, or both)
   * @param {Array} files - Array of file objects
   * @param {string} type - 'video', 'image', or 'both'
   * @returns {Array} Filtered files
   */
  filterByFileType(files, type = 'both') {
    if (type === 'both') {
      return files;
    }

    return files.filter(file => {
      const ext = path.extname(file.filename).toLowerCase();
      if (type === 'video') {
        return this.videoExts.has(ext);
      } else if (type === 'image') {
        return this.imageExts.has(ext);
      }
      return true;
    });
  }

  /**
   * Filter files by date range
   * @param {Array} files - Array of file objects
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date (optional, defaults to now)
   * @returns {Array} Filtered files
   */
  filterByDateRange(files, startDate, endDate = new Date()) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    return files.filter(file => {
      if (!file.created_at) return false;
      const fileTime = new Date(file.created_at).getTime();
      return fileTime >= start && fileTime <= end;
    });
  }

  /**
   * Filter files by size range
   * @param {Array} files - Array of file objects
   * @param {number} minBytes - Minimum file size
   * @param {number} maxBytes - Maximum file size (optional)
   * @returns {Array} Filtered files
   */
  filterBySize(files, minBytes = 0, maxBytes = Infinity) {
    return files.filter(file => {
      if (!file.size) return false;
      return file.size >= minBytes && file.size <= maxBytes;
    });
  }

  /**
   * Main filtering pipeline
   * @param {Array} files - Array of file objects from linked-lister
   * @param {Object} options - Filtering options
   * @returns {Object} { videos: [], images: [] }
   */
  filterFiles(files, options = {}) {
    let filtered = files;

    // Remove duplicates first
    if (config.features.deduplicateByHash) {
      filtered = this.removeDuplicates(filtered);
    }

    // Filter by date range if provided
    if (options.startDate) {
      filtered = this.filterByDateRange(filtered, options.startDate, options.endDate);
    }

    // Filter by size if provided
    if (options.minSize || options.maxSize) {
      filtered = this.filterBySize(
        filtered,
        options.minSize || 0,
        options.maxSize || Infinity
      );
    }

    // Separate by type
    const { videos, images } = this.filterByType(filtered);

    // Filter by specific type if requested
    const fileType = options.type || 'both';
    const result = {
      videos: fileType === 'video' || fileType === 'both' ? videos : [],
      images: fileType === 'image' || fileType === 'both' ? images : []
    };

    console.log(`✅ Filtering complete: ${result.videos.length} videos, ${result.images.length} images ready to upload`);

    return result;
  }

  /**
   * Mark file as uploaded (add hash to history)
   * @param {string} hash - SHA256 hash of file
   */
  markAsUploaded(hash) {
    this.uploadedHashes.add(hash);
  }

  /**
   * Check if file was already uploaded
   * @param {string} hash - SHA256 hash of file
   * @returns {boolean}
   */
  isAlreadyUploaded(hash) {
    return this.uploadedHashes.has(hash);
  }
}

module.exports = LinkedListerFilter;
