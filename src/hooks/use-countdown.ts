"use client";

import { useCallback, useEffect, useState } from "react";

/** Counts down to zero once per second; `restart` resets it. */
export function useCountdown(initialSeconds = 0) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) return;

    const timer = setInterval(() => {
      setSeconds((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [seconds]);

  const restart = useCallback((next: number) => setSeconds(next), []);

  return { seconds, active: seconds > 0, restart };
}
