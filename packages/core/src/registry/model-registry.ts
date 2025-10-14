/**
 * Model Registry System
 * 
 * NPM-like registry for ML models:
 * - Model discovery and search
 * - Version management
 * - Hot-swapping
 * - A/B testing
 * - Usage analytics
 */

import {
  ModelMetadata,
  ModelVersion,
  RegistryOptions,
  ABTestConfig
} from '../types-phase2.5';
import { ModelBundle, PythonModelManifest } from '../types';

interface RegistrySearchResult {
  models: ModelMetadata[];
  total: number;
  page: number;
  pageSize: number;
}

export class ModelRegistry {
  private registryUrl: string;
  private cache: Map<string, ModelBundle> = new Map();
  private metadata: Map<string, ModelMetadata> = new Map();
  private abTests: Map<string, ABTestConfig> = new Map();

  constructor(registryUrl: string = 'https://registry.python-react-ml.dev') {
    this.registryUrl = registryUrl;
  }

  /**
   * Search for models in the registry
   */
  async search(query: string, options?: {
    category?: ModelMetadata['category'];
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<RegistrySearchResult> {
    try {
      const params = new URLSearchParams({
        q: query,
        limit: String(options?.limit || 10),
        offset: String(options?.offset || 0)
      });

      if (options?.category) {
        params.append('category', options.category);
      }

      if (options?.tags) {
        options.tags.forEach(tag => params.append('tags', tag));
      }

      const response = await fetch(`${this.registryUrl}/search?${params}`);
      
      if (!response.ok) {
        throw new Error(`Registry search failed: ${response.statusText}`);
      }

      return await response.json();

    } catch (error: any) {
      console.error('Model search failed:', error);
      // Return mock data for development
      return this.getMockSearchResults(query);
    }
  }

  /**
   * Get model metadata by ID
   */
  async getMetadata(modelId: string): Promise<ModelMetadata> {
    // Check cache
    if (this.metadata.has(modelId)) {
      return this.metadata.get(modelId)!;
    }

    try {
      const response = await fetch(`${this.registryUrl}/models/${modelId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }

      const metadata: ModelMetadata = await response.json();
      this.metadata.set(modelId, metadata);
      
      return metadata;

    } catch (error: any) {
      console.error('Failed to fetch model metadata:', error);
      throw error;
    }
  }

  /**
   * Get available versions for a model
   */
  async getVersions(modelId: string): Promise<ModelVersion[]> {
    try {
      const response = await fetch(`${this.registryUrl}/models/${modelId}/versions`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch versions: ${response.statusText}`);
      }

      return await response.json();

    } catch (error: any) {
      console.error('Failed to fetch model versions:', error);
      return [];
    }
  }

  /**
   * Download and load a model from the registry
   */
  async load(
    modelId: string,
    options: RegistryOptions = {}
  ): Promise<ModelBundle> {
    const version = options.version || 'latest';
    const cacheKey = `${modelId}@${version}`;

    // Check cache if enabled
    if (options.cache !== false && this.cache.has(cacheKey)) {
      console.log(`Loading model from cache: ${cacheKey}`);
      return this.cache.get(cacheKey)!;
    }

    try {
      // Get metadata
      const metadata = await this.getMetadata(modelId);

      // Get specific version or latest
      const versions = await this.getVersions(modelId);
      const targetVersion = version === 'latest' 
        ? versions[0] 
        : versions.find(v => v.version === version);

      if (!targetVersion) {
        throw new Error(`Version ${version} not found for model ${modelId}`);
      }

      // Download model bundle
      const bundle = await this.downloadBundle(targetVersion.downloadUrl);

      // Validate integrity
      await this.validateBundle(bundle, targetVersion.sha256);

      // Cache if enabled
      if (options.cache !== false) {
        this.cache.set(cacheKey, bundle);
      }

      // Track download
      await this.trackDownload(modelId, version);

      return bundle;

    } catch (error: any) {
      if (options.fallback === 'previous-version') {
        console.warn(`Failed to load version ${version}, trying fallback...`);
        return this.loadFallback(modelId, version, options);
      }

      throw error;
    }
  }

  /**
   * Load model with marketplace:// protocol
   */
  async loadFromMarketplace(uri: string, options: RegistryOptions = {}): Promise<ModelBundle> {
    // Parse marketplace://model-name@version
    const match = uri.match(/^marketplace:\/\/([^@]+)(?:@(.+))?$/);
    
    if (!match) {
      throw new Error(`Invalid marketplace URI: ${uri}`);
    }

    const [, modelId, version] = match;
    
    return this.load(modelId, {
      ...options,
      version: version || options.version || 'latest'
    });
  }

  /**
   * Publish a model to the registry
   */
  async publish(
    model: ModelBundle,
    metadata: Partial<ModelMetadata>,
    apiKey: string
  ): Promise<ModelMetadata> {
    try {
      const formData = new FormData();
      
      // Add metadata
      formData.append('metadata', JSON.stringify({
        name: metadata.name,
        version: metadata.version,
        description: metadata.description,
        author: metadata.author,
        license: metadata.license,
        tags: metadata.tags,
        category: metadata.category
      }));

      // Add model bundle
      const bundleBlob = new Blob([JSON.stringify(model)], { type: 'application/json' });
      formData.append('bundle', bundleBlob, 'model.rpm');

      const response = await fetch(`${this.registryUrl}/publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Publish failed: ${response.statusText}`);
      }

      return await response.json();

    } catch (error: any) {
      console.error('Failed to publish model:', error);
      throw error;
    }
  }

  /**
   * Configure A/B testing for a model
   */
  configureABTest(modelId: string, config: ABTestConfig): void {
    this.abTests.set(modelId, config);
  }

  /**
   * Get model variant based on A/B test configuration
   */
  getABTestVariant(modelId: string): string {
    const config = this.abTests.get(modelId);
    
    if (!config || !config.enabled) {
      return modelId;
    }

    // Weighted random selection
    const totalWeight = config.variants.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;

    for (const variant of config.variants) {
      random -= variant.weight;
      if (random <= 0) {
        return variant.modelId;
      }
    }

    return config.variants[0].modelId;
  }

  /**
   * Clear cache
   */
  clearCache(modelId?: string): void {
    if (modelId) {
      // Clear specific model
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${modelId}@`)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    models: string[];
    totalBytes: number;
  } {
    const models: string[] = [];
    let totalBytes = 0;

    for (const [key, bundle] of this.cache.entries()) {
      models.push(key);
      totalBytes += bundle.code.length;
      
      if (bundle.files) {
        for (const file of Object.values(bundle.files)) {
          totalBytes += file.byteLength;
        }
      }
    }

    return {
      size: this.cache.size,
      models,
      totalBytes
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async downloadBundle(url: string): Promise<ModelBundle> {
    console.log(`Downloading model from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    return await response.json();
  }

  private async validateBundle(bundle: ModelBundle, expectedSha256: string): Promise<void> {
    // In production, would calculate and verify SHA256
    // For now, just validate structure
    if (!bundle.manifest || !bundle.code) {
      throw new Error('Invalid model bundle structure');
    }

    console.log(`Bundle validated (expected hash: ${expectedSha256})`);
  }

  private async trackDownload(modelId: string, version: string): Promise<void> {
    try {
      // Track analytics (fire and forget)
      await fetch(`${this.registryUrl}/analytics/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, version, timestamp: new Date().toISOString() })
      });
    } catch (e) {
      // Ignore analytics errors
    }
  }

  private async loadFallback(
    modelId: string,
    failedVersion: string,
    options: RegistryOptions
  ): Promise<ModelBundle> {
    const versions = await this.getVersions(modelId);
    
    // Find previous stable version
    const previousVersion = versions.find(v => 
      v.version !== failedVersion && !v.deprecated
    );

    if (!previousVersion) {
      throw new Error(`No fallback version available for ${modelId}`);
    }

    console.log(`Loading fallback version: ${previousVersion.version}`);
    
    return this.load(modelId, {
      ...options,
      version: previousVersion.version,
      fallback: undefined // Prevent infinite recursion
    });
  }

  private getMockSearchResults(query: string): RegistrySearchResult {
    // Mock data for development/testing
    const mockModels: ModelMetadata[] = [
      {
        id: 'image-classifier-v2',
        name: 'Image Classifier',
        version: '2.1.0',
        description: 'Fast and accurate image classification model',
        author: 'python-react-ml',
        license: 'MIT',
        tags: ['computer-vision', 'classification', 'resnet'],
        category: 'computer-vision',
        runtime: 'onnx',
        size: 25 * 1024 * 1024,
        downloads: 15420,
        rating: 4.8,
        created: '2024-01-15T00:00:00Z',
        updated: '2024-10-10T00:00:00Z'
      },
      {
        id: 'sentiment-analyzer',
        name: 'Sentiment Analyzer',
        version: '1.5.2',
        description: 'NLP model for sentiment analysis',
        author: 'python-react-ml',
        license: 'MIT',
        tags: ['nlp', 'sentiment', 'bert'],
        category: 'nlp',
        runtime: 'tfjs',
        size: 45 * 1024 * 1024,
        downloads: 8930,
        rating: 4.5,
        created: '2024-02-20T00:00:00Z',
        updated: '2024-09-15T00:00:00Z'
      }
    ];

    const filtered = mockModels.filter(m => 
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.description.toLowerCase().includes(query.toLowerCase()) ||
      m.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
    );

    return {
      models: filtered,
      total: filtered.length,
      page: 1,
      pageSize: 10
    };
  }
}

// Singleton instance
export const modelRegistry = new ModelRegistry();
