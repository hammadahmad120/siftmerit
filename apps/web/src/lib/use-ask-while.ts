"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Asks the API again and again while something is unfinished, for example
 * while a draft is running. This is polling: the page asks "done yet?" every
 * few seconds. It is kept in this one file so that it can later be swapped
 * for a push from the server without touching the screens.
 *
 * `ask` makes one call and deals with its answer itself. It answers `true`
 * to be asked again and `false` to stop for good (the sign-in has ended, or
 * the thing asked about is gone). It should not throw; if it does, that try
 * counts as failed and the asking goes on.
 *
 * Every way the asking stops:
 *
 * - `active` turns false: the work is finished, so there is nothing to ask.
 * - The page is left: the timer is cleared, and an answer still on its way
 *   starts nothing new.
 * - `ask` answers `false`.
 * - `giveUpAfterMs` has passed and the work is still unfinished: `gaveUp`
 *   turns true and the asking stops, so a worker that is not running does
 *   not make the page ask for ever. `restart` starts a new round.
 *
 * And two ways it holds back without stopping:
 *
 * - The tab is in the background: nothing is asked. It asks once at the
 *   moment the tab is shown again.
 * - A call is slow: the wait of `everyMs` counts from the moment the answer
 *   arrives, so calls never pile up and never arrive in the wrong order.
 */
export function useAskWhile(options: {
  active: boolean;
  ask: () => Promise<boolean>;
  everyMs: number;
  giveUpAfterMs: number;
}): { gaveUp: boolean; restart: () => void } {
  const { active, ask, everyMs, giveUpAfterMs } = options;

  // A round is one stretch of asking. `restart` begins a new one, which also
  // takes back a "gave up": that is remembered by the number of its round.
  const [round, setRound] = useState(0);
  const [gaveUpRound, setGaveUpRound] = useState<number | null>(null);
  const gaveUp = gaveUpRound === round;

  // The newest `ask` is kept here, so a new function from the screen does not
  // start the timer again.
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  }, [ask]);

  useEffect(() => {
    if (!active || gaveUp) return;

    let left = false;
    let asking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    function waitThenAsk() {
      timer = setTimeout(() => {
        timer = undefined;
        void askOnce();
      }, everyMs);
    }

    async function askOnce() {
      // In the background nothing is asked. `onShown` below asks when the tab returns.
      if (left || asking || document.hidden) return;

      asking = true;
      let again = true;
      try {
        again = await askRef.current();
      } catch {
        // Counted as a failed try. The asking goes on.
      } finally {
        asking = false;
      }
      if (left || !again) return;

      // Looked at after an answer, never before: a tab that returns after a
      // long time first asks once, and may find the work finished.
      if (Date.now() - startedAt >= giveUpAfterMs) {
        setGaveUpRound(round);
        return;
      }
      waitThenAsk();
    }

    function onShown() {
      // Only when the asking is paused: no call on its way and no timer set.
      if (document.hidden || asking || timer !== undefined) return;
      void askOnce();
    }

    document.addEventListener("visibilitychange", onShown);
    waitThenAsk();

    return () => {
      left = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShown);
    };
  }, [active, gaveUp, round, everyMs, giveUpAfterMs]);

  const restart = useCallback(() => setRound((current) => current + 1), []);

  return { gaveUp, restart };
}
