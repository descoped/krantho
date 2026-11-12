'use client'

import React from 'react'

export interface TailwindCMSImageProps {
  slug: string
  field: string
  alt?: string
  width?: number
  height?: number
  lazy?: boolean
  className?: string
}

export function CMSImage({
  alt = '',
  width,
  height,
  lazy = true,
  className,
}: TailwindCMSImageProps): React.ReactElement {
  return React.createElement('img', {
    alt,
    width,
    height,
    loading: lazy ? 'lazy' : undefined,
    className: `w-full h-auto object-cover ${className ?? ''}`,
  })
}
