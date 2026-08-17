export function getDashboardAuthReturnTo(
  location: Pick<Location, 'origin' | 'pathname' | 'search' | 'hash'>,
) {
  return `${location.origin}${location.pathname}${location.search}${location.hash}`
}
