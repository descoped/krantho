import { createHash } from 'node:crypto'
import type { MediaSection } from '@krantho/config'
import type sharp from 'sharp'
import type { Sharp } from 'sharp'
import type { ImageFormat, ImagePreset } from './image-presets.js'
import { getContentType } from './image-presets.js'

type SharpFn = typeof sharp

/** Result of normalizing an uploaded image */
export interface NormalizeResult {
  buffer: Buffer
  width: number
  height: number
  mimeType: string
}

/** Result of generating an image variant */
export interface VariantResult {
  bytes: Buffer
  contentType: string
  width: number
  height: number
}

/** Dimension overrides for cropping and hotspot */
export interface DimensionOverrides {
  aspectRatio?: string | undefined
  /** Crop region as percentages (0-100) — applied before resize */
  crop?: { x: number; y: number; width: number; height: number } | undefined
  /** Hotspot center + ellipse for adaptive aspect-ratio cropping (0-100%) */
  hotspot?: { x: number; y: number; width: number; height: number } | undefined
}

/** Image processing settings, as the configuration tree declares them */
export type ImageSettings = MediaSection['image']

// SVG should not be processed by sharp
const SKIP_NORMALIZE_TYPES = new Set(['image/svg+xml'])

/**
 * Image processing pipeline using sharp.
 *
 * Handles upload normalization (EXIF, cap dimensions, JPEG re-encode)
 * and on-demand variant generation (resize to preset, format conversion).
 */
export class ImageOptimizer {
  private readonly settings: ImageSettings
  private sharpFn: SharpFn | undefined

  constructor(settings: ImageSettings) {
    this.settings = settings
  }

  /**
   * Normalize an uploaded image:
   * 1. Auto-orient from EXIF
   * 2. Cap width to maxWidth
   * 3. Re-encode as JPEG at the configured normalize quality
   *
   * Returns the normalized buffer and detected dimensions.
   * Skips normalization for SVG (returns input unchanged).
   */
  async normalize(buffer: Uint8Array, mimeType: string): Promise<NormalizeResult> {
    if (SKIP_NORMALIZE_TYPES.has(mimeType)) {
      return {
        buffer: Buffer.from(buffer),
        width: 0,
        height: 0,
        mimeType,
      }
    }

    const sharpFn = await this.getSharp()
    const result = await sharpFn(Buffer.from(buffer))
      .rotate() // Auto-orient from EXIF
      .resize({ width: this.settings.maxWidth, withoutEnlargement: true })
      .jpeg({ quality: this.settings.quality.normalize })
      .toBuffer({ resolveWithObject: true })

    return {
      buffer: result.data,
      width: result.info.width,
      height: result.info.height,
      mimeType: 'image/jpeg',
    }
  }

  /**
   * Generate a resized variant for serving.
   *
   * Resizes to the preset width (preserving aspect ratio) and encodes
   * to the requested format. If overrides specify an aspect ratio,
   * applies center crop before resizing.
   */
  async generateVariant(
    buffer: Uint8Array,
    preset: ImagePreset,
    format: ImageFormat,
    overrides?: DimensionOverrides,
  ): Promise<VariantResult> {
    const sharpFn = await this.getSharp()
    const targetWidth = this.presetWidth(preset)

    let pipeline = sharpFn(Buffer.from(buffer)).rotate()

    // Hotspot-aware aspect crop takes precedence over explicit crop — they are
    // mutually exclusive because hotspot crop operates on the original image coordinates.
    if (overrides?.hotspot && overrides.aspectRatio && targetWidth) {
      const [wRatio, hRatio] = parseAspectRatio(overrides.aspectRatio)
      if (wRatio && hRatio) {
        pipeline = await this.applyHotspotCrop(
          pipeline,
          buffer,
          overrides.hotspot,
          wRatio / hRatio,
          targetWidth,
        )
      }
    } else {
      // Apply percentage-based crop region when hotspot+aspect is not active
      if (overrides?.crop) {
        pipeline = await this.applyCrop(pipeline, buffer, overrides.crop)
      }

      if (overrides?.aspectRatio) {
        // Apply explicit aspect ratio crop
        const [wRatio, hRatio] = parseAspectRatio(overrides.aspectRatio)
        if (wRatio && hRatio && targetWidth) {
          const targetHeight = Math.round(targetWidth * (hRatio / wRatio))
          pipeline = pipeline.resize({
            width: targetWidth,
            height: targetHeight,
            fit: 'cover',
          })
        }
      } else if (targetWidth) {
        // Standard resize — preserve aspect ratio, no upscaling
        pipeline = pipeline.resize({
          width: targetWidth,
          withoutEnlargement: true,
        })
      }
      // 'full' preset: no resize at all
    }

    // Encode to target format
    switch (format) {
      case 'webp':
        pipeline = pipeline.webp({ quality: this.settings.quality.webp })
        break
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality: this.settings.quality.jpeg })
        break
      case 'png':
        pipeline = pipeline.png()
        break
      case 'avif':
        pipeline = pipeline.avif({ quality: this.settings.quality.avif })
        break
    }

    const result = await pipeline.toBuffer({ resolveWithObject: true })

    const contentType = getContentType(format)

    return {
      bytes: result.data,
      contentType,
      width: result.info.width,
      height: result.info.height,
    }
  }

  /** Pixel width for a preset. Null means serve at the original size. */
  private presetWidth(preset: ImagePreset): number | null {
    return this.settings.presets[preset] ?? null
  }

  /** Apply a percentage-based crop region, converting to pixel coordinates */
  private async applyCrop(
    pipeline: Sharp,
    buffer: Uint8Array,
    crop: { x: number; y: number; width: number; height: number },
  ): Promise<Sharp> {
    const sharpFn = await this.getSharp()
    const metadata = await sharpFn(Buffer.from(buffer)).metadata()
    if (metadata.width && metadata.height) {
      const left = Math.round((crop.x / 100) * metadata.width)
      const top = Math.round((crop.y / 100) * metadata.height)
      const width = Math.round((crop.width / 100) * metadata.width)
      const height = Math.round((crop.height / 100) * metadata.height)
      if (width > 0 && height > 0) {
        return pipeline.extract({ left, top, width, height })
      }
    }
    return pipeline
  }

  /**
   * Hotspot-aware aspect crop: crop to a target aspect ratio, keeping the
   * hotspot center visible. Then resize to target width.
   *
   * Only the hotspot center (x, y) is used for positioning. The hotspot
   * width/height (ellipse) are stored for Studio visualization but do not
   * affect the image processing.
   *
   * Example: a 3:2 landscape photo served as 1:1 thumbnail — the crop
   * centers on the hotspot instead of the image center.
   */
  private async applyHotspotCrop(
    pipeline: Sharp,
    buffer: Uint8Array,
    hotspot: { x: number; y: number; width: number; height: number },
    targetAspect: number,
    targetWidth: number,
  ): Promise<Sharp> {
    const sharpFn = await this.getSharp()
    const metadata = await sharpFn(Buffer.from(buffer)).metadata()
    if (!metadata.width || !metadata.height) return pipeline

    const srcW = metadata.width
    const srcH = metadata.height
    const srcAspect = srcW / srcH

    // Compute the largest crop region at the target aspect that fits the source
    let cropW: number
    let cropH: number
    if (targetAspect > srcAspect) {
      // Target is wider — constrain by width
      cropW = srcW
      cropH = Math.round(srcW / targetAspect)
    } else {
      // Target is taller — constrain by height
      cropH = srcH
      cropW = Math.round(srcH * targetAspect)
    }

    // Hotspot center in pixels
    const hotX = Math.round((hotspot.x / 100) * srcW)
    const hotY = Math.round((hotspot.y / 100) * srcH)

    // Center crop on hotspot, clamp to image bounds
    let left = Math.round(hotX - cropW / 2)
    let top = Math.round(hotY - cropH / 2)
    left = Math.max(0, Math.min(left, srcW - cropW))
    top = Math.max(0, Math.min(top, srcH - cropH))

    return pipeline
      .extract({ left, top, width: cropW, height: cropH })
      .resize({ width: targetWidth, withoutEnlargement: true })
  }

  /** Lazy-load sharp to avoid loading native bindings until needed */
  private async getSharp(): Promise<SharpFn> {
    if (!this.sharpFn) {
      const mod = await import('sharp')
      this.sharpFn = mod.default
    }
    return this.sharpFn
  }
}

/** Compute an ETag from image bytes (first 8 chars of SHA-256) */
export function computeEtag(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}

/** Parse an aspect ratio string like '16:9' into [16, 9] */
function parseAspectRatio(ratio: string): [number | undefined, number | undefined] {
  const parts = ratio.split(':')
  const rawW = parts[0]
  const rawH = parts[1]
  if (parts.length !== 2 || !rawW || !rawH) return [undefined, undefined]
  const w = Number.parseInt(rawW, 10)
  const h = Number.parseInt(rawH, 10)
  if (Number.isNaN(w) || Number.isNaN(h) || w <= 0 || h <= 0) return [undefined, undefined]
  return [w, h]
}
