"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps a message list pinned to its newest entry without moving the page.
 *
 * **`scrollIntoView` is what this exists to avoid.** Both chats used it on a
 * sentinel element at the foot of the list, and it walks *every* scrollable
 * ancestor — the bounded list, then the document — so each reply scrolled the
 * whole window as well as the transcript. The composer sits below the list, so
 * an administrator reaching for the input had the page jump under them as the
 * answer arrived, and opening the screen scrolled the header off the top before
 * anybody had typed anything.
 *
 * Setting `scrollTop` on the container cannot do that: it moves one element, and
 * the page stays exactly where the reader left it.
 *
 * **It only follows a reader who is already at the bottom.** Somebody scrolled up
 * re-reading an earlier answer is not asking to be dragged back down, and a chat
 * that yanks the view away mid-sentence is the same complaint as the page jump in
 * a smaller room. `NEAR_BOTTOM_PX` is the slack that makes "at the bottom" mean
 * what a reader means by it rather than an exact pixel.
 */
const NEAR_BOTTOM_PX = 80;

export function useStickToBottom<T extends HTMLElement>(deps: readonly unknown[]) {
  const ref = useRef<T>(null);
  // The first paint is a jump, not a follow: the list opens at its foot rather
  // than animating down to it while the reader watches.
  const settled = useRef(false);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;

    if (!settled.current) {
      settled.current = true;
      list.scrollTop = list.scrollHeight;
      return;
    }

    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (distance > NEAR_BOTTOM_PX) return;

    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
