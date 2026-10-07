const TYPING = "textarea, input:not([type='checkbox'], [type='radio'], [type='range'])";

export function watchViewport(): () => void {
  const visual = window.visualViewport;
  if (!visual) return () => {};
  const style = document.documentElement.style;
  const clear = (): void => {
    style.removeProperty('--viewport-top');
    style.removeProperty('--viewport-height');
  };
  const update = (): void => {
    if (Math.abs(visual.scale - 1) > 0.01 || !document.activeElement?.matches(TYPING)) {
      clear();
      return;
    }
    style.setProperty('--viewport-top', `${visual.offsetTop}px`);
    style.setProperty('--viewport-height', `${visual.height}px`);
  };
  update();
  visual.addEventListener('resize', update);
  visual.addEventListener('scroll', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  return () => {
    visual.removeEventListener('resize', update);
    visual.removeEventListener('scroll', update);
    document.removeEventListener('focusin', update);
    document.removeEventListener('focusout', update);
    clear();
  };
}
