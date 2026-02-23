# Known Bugs

## Community/Group Highlight on Navigation Not Working

**Status**: Open
**Priority**: Medium
**Created**: 2025-02-23

### Description
When clicking a community or group from an agent card, the navigation to the Communication page works, but the channel card doesn't scroll into view or highlight.

### Root Cause
React doesn't render the channel cards when the Communication page div has the `hidden` class (when on Agents page). Even after switching pages and waiting, the DOM elements aren't available.

**Technical Details**:
- App.tsx uses `className={page === 'communication' ? '' : 'hidden'}` for page switching
- The `hidden` class prevents React from rendering child components
- By the time the useEffect runs, `document.querySelectorAll('[id^="channel-card-"]')` returns empty array
- Even with 1.3s total delay (300ms + 1000ms retry), elements never appear

### Attempted Fixes
1. ✗ Increased timeout delays (100ms → 300ms → 500ms)
2. ✗ Added retry mechanism with 1000ms delay
3. ✗ Used `requestAnimationFrame` to wait for paint
4. ✗ Added `isActive` prop to track page visibility
5. ✗ Added `!loading` check to wait for data

### Possible Solutions
1. **Remove hidden class approach** - Render all pages but use `display: none` or `visibility: hidden` instead
2. **Conditional rendering with keys** - Force remount when page changes
3. **Use React Router** - Proper page routing instead of hidden divs
4. **MutationObserver** - Watch for DOM changes and trigger scroll when element appears
5. **Store scroll intent** - Let Communication page handle scroll on its own mount/visibility change

### Files Affected
- `SYSTEM/dashboard/client/src/App.tsx` (line 164)
- `SYSTEM/dashboard/client/src/pages/Communication.tsx` (lines 87-106)

### Workaround
For now, users can:
1. Click the community/group from agent card (navigates to Communication page)
2. Manually find the channel in the list

The navigation works, just not the scroll/highlight feature.
