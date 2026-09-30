# Canonical commenting experience

Read this before installing, upgrading, or verifying the contextual review layer.

## Interaction foundation

- `C` enters comment mode and `Esc` exits it.
- Clicking a target or dragging a region opens the same compact composer.
- Comments created inside an active modal/dialog belong to that modal and reopen there.
- The review token survives SPA links, History API navigation, and the prototype's normal route/query changes.
- Ordinary URLs contain no review toolbar and no layout changes.

## Visual language

- The tool has its own restrained neutral dark design with high-contrast text, compact rounded corners, and no inherited Dialpad purple or host-product theming.
- Keep the bottom toolbar horizontally centered, icon-first, and uncluttered. Its inbox count remains a true circle.
- Place the compact dark composer beside the selected point or region and clamp it inside the visible review surface. Controls must never fall beneath the viewport.
- Put feedback first. Ask for the reviewer's name beneath it only when the shared session does not already know the name; remember it after first use.
- Show `Add` only after feedback exists and dictation is inactive. Do not crowd the empty state with competing actions.
- Long cards may become wider but remain inside the viewport with a bounded, scrollable message region.
- Keep an open comment card visually stable while the host page reacts to hover or other DOM changes. Surface synchronization repositions the existing card instead of remounting it or replaying its entrance animation.

## Voice-first Chrome behavior

- On a new blank comment in supported Google Chrome, opening the composer immediately attempts dictation. Typing remains available in the same field.
- Follow the reviewer's demonstrated intent instead of asking them to choose a mode. While automatic dictation is requesting, listening, or finishing, the first text-edit action in the feedback field—typing, deleting, pasting, cutting, dropping text, or beginning an input-method composition—immediately yields control to typing. Stop voice capture without confirmation, keep any transcript already visible, remove the listening treatment, and apply that same edit without making the reviewer repeat it. Clicking or moving the caret alone does not stop dictation.
- Use `Speak or type your feedback` in supported Chrome and `Type your feedback` in the fallback.
- Do not show a large `Use voice`, `Start talking`, or `Talk` CTA.
- While listening, show a small waveform, concise inline status, a small X that discards only the current voice take, and a check/tick that finishes it. Keep the X behavior without additional confirmation unless the owner requests otherwise.
- Finishing preserves an editable transcript. Starting voice again appends; it never replaces existing text. Scroll the field so the newest words remain visible.
- Keep errors inline, preserve captured text, and allow typing/submission after voice fails.
- Store only text. Do not record, upload, retain, or attach audio. Chrome punctuation and recognition errors are accepted limitations; do not add paid transcription or automatic rewriting without explicit authorization.

## Automatic browser fallback

- Give every reviewer the same URL shape. Detect capability at runtime.
- Enable dictation only for Google Chrome with an available Speech Recognition API.
- Safari, Edge, Firefox, blocked microphones, and unavailable recognition receive the clean typing-only flow with no mic, waveform, or voice instruction.
- The fallback retains feedback-first order, remembered name, conditional `Add`, and shared-comment behavior.

## Identity, location, and history

- Use the first-name initial in a rounded-square marker with a stable distinguishable color. Do not number page comments.
- A card shows reviewer name, element context, full text, a tick beside close, and readable contrast over light or dark prototypes.
- Marking a comment done removes its active page marker but never deletes it. Keep it in the inbox with a clear `Done` state. The same tick reopens it, restores its marker, and returns it to the feedback work queue.
- Put a compact trash action immediately before each inbox status. Require explicit confirmation before permanently deleting the comment from shared storage.
- Order inbox comments newest first and show a compact local timestamp beside the reviewer name. Represent Done with a quiet green check rather than repeating the word on every row; retain the full Done label for assistive technology.
- Review controls must contain their clicks and pointer events. Marking Done or reopening must never trigger the host prototype's navigation, submission, click-away behavior, or page reload.
- Attach new comments to content, not only viewport coordinates. Markers, selections, pulse, and open cards follow document and nested-container scrolling. Opening an inbox item scrolls its target into view.
- Persist only a privacy-safe structural tag/sibling path with target-relative offsets plus normalized fallback coordinates. Never store page text, HTML, customer data, IDs, classes, or data attributes as the anchor.
- If a target no longer resolves, use the normalized fallback so legacy comments remain usable.

## Verification

Test Chrome dictation, typing takeover during microphone startup and active listening, the first typed character/edit landing without repetition, already-visible transcript preservation, click/caret movement without accidental takeover, paste/cut/drop and input-method composition takeover, a forced test-only fallback, microphone denied/unavailable, repeated appended dictation, long transcript scrolling, first-time name focus, long comment display, colored initials, done history, modal scope, content-following during document and nested scrolling, inbox return, and cross-browser-context persistence. Remove any diagnostic override before generating reviewer links.
