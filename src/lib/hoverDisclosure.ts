// A short grace period lets the pointer cross the resizing native window safely,
// while optional hover-intent delay avoids accidental window resizes on brief pass-throughs.
export function createHoverDisclosure(
  expand: () => void,
  collapse: () => void,
  canCollapse: () => boolean,
  enterDelayMs = 0,
  leaveDelayMs = 350,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    enter() {
      cancel();
      if (enterDelayMs > 0) {
        timer = setTimeout(() => {
          timer = undefined;
          expand();
        }, enterDelayMs);
      } else {
        expand();
      }
    },
    leave() {
      cancel();
      const close = () => {
        if (canCollapse()) collapse();
        else timer = setTimeout(close, leaveDelayMs);
      };
      timer = setTimeout(close, leaveDelayMs);
    },
    cancel,
  };
}

