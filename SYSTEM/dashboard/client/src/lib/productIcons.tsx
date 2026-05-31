import React from 'react'
import type { ProductIconName } from './productIconResolver'
export { resolveCategoryVisual, resolveSkillVisual, resolveTemplateVisual } from './productIconResolver'

type ProductIconCellProps = {
  iconName?: ProductIconName | null
  emoji?: string | null
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function iconSvgClassName(className?: string) {
  return `h-4 w-4 shrink-0${className ? ` ${className}` : ''}`
}

function IconSvg({ iconName, className }: { iconName: ProductIconName; className?: string }) {
  const cls = iconSvgClassName(className)
  switch (iconName) {
    case 'details':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )
    case 'status':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M4 19h16" />
          <path d="M7 16V9" />
          <path d="M12 16V5" />
          <path d="M17 16v-3" />
        </svg>
      )
    case 'edit':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M12 20h9" />
          <path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z" />
        </svg>
      )
    case 'clone':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <rect x="4" y="4" width="11" height="11" rx="2" />
        </svg>
      )
    case 'docs':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </svg>
      )
    case 'save':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
          <path d="M17 21v-8H7v8" />
          <path d="M7 3v5h8" />
        </svg>
      )
    case 'export':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M12 21V9" />
          <path d="m17 14-5-5-5 5" />
          <path d="M21 21H3" />
        </svg>
      )
    case 'restart':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M21 2v6h-6" />
          <path d="M20.49 9A9 9 0 1 0 21 12" />
        </svg>
      )
    case 'doctor':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M8 2h8" />
          <path d="M9 2v4l-5 9a4 4 0 0 0 3.5 6h9A4 4 0 0 0 20 15l-5-9V2" />
          <path d="M10 12h4" />
          <path d="M12 10v4" />
        </svg>
      )
    case 'rename':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M4 20h16" />
          <path d="M6 16 18 4" />
          <path d="m15 4 5 5" />
        </svg>
      )
    case 'budget':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M12 2v20" />
          <path d="M17 6.5A4.5 4.5 0 0 0 12.5 4h-1A3.5 3.5 0 0 0 8 7.5c0 2 1.5 3 4 3h1c2.5 0 4 1 4 3A3.5 3.5 0 0 1 13.5 17h-1A4.5 4.5 0 0 1 8 14.5" />
        </svg>
      )
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5Z" />
          <path d="M9.8 8.8c.4-1 1.3-1 1.7-.3l.6 1.1c.2.4.2.8-.1 1.1l-.5.5c.6 1 1.4 1.8 2.4 2.4l.5-.5c.3-.3.7-.3 1.1-.1l1.1.6c.7.4.7 1.3-.3 1.7-.9.4-2 .4-3-.1-2-.9-3.7-2.6-4.6-4.6-.5-1-.5-2.1-.1-3Z" />
        </svg>
      )
    case 'archive':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
          <path d="M10 12h4" />
        </svg>
      )
    case 'restore':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M12 19V7" />
          <path d="m7 12 5-5 5 5" />
          <path d="M5 21h14" />
        </svg>
      )
    case 'delete':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      )
    case 'organization':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M3 21h18" />
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 9h.01" />
          <path d="M15 9h.01" />
          <path d="M9 13h.01" />
          <path d="M15 13h.01" />
          <path d="M10 21v-4h4v4" />
        </svg>
      )
    case 'communication':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M7 10h10" />
          <path d="M7 14h6" />
          <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
        </svg>
      )
    case 'community':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'group':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'create':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      )
    case 'import':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M12 3v12" />
          <path d="m7 8 5-5 5 5" />
          <path d="M5 21h14" />
        </svg>
      )
    case 'refresh':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      )
    case 'grid':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      )
    case 'list':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      )
    case 'select':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          <path d="m8 12 2.5 2.5 5.5-5.5" />
        </svg>
      )
    case 'history':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M3 3v5h5" />
          <path d="M3.5 13a8.5 8.5 0 1 0 2.5-6" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
    case 'expand':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M15 3h6v6" />
          <path d="m21 3-7 7" />
          <path d="M9 21H3v-6" />
          <path d="m3 21 7-7" />
        </svg>
      )
    case 'close':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="m18 6-12 12" />
          <path d="m6 6 12 12" />
        </svg>
      )
    case 'play':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="m8 5 11 7-11 7z" />
        </svg>
      )
    case 'pause':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M10 4H6v16h4z" />
          <path d="M18 4h-4v16h4z" />
        </svg>
      )
    case 'workflow':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
          <path d="M8 6h8" />
          <path d="M6 8v8" />
          <path d="M18 8v8" />
          <path d="M8 18h8" />
        </svg>
      )
    case 'business':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M3 12h18" />
        </svg>
      )
    case 'technical':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="m4.93 4.93 2.83 2.83" />
          <path d="m16.24 16.24 2.83 2.83" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
          <path d="m4.93 19.07 2.83-2.83" />
          <path d="m16.24 7.76 2.83-2.83" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      )
    case 'personal':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        </svg>
      )
    case 'events':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
        </svg>
      )
    case 'travel':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="m2 16 20-5-20-5 5 5-5 5Z" />
        </svg>
      )
    case 'hobbies':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M12 3a7 7 0 0 0-7 7c0 5 7 11 7 11s7-6 7-11a7 7 0 0 0-7-7Z" />
          <path d="M8 11h.01" />
          <path d="M12 8h.01" />
          <path d="M16 11h.01" />
        </svg>
      )
    case 'family':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10.5V20h14v-9.5" />
        </svg>
      )
    case 'science':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M10 2v6l-5 8a3 3 0 0 0 2.5 4.5h9A3 3 0 0 0 19 16l-5-8V2" />
          <path d="M8 14h8" />
        </svg>
      )
    case 'directory':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
      )
    case 'github':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M9 18c-4.5 2-5-2-7-2" />
          <path d="M15 22v-4a4 4 0 0 0-.88-2.62c2.94-.33 6.04-1.44 6.04-6.38A4.97 4.97 0 0 0 18.84 5.5 4.63 4.63 0 0 0 18.75 2S17.73 1.67 15 3.48a13.38 13.38 0 0 0-6 0C6.27 1.67 5.25 2 5.25 2a4.63 4.63 0 0 0-.09 3.5A4.97 4.97 0 0 0 3.84 9c0 4.91 3.1 6.02 6.04 6.38A4 4 0 0 0 9 18v4" />
        </svg>
      )
    case 'registry':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5Z" />
          <path d="M3 7.5 12 12l9-4.5" />
          <path d="M12 12v9" />
        </svg>
      )
    case 'partner':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M10 13a5 5 0 0 1 7 0l1 1a5 5 0 0 1-7 7l-1-1" />
          <path d="M14 11a5 5 0 0 1-7 0L6 10a5 5 0 0 1 7-7l1 1" />
        </svg>
      )
    case 'ai':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M12 8V4" />
          <path d="M8 4h8" />
          <rect x="4" y="8" width="16" height="11" rx="3" />
          <path d="M9 13h.01" />
          <path d="M15 13h.01" />
          <path d="M9 17h6" />
        </svg>
      )
    case 'template':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 8h10" />
          <path d="M7 12h4" />
          <path d="M13 12h4" />
          <path d="M7 16h10" />
        </svg>
      )
    case 'skill':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-3-3Z" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4l2 2" />
        </svg>
      )
  }
}

export function ProductIconCell({ iconName, emoji, label, size = 'md', className = '' }: ProductIconCellProps) {
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-sm' : size === 'lg' ? 'h-12 w-12 text-xl' : 'h-10 w-10 text-base'
  return (
    <span
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200 ${sizeClass} ${className}`.trim()}
    >
      {iconName ? <IconSvg iconName={iconName} /> : <span className="leading-none">{emoji || '•'}</span>}
    </span>
  )
}
