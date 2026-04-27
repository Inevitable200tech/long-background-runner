/**
 * linkedListerClient.js
 * Handles communication with the linked-lister API
 * Provides methods to fetch videos and images
 */

const axios = require('axios');
const config = require('../config/config');

class LinkedListerClient {
  constructor() {
    this.baseUrl = config.linkedLister.baseUrl;
    this.token = config.linkedLister.apiToken;
    this.retryAttempts = config.linkedLister.retryAttempts;
    this.retryDelayMs = config.linkedLister.retryDelayMs;
    const https = require('https');
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // For self-signed certs
      })
    });
  }

  /**
   * Format error message handling Node.js AggregateErrors
   * @private
   */
  _formatError(error) {
    if (!error) return 'Unknown error';
    if (error.code === 'ECONNREFUSED') return `Connection refused to ${error.config?.url || this.baseUrl}. Is the linked-lister server running?`;
    return error.message || error.code || String(error);
  }

  /**
   * Authenticate with linked-lister and get JWT token
   */
  async authenticate() {
    try {
      if (this.token) {
        console.log('✅ Using provided API token for authentication');
        this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
        return this.token;
      }

      console.log('🔐 Authenticating with linked-lister via password...');
      const response = await this._retryRequest(() =>
        this.axiosInstance.post('/api/auth/login', {
          password: config.linkedLister.password
        })
      );

      if (response.data && response.data.token) {
        this.token = response.data.token;
        this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
        console.log('✅ Authentication successful');
        return this.token;
      } else {
        throw new Error('No token in response');
      }
    } catch (error) {
      console.error('❌ Authentication failed:', this._formatError(error));
      throw error;
    }
  }

  /**
   * Fetch all distributed files from linked-lister
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of file objects
   */
  async fetchDistributedFiles(options = {}) {
    try {
      const params = {
        status: 'distributed',
        limit: options.limit || 50,
        page: options.page || 1,
        ...options
      };

      console.log('📥 Fetching distributed files from linked-lister...');
      const response = await this._retryRequest(() =>
        this.axiosInstance.get('/api/public/files', { params })
      );

      if (response.data && Array.isArray(response.data)) {
        console.log(`✅ Fetched ${response.data.length} files`);
        return response.data;
      } else if (response.data && response.data.files) {
        console.log(`✅ Fetched ${response.data.files.length} files`);
        return response.data.files;
      }
      return [];
    } catch (error) {
      console.error('❌ Failed to fetch files:', this._formatError(error));
      throw error;
    }
  }

  /**
   * Fetch file by hash
   * @param {string} hash - SHA256 hash of file
   * @returns {Promise<Object>} File object
   */
  async fetchFileByHash(hash) {
    try {
      console.log(`📥 Fetching file by hash: ${hash}`);
      const response = await this._retryRequest(() =>
        this.axiosInstance.get(`/api/public/file/${hash}`)
      );

      if (response.data && response.data.file) {
        console.log(`✅ Fetched file: ${response.data.file.filename}`);
        const fileObj = response.data.file;
        if (response.data.download && response.data.download.url) {
          fileObj.downloadUrl = response.data.download.url;
        }
        return fileObj;
      } else if (response.data) {
        return response.data;
      }
      return null;
    } catch (error) {
      console.error(`❌ Failed to fetch file ${hash}:`, this._formatError(error));
      throw error;
    }
  }

  /**
   * Fetch files modified after a specific timestamp
   * @param {Date} timestamp - Timestamp to filter from
   * @returns {Promise<Array>} Array of file objects
   */
  async fetchFilesSinceTimestamp(timestamp) {
    try {
      const isoString = typeof timestamp === 'string' ? timestamp : timestamp.toISOString();
      console.log(`📥 Fetching files since ${isoString}...`);

      const response = await this._retryRequest(() =>
        this.axiosInstance.get('/api/public/files', {
          params: {
            status: 'distributed',
            createdAfter: isoString,
            limit: 100
          }
        })
      );

      if (response.data && Array.isArray(response.data)) {
        console.log(`✅ Fetched ${response.data.length} files since ${isoString}`);
        return response.data;
      } else if (response.data && response.data.files) {
        console.log(`✅ Fetched ${response.data.files.length} files`);
        return response.data.files;
      }
      return [];
    } catch (error) {
      console.error('❌ Failed to fetch files by timestamp:', this._formatError(error));
      throw error;
    }
  }

  /**
   * Fetch files by array of hashes
   * @param {Array<string>} hashes - Array of SHA256 hashes
   * @returns {Promise<Array>} Array of file objects
   */
  async fetchFilesByHashes(hashes) {
    if (!Array.isArray(hashes) || hashes.length === 0) {
      return [];
    }

    try {
      console.log(`📥 Fetching ${hashes.length} files by hash...`);
      const promises = hashes.map(hash => this.fetchFileByHash(hash).catch(() => null));
      const files = await Promise.all(promises);
      return files.filter(f => f !== null);
    } catch (error) {
      console.error('❌ Failed to fetch files by hashes:', this._formatError(error));
      throw error;
    }
  }

  /**
   * Get file details and signed download URL
   * @param {string} hash - SHA256 hash of file
   * @returns {Promise<Object>} File object with download URL
   */
  async getFileWithDownloadUrl(hash) {
    return this.fetchFileByHash(hash);
  }

  /**
   * Download file from linked-lister
   * @param {string} hash - SHA256 hash of file
   * @param {string} outputPath - Local path to save file
   * @returns {Promise<string>} Path to downloaded file
   */
  async downloadFile(hash, outputPath) {
    try {
      console.log(`⬇️ Downloading file ${hash} to ${outputPath}...`);

      // 1. Get file info to get the signed URL
      const fileInfo = await this.fetchFileByHash(hash);
      if (!fileInfo || !fileInfo.downloadUrl) {
        throw new Error('No download URL returned from API');
      }

      // 2. Check for blocked storage domains
      const blockedDomains = ['s3.eu-west-1.idrivee2.com'];
      const isBlocked = blockedDomains.some(domain => fileInfo.downloadUrl.includes(domain));
      if (isBlocked) {
        throw new Error(`Skipping file — hosted on blocked storage domain`);
      }

      // 3. Download from the signed URL
      if (config.logging.debugMode) {
        console.log(`🔧 Download URL: ${fileInfo.downloadUrl}`);
      }

      const response = await this._retryRequest(() =>
        axios.get(fileInfo.downloadUrl, {
          responseType: 'stream',
          timeout: 120000,
          httpsAgent: new (require('https')).Agent({ rejectUnauthorized: false })
        })
      );

      const fs = require('fs');
      const path = require('path');
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const stream = response.data.pipe(fs.createWriteStream(outputPath));

      return new Promise((resolve, reject) => {
        stream.on('finish', () => {
          console.log(`✅ File downloaded: ${outputPath}`);
          resolve(outputPath);
        });
        stream.on('error', reject);
      });
    } catch (error) {
      console.error(`❌ Failed to download file ${hash}:`, this._formatError(error));
      throw error;
    }
  }

  /**
   * Retry request with exponential backoff
   * @private
   */
  async _retryRequest(fn) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < this.retryAttempts) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          console.log(`⏳ Retry attempt ${attempt}/${this.retryAttempts} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get health status of linked-lister
   */
  async getStatus() {
    try {
      const response = await this.axiosInstance.get('/api/dashboard/status');
      return response.data;
    } catch (error) {
      console.error('❌ Failed to get status:', this._formatError(error));
      return null;
    }
  }
}

module.exports = LinkedListerClient;
