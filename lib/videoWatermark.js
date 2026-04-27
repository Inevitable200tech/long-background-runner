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
      'center-center': `x=(w-text_w)/2:y=(h-text_h)/2`,
      'center': `x=(w-text_w)/2:y=(h-text_h)/2`,
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

      // Force 16:9 aspect ratio with scale filter, then apply watermark
      ffmpeg(inputPath)
        .videoFilters([
          // Scale to 16:9 (1280x720) maintaining aspect, pad if needed
          `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2`,
          drawtextFilter
        ])
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
   * Generate preview/thumbnail from video
   * @param {string} inputPath - Path to input video file
   * @param {string} outputPath - Path to output preview image
   * @param {number} timestamp - Timestamp in seconds to capture frame (default: 1)
   * @returns {Promise<string>} Path to preview image
   */
  async generatePreview(inputPath, outputPath, timestamp = 1) {
    return new Promise((resolve, reject) => {
      console.log(`🖼️ Generating preview from video: ${path.basename(inputPath)}`);

      ffmpeg(inputPath)
        .screenshots({
          timestamps: [timestamp],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '640x360' // Preview size
        })
        .on('start', (commandLine) => {
          if (config.logging.debugMode) {
            console.log(`🔧 FFmpeg preview command: ${commandLine}`);
          }
        })
        .on('end', () => {
          console.log(`✅ Preview generated successfully`);
          resolve(outputPath);
        })
        .on('error', (error) => {
          console.error(`❌ Preview generation failed:`, error.message);
          reject(error);
        });
    });
  }

  /**
   * Generate multiple frames from video at random intervals
   * @param {string} inputPath - Path to input video file
   * @param {string} outputPattern - Path pattern for output images
   * @param {number} count - Number of frames to extract
   * @returns {Promise<string[]>} Paths to generated images
   */
  async generateMultipleFrames(inputPath, outputPattern, count = 5) {
    try {
      const videoInfo = await this.getVideoInfo(inputPath);
      const duration = videoInfo.format.duration || 0;
      if (duration === 0) throw new Error('Could not determine video duration');

      // Generate random timestamps (avoiding the very beginning and end)
      const timestamps = [];
      for (let i = 0; i < count; i++) {
        // Random between 5% and 95% of duration
        const ts = (Math.random() * 0.9 + 0.05) * duration;
        timestamps.push(ts.toFixed(2));
      }

      // Sort timestamps to optimize FFmpeg seeking
      timestamps.sort((a, b) => parseFloat(a) - parseFloat(b));

      console.log(`🖼️ Extracting ${count} random frames from video: ${path.basename(inputPath)}`);

      return new Promise((resolve, reject) => {
        const generatedFiles = [];
        const fileNameNoExt = path.parse(outputPattern).name;
        const folder = path.dirname(outputPattern);

        ffmpeg(inputPath)
          .on('start', (commandLine) => {
            if (config.logging.debugMode) {
              console.log(`🔧 FFmpeg multiple frames command: ${commandLine}`);
            }
          })
          .on('filenames', (filenames) => {
            // Clean names to just the basename
            filenames.forEach(f => generatedFiles.push(path.join(folder, f)));
          })
          .on('end', () => {
            console.log(`✅ ${count} frames generated successfully`);
            resolve(generatedFiles);
          })
          .on('error', (error) => {
            console.error(`❌ Frame extraction failed:`, error.message);
            reject(error);
          })
          .screenshots({
            count: count,
            timestamps: timestamps,
            filename: `${fileNameNoExt}_%i.jpg`,
            folder: folder,
            size: '1280x720' // Full size for images
          });
      });
    } catch (error) {
      console.error(`❌ Multiple frame extraction failed:`, error.message);
      throw error;
    }
  }

  /**
   * Generate preview from video file
   * @param {Object} file - File object from linked-lister
   * @param {string} sourceFilePath - Path to source video file
   * @param {number} timestamp - Timestamp in seconds to capture frame
   * @returns {Promise<Object>} { success: bool, previewPath: string, error: string }
   */
  async processPreview(file, sourceFilePath, timestamp = 1) {
    try {
      if (!fs.existsSync(sourceFilePath)) {
        throw new Error(`Source file not found: ${sourceFilePath}`);
      }

      // Get video duration to validate timestamp
      const videoInfo = await this.getVideoInfo(sourceFilePath);
      const duration = videoInfo.format.duration || 0;

      // Adjust timestamp if video is shorter than requested
      const actualTimestamp = Math.min(timestamp, duration * 0.1); // Use 10% of video or timestamp, whichever is smaller

      // Generate output path
      const fileName = path.basename(file.filename);
      const fileNameNoExt = path.parse(fileName).name;
      const previewFileName = `${fileNameNoExt}_preview.jpg`;
      const previewPath = path.join(this.tempDir, previewFileName);

      // Generate preview
      const result = await this.generatePreview(sourceFilePath, previewPath, actualTimestamp);

      return {
        success: true,
        previewPath: result,
        originalPath: sourceFilePath,
        fileName: previewFileName
      };
    } catch (error) {
      console.error(`❌ Preview generation failed for ${file.filename}:`, error.message);
      return {
        success: false,
        error: error.message,
        file: file.filename
      };
    }
  }

  /**
   * Process multiple frames from a video file
   * @param {Object} file - File object
   * @param {string} sourceFilePath - Path to source video
   * @param {number} count - Number of frames
   */
  async processMultipleFrames(file, sourceFilePath, count = 5) {
    try {
      const fileNameNoExt = path.parse(file.filename).name;
      const outputPattern = path.join(this.tempDir, `${fileNameNoExt}_frame`);

      const framePaths = await this.generateMultipleFrames(sourceFilePath, outputPattern, count);

      return {
        success: true,
        framePaths: framePaths,
        originalFileName: file.filename
      };
    } catch (error) {
      console.error(`❌ Multiple frame extraction failed:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
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
