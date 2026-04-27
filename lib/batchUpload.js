/**
 * batchUpload.js
 * Orchestrates the entire upload pipeline:
 * fetch -> filter -> watermark/process -> upload -> log
 */

const LinkedListerClient = require('./linkedListerClient');
const LinkedListerFilter = require('./linkedListerFilter');
const VideoWatermark = require('./videoWatermark');
const ImageThumbnail = require('./imageThumbnail');
const HotpicAdapter = require('./hotpicAdapter');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class BatchUpload {
  constructor() {
    this.client = new LinkedListerClient();
    this.filter = new LinkedListerFilter();
    this.videoWatermark = new VideoWatermark();
    this.imageThumbnail = new ImageThumbnail();
    this.hotpic = new HotpicAdapter();

    this.stats = {
      videosProcessed: 0,
      videosUploaded: 0,
      imageProcessed: 0,
      imagesUploaded: 0,
      thumbnailsUploaded: 0,
      totalFailures: 0
    };
  }

  /**
   * Main entry point for batch upload pipeline
   * @param {Object} options - Options for filtering and processing
   * @returns {Promise<Object>} Summary of uploads
   */
  async run(options = {}) {
    try {
      console.log('\n========================================');
      console.log('🚀 BATCH UPLOAD PIPELINE STARTED');
      console.log('========================================\n');

      // Step 1: Authenticate with linked-lister
      await this.client.authenticate();

      // Step 2: Fetch files
      const files = await this._fetchFiles(options);
      if (files.length === 0) {
        console.log('⚠️ No files to process');
        return this._getSummary();
      }

      // Step 3: Filter files
      const filtered = this.filter.filterFiles(files, options);

      // --- USER REQUEST: PROCESS ONLY ONE RANDOM VIDEO ---
      if (filtered.videos.length > 0) {
        const randomIndex = Math.floor(Math.random() * filtered.videos.length);
        console.log(`🎲 Selecting 1 random video out of ${filtered.videos.length} available.`);
        filtered.videos = [filtered.videos[randomIndex]];
      }
      filtered.images = []; // Ignore images for now as requested

      // Step 4: Process videos
      if (config.features.uploadVideos && filtered.videos.length > 0) {
        await this._processVideos(filtered.videos);
      }

      // Step 5: Process images
      if (config.features.uploadImages && filtered.images.length > 0) {
        await this._processImages(filtered.images);
      }

      console.log('\n========================================');
      console.log('✅ BATCH UPLOAD PIPELINE COMPLETED');
      console.log('========================================\n');

      return this._getSummary();
    } catch (error) {
      console.error('\n❌ BATCH UPLOAD PIPELINE FAILED:', error.message);
      throw error;
    }
  }

  /**
   * Fetch files from linked-lister
   * @private
   */
  async _fetchFiles(options) {
    try {
      if (options.hashes && Array.isArray(options.hashes)) {
        console.log(`📥 Fetching ${options.hashes.length} files by hash`);
        return await this.client.fetchFilesByHashes(options.hashes);
      }

      if (options.startDate || options.endDate) {
        console.log(`📥 Fetching files from ${options.startDate} to ${options.endDate}`);
        return await this.client.fetchFilesSinceTimestamp(options.startDate);
      }

      console.log('📥 Fetching all distributed files');
      return await this.client.fetchDistributedFiles({ limit: options.limit || 100 });
    } catch (error) {
      console.error('❌ Failed to fetch files:', error.message);
      throw error;
    }
  }

  /**
   * Process and upload videos
   * @private
   */
  async _processVideos(videos) {
    console.log(`\n🎬 PROCESSING ${videos.length} VIDEO(S)`);
    console.log('─'.repeat(40));

    for (const file of videos) {
      try {
        this.stats.videosProcessed++;
        console.log(`\n[${this.stats.videosProcessed}/${videos.length}] Processing: ${file.filename}`);

        // Download video from linked-lister
        const tempVideoPath = path.join(config.processing.tempDir, `temp_${file.hash}.tmp`);
        await this.client.downloadFile(file.hash, tempVideoPath);

        // Validate video
        const isValid = await this.videoWatermark.validateVideo(tempVideoPath);
        if (!isValid) {
          throw new Error('Video validation failed');
        }

        // Generate preview thumbnail from video (for user to view)
        let previewPath = null;
        if (config.features.attachThumbnails) {
          const previewResult = await this.videoWatermark.processPreview(file, tempVideoPath);
          if (previewResult.success) {
            previewPath = previewResult.previewPath;
            console.log(`🖼️ Preview generated: ${previewResult.fileName}`);
            console.log(`   📂 Preview saved to: ${previewPath}`);
          }
        }

        // Apply watermark
        if (config.features.watermarkVideos) {
          const watermarkResult = await this.videoWatermark.processVideo(file, tempVideoPath);
          if (!watermarkResult.success) {
            throw new Error(watermarkResult.error);
          }

          // Move watermarked video to uploads folder for user to preview
          const uploadsPath = path.join('./uploads', path.basename(watermarkResult.watermarkedPath));
          fs.renameSync(watermarkResult.watermarkedPath, uploadsPath);
          console.log(`📂 Watermarked video saved to: ${uploadsPath}`);

          // Upload watermarked video
          const uploadResult = await this.hotpic.uploadVideo(file, uploadsPath);

          if (uploadResult.success) {
            this.stats.videosUploaded++;
            this.hotpic.logUpload(uploadResult);
            this.filter.markAsUploaded(file.hash);
            console.log(`✅ Video uploaded successfully`);
            
            // Keep watermarked video in uploads for 3 minutes, then cleanup
            const cleanupDelay = 3 * 60 * 1000; // 3 minutes
            console.log(`⏳ Will cleanup watermarked video in 3 minutes...`);
            setTimeout(() => {
              if (fs.existsSync(uploadsPath)) {
                fs.unlinkSync(uploadsPath);
                console.log(`🗑️ Cleaned up: ${path.basename(uploadsPath)}`);
              }
            }, cleanupDelay);
          } else {
            throw new Error(uploadResult.error);
          }
        } else {
          // Upload without watermark if feature disabled
          const uploadResult = await this.hotpic.uploadVideo(file, tempVideoPath);
          if (uploadResult.success) {
            this.stats.videosUploaded++;
            this.hotpic.logUpload(uploadResult);
            this.filter.markAsUploaded(file.hash);
          } else {
            throw new Error(uploadResult.error);
          }
        }

        // Keep preview for user to view (don't upload, don't cleanup yet)
        if (previewPath && fs.existsSync(previewPath)) {
          // Move preview to uploads folder for easy access
          const finalPreviewPath = path.join('./uploads', path.basename(previewPath));
          fs.renameSync(previewPath, finalPreviewPath);
          console.log(`📸 Preview available at: ${finalPreviewPath}`);
          this.stats.thumbnailsUploaded++;
          
          // Keep preview in uploads for 3 minutes, then cleanup
          const cleanupDelay = 3 * 60 * 1000; // 3 minutes
          setTimeout(() => {
            if (fs.existsSync(finalPreviewPath)) {
              fs.unlinkSync(finalPreviewPath);
              console.log(`🗑️ Cleaned up preview: ${path.basename(finalPreviewPath)}`);
            }
          }, cleanupDelay);
        }

        // Cleanup original temp download
        this.videoWatermark.cleanupTemp(tempVideoPath);
      } catch (error) {
        console.error(`❌ Video processing failed: ${error.message}`);
        this.stats.totalFailures++;
        this.hotpic.logError({
          filename: file.filename,
          error: error.message
        });
      }
    }

    console.log(`\n✅ Videos: ${this.stats.videosUploaded}/${this.stats.videosProcessed} uploaded`);
  }

  /**
   * Process and upload images with thumbnails
   * @private
   */
  async _processImages(images) {
    console.log(`\n🖼️ PROCESSING ${images.length} IMAGE(S)`);
    console.log('─'.repeat(40));

    for (const file of images) {
      try {
        this.stats.imageProcessed++;
        console.log(`\n[${this.stats.imageProcessed}/${images.length}] Processing: ${file.filename}`);

        // Download image from linked-lister
        const tempImagePath = path.join(config.processing.tempDir, `temp_${file.hash}.tmp`);
        await this.client.downloadFile(file.hash, tempImagePath);

        // Validate image
        if (!this.imageThumbnail.validateImage(tempImagePath)) {
          throw new Error('Image validation failed');
        }

        // Process image and thumbnail
        let thumbnailPath = null;
        if (config.features.attachThumbnails) {
          const thumbResult = await this.imageThumbnail.processImage(file, tempImagePath);
          if (!thumbResult.success) {
            console.warn(`⚠️ Thumbnail processing warning: ${thumbResult.error}`);
          } else {
            thumbnailPath = thumbResult.thumbnailPath;
          }
        }

        // Upload image with thumbnail
        const uploadResult = await this.hotpic.uploadImageWithThumbnail(
          file,
          tempImagePath,
          thumbnailPath
        );

        if (uploadResult.success) {
          this.stats.imagesUploaded++;
          if (thumbnailPath) {
            this.stats.thumbnailsUploaded++;
          }
          this.hotpic.logUpload(uploadResult);
          this.filter.markAsUploaded(file.hash);
          console.log(`✅ Image uploaded successfully`);
        } else {
          throw new Error(uploadResult.error);
        }

        // Cleanup temp files
        this.imageThumbnail.cleanupTemp([tempImagePath, thumbnailPath]);
      } catch (error) {
        console.error(`❌ Image processing failed: ${error.message}`);
        this.stats.totalFailures++;
        this.hotpic.logError({
          filename: file.filename,
          error: error.message
        });
      }
    }

    console.log(`\n✅ Images: ${this.stats.imagesUploaded}/${this.stats.imageProcessed} uploaded`);
    if (this.stats.thumbnailsUploaded > 0) {
      console.log(`   Thumbnails: ${this.stats.thumbnailsUploaded} attached`);
    }
  }

  /**
   * Get summary of batch operation
   * @private
   */
  _getSummary() {
    return {
      videosProcessed: this.stats.videosProcessed,
      videosUploaded: this.stats.videosUploaded,
      imagesProcessed: this.stats.imageProcessed,
      imagesUploaded: this.stats.imagesUploaded,
      thumbnailsUploaded: this.stats.thumbnailsUploaded,
      totalFailures: this.stats.totalFailures,
      successRate: (
        (this.stats.videosUploaded + this.stats.imagesUploaded) /
        (this.stats.videosProcessed + this.stats.imageProcessed) * 100
      ).toFixed(1) + '%'
    };
  }

  /**
   * Get current statistics
   */
  getStats() {
    return this.stats;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      videosProcessed: 0,
      videosUploaded: 0,
      imageProcessed: 0,
      imagesUploaded: 0,
      thumbnailsUploaded: 0,
      totalFailures: 0
    };
  }
}

module.exports = BatchUpload;
