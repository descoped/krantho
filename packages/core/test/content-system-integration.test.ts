/**
 * Test for Content System Integration (Simplified)
 *
 * Objective: Validate core integration works correctly
 * Tests: Core Engine — dependency injection with mocked loader/processor
 *
 * Focus: Basic functionality validation with dependency injection
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentEngineFactory } from '../src/content-engine'
// Import from our new core module
import type {
  ContentEngineConfig,
  IContentEngine,
  IContentLoader,
  IMarkdownProcessor,
} from '../src/types'

describe('Content System Integration', () => {
  let mockLoader: IContentLoader
  let mockProcessor: IMarkdownProcessor
  let contentEngine: IContentEngine

  beforeEach(() => {
    // Create mock implementations
    mockLoader = {
      exists: vi.fn().mockResolvedValue(true),
      read: vi.fn().mockResolvedValue(`---
title: 'Test Page'
hero-title: 'Welcome'
---

# Test Content

This is test content.

## test-section
Section content with @title reference.
`),
      getMetadata: vi.fn().mockResolvedValue({
        size: 1024,
        lastModified: new Date('2025-01-17T10:00:00Z'),
      }),
    }

    mockProcessor = {
      parse: vi.fn().mockResolvedValue('<h1>Test Content</h1><p>This is test content.</p>'),
      extractSections: vi.fn().mockReturnValue({
        'test-section': 'Section content with Test Page reference.',
      }),
      processAtNotation: vi.fn().mockImplementation((content, frontmatter) => {
        return content.replace(/@title/g, frontmatter['title'] || '@title')
      }),
    }

    const config: ContentEngineConfig = {
      contentPath: 'test/',
      cacheEnabled: true,
      cacheTTL: 5000,
      maxCacheSize: 10,
      enableAtNotation: true,
    }

    contentEngine = ContentEngineFactory.create(mockLoader, config, mockProcessor)
  })

  describe('Basic Content Loading', () => {
    it('should load content successfully with mocked dependencies', async () => {
      const result = await contentEngine.loadContent('test-page')

      expect(result.error).toBe(null)
      expect(result.loading).toBe(false)
      expect(result.fields['title']).toBe('Test Page')
      expect(result.content).toContain('Section content with Test Page reference')
      expect(result.html).toContain('<h1>Test Content</h1>')
      expect(result.sections['test-section']).toContain('Test Page reference')
      expect(result.metadata.slug).toBe('test-page')
      expect(result.metadata.size).toBe(1024)

      // Verify mock calls
      expect(mockLoader.exists).toHaveBeenCalledWith('test-page')
      expect(mockLoader.read).toHaveBeenCalledWith('test-page')
      expect(mockProcessor.processAtNotation).toHaveBeenCalled()
      expect(mockProcessor.parse).toHaveBeenCalled()
      expect(mockProcessor.extractSections).toHaveBeenCalled()
    })

    it('should validate unified ContentResult type structure', async () => {
      const result = await contentEngine.loadContent('test-page')

      // Type structure validation
      expect(result).toHaveProperty('fields')
      expect(result).toHaveProperty('content')
      expect(result).toHaveProperty('html')
      expect(result).toHaveProperty('sections')
      expect(result).toHaveProperty('metadata')
      expect(result).toHaveProperty('loading')
      expect(result).toHaveProperty('error')

      // Type assertions for TypeScript compliance
      const frontmatter: Record<string, unknown> = result.fields
      const content: string = result.content
      const html: string = result.html
      const sections: Record<string, string> = result.sections
      const loading: boolean = result.loading

      expect(typeof frontmatter).toBe('object')
      expect(typeof content).toBe('string')
      expect(typeof html).toBe('string')
      expect(typeof sections).toBe('object')
      expect(typeof loading).toBe('boolean')
    })
  })

  describe('Caching Behavior', () => {
    it('should cache content and avoid duplicate loading', async () => {
      // First load
      const result1 = await contentEngine.loadContent('test-page')
      expect(mockLoader.read).toHaveBeenCalledTimes(1)

      // Second load (should use cache)
      const result2 = await contentEngine.loadContent('test-page')
      expect(mockLoader.read).toHaveBeenCalledTimes(1) // Still 1, not 2

      // Results should be identical
      expect(result2.fields).toEqual(result1.fields)
      expect(result2.content).toEqual(result1.content)
    })

    it('should provide cache statistics', async () => {
      const initialStats = contentEngine.getCacheStats()
      expect(initialStats.totalRequests).toBe(0)

      await contentEngine.loadContent('test-page')

      const stats = contentEngine.getCacheStats()
      expect(stats.totalRequests).toBe(1)
      expect(stats.totalMisses).toBe(1)
      expect(stats.size).toBe(1)
    })
  })

  describe('Error Handling', () => {
    it('should handle file not found errors', async () => {
      ;(mockLoader.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false)

      const result = await contentEngine.loadContent('non-existent')

      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('NOT_FOUND')
      expect(result.fields).toEqual({})
      expect(result.content).toBe('')
      expect(result.loading).toBe(false)
    })

    it('should handle processing errors', async () => {
      ;(mockLoader.read as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Read error'))

      const result = await contentEngine.loadContent('error-page')

      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('PARSE_ERROR')
      expect(result.error?.message).toContain('Read error')
    })
  })

  describe('Configuration', () => {
    it('should provide access to configuration', () => {
      const config = contentEngine.getConfig()

      expect(config.contentPath).toBe('test/')
      expect(config.cacheEnabled).toBe(true)
      expect(config.cacheTTL).toBe(5000)
      expect(config.maxCacheSize).toBe(10)
      expect(config.enableAtNotation).toBe(true)
    })

    it('should support cache clearing', () => {
      contentEngine.clearCache()

      const stats = contentEngine.getCacheStats()
      expect(stats.size).toBe(0)
      expect(stats.totalRequests).toBe(0)
      expect(stats.totalHits).toBe(0)
      expect(stats.totalMisses).toBe(0)
    })
  })

  describe('Factory Pattern', () => {
    it('should create engines with default configuration', () => {
      const defaultEngine = ContentEngineFactory.create(mockLoader)
      const config = defaultEngine.getConfig()

      expect(config.contentPath).toBe('/content/')
      expect(config.cacheEnabled).toBe(false) // Disabled in test/dev, enabled in production
      expect(config.cacheTTL).toBe(300000) // 5 minutes
      expect(config.maxCacheSize).toBe(100)
    })

    it('should create engines with custom configuration', () => {
      const customConfig = {
        contentPath: '/custom/path/',
        cacheTTL: 60000,
      }

      const customEngine = ContentEngineFactory.create(mockLoader, customConfig)
      const config = customEngine.getConfig()

      expect(config.contentPath).toBe('/custom/path/')
      expect(config.cacheTTL).toBe(60000)
      expect(config.cacheEnabled).toBe(false) // Inherits env-aware default
    })
  })
})

/**
 * Test Summary - Content System Integration
 *
 * ✅ BASIC FUNCTIONALITY: Content loading works with dependency injection
 * ✅ TYPE STRUCTURE: Unified ContentResult interface validation
 * ✅ CACHING: Cache behavior and statistics working correctly
 * ✅ ERROR HANDLING: Consistent error states and codes
 * ✅ CONFIGURATION: Factory pattern and config management
 * ✅ DEPENDENCY INJECTION: Testable architecture with mocked dependencies
 *
 * This test validates that the core content system integration works
 * correctly and provides a foundation for the adapter pattern layer.
 */
