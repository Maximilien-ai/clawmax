import React from 'react'

const URL_PATTERN = /(https?:\/\/[^\s]+)/g

export function renderMaintenanceBannerText(
  text: string,
  linkClassName: string,
) {
  const lines = text.split('\n')

  return lines.map((line, lineIndex) => {
    const parts = line.split(URL_PATTERN)
    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          if (!part) return null
          if (URL_PATTERN.test(part)) {
            URL_PATTERN.lastIndex = 0
            return (
              <a
                key={`link-${lineIndex}-${partIndex}`}
                href={part}
                target="_blank"
                rel="noreferrer"
                className={linkClassName}
              >
                {part}
              </a>
            )
          }
          URL_PATTERN.lastIndex = 0
          return <React.Fragment key={`text-${lineIndex}-${partIndex}`}>{part}</React.Fragment>
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </React.Fragment>
    )
  })
}
