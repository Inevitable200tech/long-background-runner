/**
 * hotpicAdapter.js
 * Handles uploads to HotPic endpoint
 * Adapted from Auto Uploader with metadata support
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const config = require('../config/config');

class HotpicAdapter {
  constructor() {
    this.endpoint = config.hotpic.endpoint;
    this.visitorId = config.hotpic.visitorId;
    this.uploadedUrls = []; // Track all uploaded URLs

    // Ensure logs directory exists
    if (!fs.existsSync(config.processing.tempDir)) {
      fs.mkdirSync(config.processing.tempDir, { recursive: true });
    }
  }

  /**
   * Add uploaded URL to tracking list
   * @param {string} urllink - The urllink from HotPic response
   */
  addUploadedUrl(urllink) {
    const fullUrl = `https://hotpic.me/${urllink}`;
    this.uploadedUrls.push(fullUrl);
    console.log(`🔗 Added to upload list: ${fullUrl}`);
  }

  /**
   * Print all uploaded URLs in formatted list
   */
  printUploadedUrls() {
    if (this.uploadedUrls.length === 0) {
      console.log(`\n📋 No uploads this session yet.\n`);
      return;
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`📋 UPLOADED LINKS (${this.uploadedUrls.length} total)`);
    console.log('='.repeat(50));
    this.uploadedUrls.forEach((url, index) => {
      console.log(`${index + 1}. ${url}`);
    });
    console.log('='.repeat(50) + '\n');
  }

  /**
   * Get all uploaded URLs
   * @returns {Array<string>} Array of uploaded URLs
   */
  getUploadedUrls() {
    return this.uploadedUrls;
  }

  /**
   * Clear uploaded URLs list
   */
  clearUploadedUrls() {
    this.uploadedUrls = [];
  }

  /**
   * Upload single file to HotPic
   * @param {string} filePath - Path to file to upload
   * @param {Object} metadata - File metadata
   * @returns {Promise<Object>} { success: bool, url: string, error: string }
   */
  async uploadFile(filePath, metadata = {}) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileName = path.basename(filePath);
      const fileSize = fs.statSync(filePath).size;

      // Log file info
      console.log(`📤 Uploading to HotPic: ${fileName} (${this._formatSize(fileSize)})`);

      const form = new FormData();

      // Clean the title by removing the requested phrase
      let cleanTitle = metadata.title || fileName;
      cleanTitle = cleanTitle.replace(/ -? Desi new videoz hd \/ sd - DropMMS Unblock|DropMMS Unblock/gi, '').trim();

      // Standard HotPic form fields
      form.append('album', cleanTitle);
      form.append('title', cleanTitle);
      form.append('desc', metadata.description || config.hotpic.description);
      form.append('private', config.hotpic.private);
      form.append('safe', config.hotpic.safe);
      form.append('orientation', config.hotpic.orientation);
      form.append('autoDelete', config.hotpic.autoDelete);
      form.append('deleteDateTime', Math.floor(Date.now() / 1000) + config.hotpic.autoDeleteTime);
      form.append('visitorid', crypto.randomBytes(16).toString('hex'));

      // Append file last
      form.append('file[0]', fs.createReadStream(filePath));

      // Make request with SSL bypass
      const response = await axios.post(this.endpoint, form, {
        headers: {
          ...form.getHeaders(),
          'Origin': config.hotpic.origin,
          'Referer': config.hotpic.referer,
          'User-Agent': config.hotpic.userAgent
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000 // 2 minute timeout for large files
      });

      if (config.logging.debugMode) {
        console.log('📋 HotPic Response:', JSON.stringify(response.data, null, 2));
      }

      // Check for success in response
      if (response.data && response.data.urllink) {
        const publicUrl = `https://hotpic.me/${response.data.urllink}`;
        console.log(`✅ Upload successful: ${publicUrl}`);

        return {
          success: true,
          url: publicUrl,
          urllink: response.data.urllink,
          fileName: fileName,
          fileSize: fileSize,
          type: metadata.type || 'file'
        };
      } else {
        throw new Error('No URL in HotPic response');
      }
    } catch (error) {
      console.error(`❌ HotPic upload failed for ${path.basename(filePath)}:`, error.message);
      return {
        success: false,
        error: error.message,
        fileName: path.basename(filePath)
      };
    }
  }

  /**
   * Upload image with optional thumbnail
   * @param {Object} file - File object from linked-lister
   * @param {string} imagePath - Path to image file
   * @param {string} thumbnailPath - Path to thumbnail file (optional)
   * @returns {Promise<Object>} { success: bool, imageUrl: string, thumbnailUrl: string, error: string }
   */
  async uploadImageWithThumbnail(file, imagePath, thumbnailPath = null) {
    try {
      console.log(`🖼️ Uploading image: ${file.filename}`);

      // Upload main image
      const imageResult = await this.uploadFile(imagePath, {
        title: file.title || file.filename,
        description: `Image [Hash: ${file.hash}] - Uploaded via WatermarkedUploader`,
        type: 'image'
      });

      if (!imageResult.success) {
        throw new Error(`Image upload failed: ${imageResult.error}`);
      }

      let thumbnailResult = null;

      // Upload thumbnail if provided
      if (thumbnailPath) {
        try {
          const thumbFileName = path.basename(thumbnailPath);
          thumbnailResult = await this.uploadFile(thumbnailPath, {
            title: `Thumb: ${file.title || file.filename}`,
            description: `Thumbnail [Hash: ${file.hash}] - Uploaded via WatermarkedUploader`,
            type: 'thumbnail'
          });

          if (thumbnailResult.success) {
            console.log(`✅ Thumbnail uploaded: ${thumbnailResult.url}`);
          } else {
            console.warn(`⚠️ Thumbnail upload failed: ${thumbnailResult.error}`);
          }
        } catch (error) {
          console.warn(`⚠️ Thumbnail upload error: ${error.message}`);
        }
      }

      return {
        success: true,
        fileType: 'image',
        hash: file.hash,
        filename: file.filename,
        imageUrl: imageResult.url,
        thumbnailUrl: thumbnailResult?.success ? thumbnailResult.url : null,
        results: {
          image: imageResult,
          thumbnail: thumbnailResult
        }
      };
    } catch (error) {
      console.error(`❌ Image upload pipeline failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        filename: file.filename
      };
    }
  }

  /**
   * Upload video with watermark
   * @param {Object} file - File object from linked-lister
   * @param {string} videoPath - Path to watermarked video file
   * @returns {Promise<Object>} { success: bool, url: string, error: string }
   */
  async uploadVideo(file, videoPath) {
    try {
      console.log(`🎬 Uploading watermarked video: ${file.filename}`);

      const result = await this.uploadFile(videoPath, {
        title: file.title || file.filename,
        description: `Video [Hash: ${file.hash}] - Watermarked via WatermarkedUploader`,
        type: 'video'
      });

      if (result.success) {
        return {
          success: true,
          fileType: 'video',
          hash: file.hash,
          filename: file.filename,
          url: result.url,
          result: result
        };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`❌ Video upload failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        filename: file.filename
      };
    }
  }

  /**
   * Log upload to history (MongoDB + file)
   * @param {Object} uploadData - Upload result data
   */
  logUpload(uploadData) {
    const historyService = require('./historyService');
    historyService.logUpload(uploadData);
  }

  /**
   * Log error to error log (MongoDB + file)
   * @param {Object} errorData - Error data
   */
  logError(errorData) {
    const historyService = require('./historyService');
    historyService.logError(errorData);
  }

  /**
   * Format file size for display
   * @private
   */
  _formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Get HotPic configuration
   */
  getConfig() {
    return {
      endpoint: this.endpoint,
      visitorId: this.visitorId
    };
  }
}

module.exports = HotpicAdapter;
