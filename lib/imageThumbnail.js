/**
 * imageThumbnail.js
 * Handles downloading and managing image thumbnails from linked-lister
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class ImageThumbnail {
  constructor() {
    this.tempDir = config.processing.tempDir;

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Download image from URL
   * @param {string} imageUrl - URL to image
   * @param {string} outputPath - Path to save image
   * @returns {Promise<string>} Path to downloaded image
   */
  async downloadImage(imageUrl, outputPath) {
    try {
      console.log(`⬇️ Downloading image: ${imageUrl}`);

      const https = require('https');
      const response = await axios.get(imageUrl, {
        responseType: 'stream',
        timeout: 30000,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        })
      });

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const stream = response.data.pipe(fs.createWriteStream(outputPath));

      return new Promise((resolve, reject) => {
        stream.on('finish', () => {
          console.log(`✅ Image downloaded: ${path.basename(outputPath)}`);
          resolve(outputPath);
        });
        stream.on('error', reject);
      });
    } catch (error) {
      console.error(`❌ Failed to download image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process image and its thumbnail
   * @param {Object} file - File object from linked-lister
   * @param {string} imageFilePath - Path to image file
   * @returns {Promise<Object>} { success: bool, imagePath: string, thumbnailPath: string, error: string }
   */
  async processImage(file, imageFilePath) {
    try {
      if (!file.thumbnail_address) {
        console.warn(`⚠️ No thumbnail URL for ${file.filename}`);
        return {
          success: true,
          imagePath: imageFilePath,
          thumbnailPath: null,
          hasThumb: false
        };
      }

      if (!fs.existsSync(imageFilePath)) {
        throw new Error(`Source image file not found: ${imageFilePath}`);
      }

      // Generate thumbnail output path
      const fileName = path.basename(file.filename);
      const fileNameNoExt = path.parse(fileName).name;
      const fileExt = path.extname(fileName);
      const thumbnailFileName = `${fileNameNoExt}_thumb${fileExt}`;
      const thumbnailPath = path.join(this.tempDir, thumbnailFileName);

      // Download thumbnail
      const thumbUrl = file.thumbnail_address;
      // Ensure thumbnail URL is absolute
      const fullThumbUrl = thumbUrl.startsWith('http')
        ? thumbUrl
        : `${config.linkedLister.baseUrl}${thumbUrl}`;

      await this.downloadImage(fullThumbUrl, thumbnailPath);

      return {
        success: true,
        imagePath: imageFilePath,
        thumbnailPath: thumbnailPath,
        thumbnailFileName: thumbnailFileName,
        hasThumb: true
      };
    } catch (error) {
      console.error(`❌ Image processing failed for ${file.filename}:`, error.message);
      return {
        success: false,
        error: error.message,
        file: file.filename,
        imagePath: imageFilePath,
        hasThumb: false
      };
    }
  }

  /**
   * Validate image file
   * @param {string} filePath - Path to image file
   * @returns {boolean}
   */
  validateImage(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const stats = fs.statSync(filePath);
      if (stats.size > config.processing.maxImageSize) {
        console.warn(`⚠️ Image too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`❌ Image validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Clean up temporary files
   * @param {string|Array<string>} filePaths - Path(s) to temp files
   */
  cleanupTemp(filePaths) {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

    paths.forEach(filePath => {
      try {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Cleaned up temp file: ${path.basename(filePath)}`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to cleanup temp file: ${error.message}`);
      }
    });
  }

  /**
   * Generate thumbnail filename from original
   * @param {string} originalFileName - Original file name
   * @returns {string} Thumbnail filename with _thumb suffix
   */
  generateThumbnailFileName(originalFileName) {
    const fileNameNoExt = path.parse(originalFileName).name;
    const fileExt = path.extname(originalFileName);
    return `${fileNameNoExt}_thumb${fileExt}`;
  }

  /**
   * Get thumbnail URL from file object
   * @param {Object} file - File object from linked-lister
   * @returns {string|null} Thumbnail URL or null
   */
  getThumbnailUrl(file) {
    if (!file.thumbnail_address) {
      return null;
    }

    // Ensure absolute URL
    if (file.thumbnail_address.startsWith('http')) {
      return file.thumbnail_address;
    }

    return `${config.linkedLister.baseUrl}${file.thumbnail_address}`;
  }
}

module.exports = ImageThumbnail;
