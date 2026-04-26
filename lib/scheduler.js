/**
 * scheduler.js
 * Handles scheduled execution of batch uploads using node-schedule
 */

const schedule = require('node-schedule');
const config = require('../config/config');
const BatchUpload = require('./batchUpload');

class Scheduler {
  constructor() {
    this.job = null;
    this.isRunning = false;
    this.lastRunTime = null;
    this.lastRunResult = null;
    this.totalRuns = 0;
  }

  /**
   * Start the scheduler
   * @param {Function} onJobComplete - Callback when job completes
   * @returns {void}
   */
  start(onJobComplete = null) {
    if (this.job) {
      console.log('⚠️ Scheduler already running');
      return;
    }

    const cronExpression = config.scheduler.interval;
    const timezone = config.scheduler.timezone;

    console.log(`📅 Scheduling batch uploads with cron: ${cronExpression} (${timezone})`);

    this.job = schedule.scheduleJob(
      { rule: cronExpression, tz: timezone },
      async () => {
        await this._executeJob(onJobComplete);
      }
    );

    console.log('✅ Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      console.log('✅ Scheduler stopped');
    } else {
      console.log('⚠️ Scheduler not running');
    }
  }

  /**
   * Execute a single scheduled job
   * @private
   */
  async _executeJob(onJobComplete) {
    if (this.isRunning) {
      console.log('⚠️ Previous job still running, skipping this cycle');
      return;
    }

    try {
      this.isRunning = true;
      this.totalRuns++;
      this.lastRunTime = new Date();

      console.log(`\n${'═'.repeat(50)}`);
      console.log(`⏱️ SCHEDULED JOB #${this.totalRuns} at ${this.lastRunTime.toLocaleString()}`);
      console.log('═'.repeat(50));

      const batchUpload = new BatchUpload();
      const result = await batchUpload.run();

      this.lastRunResult = result;

      console.log('\n📊 JOB SUMMARY:');
      console.log(`  Videos: ${result.videosUploaded}/${result.videosProcessed} uploaded`);
      console.log(`  Images: ${result.imagesUploaded}/${result.imagesProcessed} uploaded`);
      if (result.thumbnailsUploaded > 0) {
        console.log(`  Thumbnails: ${result.thumbnailsUploaded} attached`);
      }
      console.log(`  Success Rate: ${result.successRate}`);
      console.log(`  Failures: ${result.totalFailures}`);

      if (onJobComplete) {
        onJobComplete(result);
      }
    } catch (error) {
      console.error('\n❌ SCHEDULED JOB FAILED:', error.message);
      if (config.logging.debugMode) {
        console.error(error.stack);
      }
      this.lastRunResult = {
        error: error.message,
        timestamp: new Date()
      };
    } finally {
      this.isRunning = false;
      console.log(`${'═'.repeat(50)}\n`);
    }
  }

  /**
   * Run a job immediately (manual trigger)
   * @param {Object} options - Options for the batch upload
   * @returns {Promise<Object>} Job result
   */
  async runNow(options = {}) {
    console.log('⚡ Manual job trigger');
    const batchUpload = new BatchUpload();
    return await batchUpload.run(options);
  }

  /**
   * Get scheduler status
   * @returns {Object}
   */
  getStatus() {
    return {
      isScheduled: this.job !== null,
      isRunning: this.isRunning,
      schedule: config.scheduler.interval,
      timezone: config.scheduler.timezone,
      totalRuns: this.totalRuns,
      lastRunTime: this.lastRunTime,
      lastRunResult: this.lastRunResult,
      nextRunTime: this.job?.nextInvocation()?.toLocaleString() || 'N/A'
    };
  }

  /**
   * Get last run statistics
   * @returns {Object|null}
   */
  getLastResult() {
    return this.lastRunResult;
  }
}

module.exports = Scheduler;
