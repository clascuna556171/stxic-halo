// A short grace period lets the pointer cross the resizing native window safely.
export function createHoverDisclosure(expand: () => void, collapse: () => void, canCollapse: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  return {
    enter() { cancel(); expand(); },
    leave() {
      cancel();
      const close = () => {
        if (canCollapse()) collapse();
        else timer = setTimeout(close, 350);
      };
      timer = setTimeout(close, 350);
    },
    cancel,
  };
}
