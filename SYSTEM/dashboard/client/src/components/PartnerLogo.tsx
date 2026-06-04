import { useState } from 'react'
import { getPartnerLogoClass } from '../lib/partnerCatalog'

type PartnerLogoProps = {
  slug: string
  name: string
  logoUrl?: string
  variant?: 'compact' | 'hero'
}

export function PartnerLogo({ slug, name, logoUrl, variant = 'compact' }: PartnerLogoProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const className = getPartnerLogoClass(slug, variant)

  if (!logoUrl || imageFailed) {
    return (
      <span
        role="img"
        aria-label={`${name} logo`}
        className={`${className} inline-flex min-w-[3.25rem] items-center justify-center text-[10px] font-semibold leading-none tracking-tight text-gray-950 dark:text-gray-950`}
      >
        {name}
      </span>
    )
  }

  return (
    <img
      src={logoUrl}
      alt={`${name} logo`}
      className={className}
      loading="lazy"
      onError={() => setImageFailed(true)}
    />
  )
}
