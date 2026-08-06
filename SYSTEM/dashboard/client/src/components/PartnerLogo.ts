import React, { useState } from 'react'
import { getPartnerLogoClass } from '../lib/partnerCatalog'

type PartnerLogoProps = {
  slug: string
  name: string
  logoUrl?: string
  variant?: 'compact' | 'hero'
}

function fallbackLogo(className: string, name: string) {
  const glyphs: Record<string, string> = {
    cognee: 'C', digo: 'D', gmail: 'G', microsoft365: 'M', opik: 'O', resend: 'R', senso: 'S',
  }
  const glyph = glyphs[name.toLowerCase()] || name.trim().slice(0, 1).toUpperCase() || '?'
  return React.createElement(
    'span',
    {
      role: 'img',
      'aria-label': `${name} logo`,
      title: `${name} icon`,
      className: `${className} inline-flex min-w-[2rem] items-center justify-center overflow-hidden text-sm font-semibold leading-none text-gray-950 dark:text-gray-950`,
    },
    glyph,
  )
}

export function PartnerLogo({ slug, name, logoUrl, variant = 'compact' }: PartnerLogoProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const className = getPartnerLogoClass(slug, variant)
  const chipClassName = `${className} inline-flex items-center justify-center overflow-hidden`

  if (!logoUrl || imageFailed) {
    return fallbackLogo(className, name)
  }

  return React.createElement(
    'span',
    {
      className: chipClassName,
      title: `${name} logo`,
    },
    React.createElement('img', {
      src: logoUrl,
      alt: `${name} logo`,
      className: 'block max-h-full max-w-full object-contain',
      loading: 'lazy',
      onError: () => setImageFailed(true),
    }),
  )
}
