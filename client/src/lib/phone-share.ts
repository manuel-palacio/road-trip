export type PhoneShareInput = {
  url: string;
  title: string;
  text?: string;
};

export type PhoneShareResult =
  | { kind: 'shared' }
  | { kind: 'copied' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; error: unknown };

/** Try the Web Share API first (mobile / Safari / Edge support it natively).
 * Fall back to clipboard copy on desktop browsers. Returns a tagged result
 * so the caller can show the right confirmation toast. */
export async function phoneShare(input: PhoneShareInput): Promise<PhoneShareResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: input.title, text: input.text, url: input.url });
      return { kind: 'shared' };
    } catch (err) {
      // AbortError = user dismissed the share sheet; treat as cancellation.
      if (err && (err as { name?: string }).name === 'AbortError') {
        return { kind: 'cancelled' };
      }
      // Fall through to clipboard copy on other share-API errors.
    }
  }
  try {
    await navigator.clipboard.writeText(input.url);
    return { kind: 'copied' };
  } catch (err) {
    return { kind: 'failed', error: err };
  }
}
