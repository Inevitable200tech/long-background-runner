/**
 * videoWatermark.js
 * Applies text watermark to video files using FFmpeg
 */

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class VideoWatermark {
  constructor() {
    // Set FFmpeg paths if configured
    if (config.processing.ffmpegPath) {
      ffmpeg.setFfmpegPath(config.processing.ffmpegPath);
    }
    if (config.processing.ffprobePath) {
      ffmpeg.setFfprobePath(config.processing.ffprobePath);
    }

    this.watermarkText = config.watermark.videoText;
    this.tempDir = config.processing.tempDir;

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Generate drawtext filter string for FFmpeg
   * @private
   */
  _generateDrawtextFilter() {
    // Escape special characters for FFmpeg
    const text = this.watermarkText
      .replace(/:/g, '\\:')
      .replace(/'/g, "'\\''");

    // Construct drawtext filter
    let filterString = `drawtext=`;
    filterString += `text='${text}':`;
    filterString += `fontsize=${config.watermark.fontSize}:`;
    filterString += `fontcolor=${config.watermark.textColor}:`;
    filterString += `alpha=${config.watermark.alpha}:`;

    // Position mapping
    const positionMap = {
      'bottom-center': `x=(w-text_w)/2:y=h-${config.watermark.margin}-text_h`,
      'top-center': `x=(w-text_w)/2:y=${config.watermark.margin}`,
      'bottom-left': `x=${config.watermark.margin}:y=h-${config.watermark.margin}-text_h`,
      'bottom-right': `x=w-${config.watermark.margin}-text_w:y=h-${config.watermark.margin}-text_h`,
      'top-left': `x=${config.watermark.margin}:y=${config.watermark.margin}`,
      'top-right': `x=w-${config.watermark.margin}-text_w:y=${config.watermark.margin}`
    };

    const position = positionMap[config.watermark.position] || positionMap['bottom-center'];
    filterString += position;

    // Add box if configured
    if (config.watermark.boxColor) {
      filterString += `:box=1:boxcolor=${config.watermark.boxColor}:boxborderw=${config.watermark.boxBorderw}`;
    }

    return filterString;
  }

  /**
   * Add watermark to video
   * @param {string} inputPath - Path to input video file
   * @param {string} outputPath - Path to output watermarked video
   * @returns {Promise<string>} Path to watermarked video
   */
  async watermarkVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      console.log(`🎬 Adding watermark to video: ${path.basename(inputPath)}`);

      const drawtextFilter = this._generateDrawtextFilter();

      ffmpeg(inputPath)
        .videoFilter(drawtextFilter)
        .output(outputPath)
        .on('start', (commandLine) => {
          if (config.logging.debugMode) {
            console.log(`🔧 FFmpeg command: ${commandLine}`);
          }
        })
        .on('progress', (progress) => {
          if (config.logging.verbose) {
            console.log(`⏳ Processing: ${Math.round(progress.percent || 0)}%`);
          }
        })
        .on('end', () => {
          console.log(`✅ Watermark applied successfully`);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error(`❌ Watermarking failed:`, error.message);
          reject(error);
        })
        .run();
    });
  }

  /**
   * Process video file from source to watermarked output
   * @param {Object} file - File object from linked-lister
   * @param {string} sourceFilePath - Path to source video file
   * @returns {Promise<Object>} { success: bool, watermarkedPath: string, error: string }
   */
  async processVideo(file, sourceFilePath) {
    try {
      if (!fs.existsSync(sourceFilePath)) {
        throw new Error(`Source file not found: ${sourceFilePath}`);
      }

      // Generate output path
      const fileName = path.basename(file.filename);
      const fileNameNoExt = path.parse(fileName).name;
      const fileExt = path.extname(fileName);
      const watermarkedFileName = `${fileNameNoExt}_watermarked${fileExt}`;
      const watermarkedPath = path.join(this.tempDir, watermarkedFileName);

      // Check file size
      const stats = fs.statSync(sourceFilePath);
      if (stats.size > config.processing.maxVideoSize) {
        throw new Error(`Video too large: ${(stats.size / 1024 / 1024 / 1024).toFixed(2)}GB exceeds limit of ${(config.processing.maxVideoSize / 1024 / 1024 / 1024).toFixed(2)}GB`);
      }

      // Apply watermark
      const result = await this.watermarkVideo(sourceFilePath, watermarkedPath);

      return {
        success: true,
        watermarkedPath: result,
        originalPath: sourceFilePath,
        fileName: watermarkedFileName
      };
    } catch (error) {
      console.error(`❌ Video processing failed for ${file.filename}:`, error.message);
      return {
        success: false,
        error: error.message,
        file: file.filename
      };
    }
  }

  /**
   * Get video information
   * @param {string} filePath - Path to video file
   * @returns {Promise<Object>} Video metadata
   */
  async getVideoInfo(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (error, metadata) => {
        if (error) {
          reject(error);
        } else {
          resolve(metadata);
        }
      });
    });
  }

  /**
   * Validate video file
   * @param {string} filePath - Path to video file
   * @returns {Promise<boolean>}
   */
  async validateVideo(filePath) {
    try {
      const info = await this.getVideoInfo(filePath);
      return info && info.streams && info.streams.length > 0;
    } catch (error) {
      console.error(`❌ Video validation failed:`, error.message);
      return false;
    }
  }

  /**
   * Clean up temporary file
   * @param {string} filePath - Path to temp file
   */
  cleanupTemp(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Cleaned up temp file: ${path.basename(filePath)}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to cleanup temp file: ${error.message}`);
    }
  }

  /**
   * Get watermark settings
   */
  getSettings() {
    return {
      text: this.watermarkText,
      fontSize: config.watermark.fontSize,
      color: config.watermark.textColor,
      position: config.watermark.position,
      alpha: config.watermark.alpha
    };
  }
}

module.exports = VideoWatermark;
