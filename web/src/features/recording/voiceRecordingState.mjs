/**
 * @template T
 * @param {T | null} current
 * @param {T} candidate
 */
export function isCurrentRecognition(current, candidate) {
  return current === candidate;
}

/**
 * @param {boolean} required
 * @param {boolean} approved
 * @param {boolean} busy
 */
export function makeVoiceReviewState(required, approved, busy) {
  return {
    required,
    approved: required && approved && !busy,
    busy,
  };
}

/** @param {{ required: boolean, approved: boolean, busy: boolean }} review */
export function isVoiceReviewComplete(review) {
  return !review.busy && (!review.required || review.approved);
}
