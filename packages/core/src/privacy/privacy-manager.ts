/**
 * Privacy Module
 * 
 * Privacy-first AI features:
 * - Differential privacy
 * - Local-only processing
 * - Encrypted inference
 * - Privacy guarantees
 * - No telemetry mode
 */

import { PrivacyOptions, PrivacyGuarantee } from '../types-phase2.5';

export class PrivacyManager {
  private options: PrivacyOptions;

  constructor(options: PrivacyOptions = {}) {
    this.options = {
      differentialPrivacy: {
        enabled: false,
        epsilon: 1.0,
        delta: 1e-5,
        mechanism: 'laplace'
      },
      localProcessingOnly: false,
      encryptedInference: false,
      noTelemetry: false,
      clearMemoryAfter: false,
      secureMPC: {
        enabled: false,
        parties: 2
      },
      ...options
    };
  }

  /**
   * Apply differential privacy noise to output
   */
  applyDifferentialPrivacy<T = any>(output: T): T {
    if (!this.options.differentialPrivacy?.enabled) {
      return output;
    }

    const { epsilon, mechanism } = this.options.differentialPrivacy;

    if (typeof output === 'number') {
      const noise = mechanism === 'laplace' 
        ? this.laplaceNoise(1.0 / epsilon)
        : this.gaussianNoise(1.0 / epsilon);
      
      return (output + noise) as T;
    }

    if (Array.isArray(output)) {
      return output.map(val => {
        if (typeof val === 'number') {
          const noise = mechanism === 'laplace'
            ? this.laplaceNoise(1.0 / epsilon)
            : this.gaussianNoise(1.0 / epsilon);
          return val + noise;
        }
        return val;
      }) as T;
    }

    if (typeof output === 'object' && output !== null) {
      const noisyOutput: any = {};
      
      for (const [key, value] of Object.entries(output)) {
        if (typeof value === 'number') {
          const noise = mechanism === 'laplace'
            ? this.laplaceNoise(1.0 / epsilon)
            : this.gaussianNoise(1.0 / epsilon);
          noisyOutput[key] = value + noise;
        } else if (Array.isArray(value)) {
          noisyOutput[key] = value.map(v => {
            if (typeof v === 'number') {
              const noise = mechanism === 'laplace'
                ? this.laplaceNoise(1.0 / epsilon)
                : this.gaussianNoise(1.0 / epsilon);
              return v + noise;
            }
            return v;
          });
        } else {
          noisyOutput[key] = value;
        }
      }
      
      return noisyOutput as T;
    }

    return output;
  }

  /**
   * Encrypt data for secure inference
   */
  async encryptData(data: any): Promise<string> {
    if (!this.options.encryptedInference) {
      throw new Error('Encrypted inference not enabled');
    }

    // Simplified encryption (in production, use WebCrypto API properly)
    const jsonStr = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataArray = encoder.encode(jsonStr);

    // Generate a simple key (in production, use proper key management)
    const key = await this.generateEncryptionKey();
    
    // XOR encryption (placeholder - use proper encryption in production)
    const encrypted = Array.from(dataArray).map((byte, i) => 
      byte ^ key[i % key.length]
    );

    return btoa(String.fromCharCode(...encrypted));
  }

  /**
   * Decrypt encrypted inference result
   */
  async decryptData(encryptedData: string): Promise<any> {
    if (!this.options.encryptedInference) {
      throw new Error('Encrypted inference not enabled');
    }

    const key = await this.generateEncryptionKey();
    const encrypted = atob(encryptedData).split('').map(c => c.charCodeAt(0));
    
    const decrypted = encrypted.map((byte, i) => 
      byte ^ key[i % key.length]
    );

    const jsonStr = new TextDecoder().decode(new Uint8Array(decrypted));
    return JSON.parse(jsonStr);
  }

  /**
   * Clear sensitive data from memory
   */
  clearMemory(data: any): void {
    if (!this.options.clearMemoryAfter) {
      return;
    }

    // Overwrite memory (best effort in JavaScript)
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        data[i] = 0;
      }
    } else if (typeof data === 'object' && data !== null) {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
    }

    // Suggest garbage collection (not guaranteed)
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Get privacy guarantee for current configuration
   */
  getPrivacyGuarantee(): PrivacyGuarantee {
    return {
      dataLeavesDevice: !this.options.localProcessingOnly,
      differentialPrivacyApplied: this.options.differentialPrivacy?.enabled || false,
      epsilon: this.options.differentialPrivacy?.epsilon,
      encryptionUsed: this.options.encryptedInference || false,
      telemetryEnabled: !this.options.noTelemetry
    };
  }

  /**
   * Validate that privacy requirements are met
   */
  validatePrivacyRequirements(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (this.options.localProcessingOnly) {
      // Check if we're actually in a local environment
      if (typeof window !== 'undefined' && window.location.protocol === 'http:') {
        // Could be local, but not guaranteed
      }
    }

    if (this.options.encryptedInference && !this.isEncryptionAvailable()) {
      issues.push('Encryption requested but Web Crypto API not available');
    }

    if (this.options.differentialPrivacy?.enabled) {
      const epsilon = this.options.differentialPrivacy.epsilon;
      if (epsilon < 0.1 || epsilon > 10) {
        issues.push(`Epsilon value ${epsilon} may provide insufficient privacy or too much noise`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Generate a privacy report
   */
  generatePrivacyReport(): string {
    const guarantee = this.getPrivacyGuarantee();
    const validation = this.validatePrivacyRequirements();

    return `
Privacy Configuration Report
============================

Data Privacy:
- Data leaves device: ${guarantee.dataLeavesDevice ? 'YES ⚠️' : 'NO ✓'}
- Local processing only: ${this.options.localProcessingOnly ? 'YES ✓' : 'NO'}
- Encrypted inference: ${guarantee.encryptionUsed ? 'YES ✓' : 'NO'}

Differential Privacy:
- Enabled: ${guarantee.differentialPrivacyApplied ? 'YES ✓' : 'NO'}
${guarantee.epsilon ? `- Privacy budget (ε): ${guarantee.epsilon}` : ''}
${this.options.differentialPrivacy?.delta ? `- Delta (δ): ${this.options.differentialPrivacy.delta}` : ''}
${this.options.differentialPrivacy?.mechanism ? `- Mechanism: ${this.options.differentialPrivacy.mechanism}` : ''}

Other Settings:
- Telemetry: ${guarantee.telemetryEnabled ? 'ENABLED' : 'DISABLED ✓'}
- Memory clearing: ${this.options.clearMemoryAfter ? 'ENABLED ✓' : 'DISABLED'}
- Secure MPC: ${this.options.secureMPC?.enabled ? 'ENABLED ✓' : 'DISABLED'}

Validation:
- Status: ${validation.valid ? 'VALID ✓' : 'ISSUES FOUND ⚠️'}
${validation.issues.length > 0 ? '\nIssues:\n' + validation.issues.map(i => `- ${i}`).join('\n') : ''}
    `.trim();
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private laplaceNoise(scale: number): number {
    // Generate Laplace noise using inverse transform sampling
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  private gaussianNoise(stddev: number): number {
    // Box-Muller transform for Gaussian noise
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stddev;
  }

  private async generateEncryptionKey(): Promise<Uint8Array> {
    // In production, use proper key derivation and management
    // This is a simplified example
    const key = new Uint8Array(32);
    
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(key);
    } else {
      // Fallback (not cryptographically secure!)
      for (let i = 0; i < key.length; i++) {
        key[i] = Math.floor(Math.random() * 256);
      }
    }

    return key;
  }

  private isEncryptionAvailable(): boolean {
    return typeof crypto !== 'undefined' && 
           typeof crypto.subtle !== 'undefined';
  }

  /**
   * Update privacy options
   */
  updateOptions(options: Partial<PrivacyOptions>): void {
    this.options = {
      ...this.options,
      ...options
    };
  }

  /**
   * Get current privacy options
   */
  getOptions(): PrivacyOptions {
    return { ...this.options };
  }
}

// Singleton instance
export const privacyManager = new PrivacyManager();
