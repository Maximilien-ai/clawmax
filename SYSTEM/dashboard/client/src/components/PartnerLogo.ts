import React, { useState } from 'react'
import { getPartnerLogoClass } from '../lib/partnerCatalog'

type PartnerLogoProps = {
  slug: string
  name: string
  logoUrl?: string
  variant?: 'compact' | 'hero'
}

function fallbackLogo(className: string, name: string) {
  return React.createElement(
    'span',
    {
      role: 'img',
      'aria-label': `${name} logo`,
      className: `${className} inline-flex min-w-[3.25rem] items-center justify-center overflow-hidden text-[10px] font-semibold leading-none tracking-tight text-gray-950 dark:text-gray-950`,
    },
    name,
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
