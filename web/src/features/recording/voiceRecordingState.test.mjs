import assert from "node:assert/strict";
import test from "node:test";
import { isCurrentRecognition, isVoiceReviewComplete, makeVoiceReviewState } from "./voiceRecordingState.mjs";

test("a delayed end event cannot clear a newer recognition session", () => {
  const first = { id: "first" };
  const second = { id: "second" };
  let current = first;

  current = second;
  if (isCurrentRecognition(current, first)) current = null;

  assert.equal(current, second);
  assert.equal(isCurrentRecognition(current, second), true);
});

test("recording and stopping keep draft approval and saving blocked", () => {
  const listening = makeVoiceReviewState(false, false, true);
  const stopping = makeVoiceReviewState(true, true, true);

  assert.equal(isVoiceReviewComplete(listening), false);
  assert.equal(stopping.approved, false);
  assert.equal(isVoiceReviewComplete(stopping), false);
});

test("a no-content permission failure returns to button-only saving after end", () => {
  const afterEnd = makeVoiceReviewState(false, false, false);

  assert.deepEqual(afterEnd, { required: false, approved: false, busy: false });
  assert.equal(isVoiceReviewComplete(afterEnd), true);
});
