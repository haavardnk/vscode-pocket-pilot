import { createContext } from 'svelte';
import type { Attachment } from 'svelte/attachments';

export interface Pane {
  readonly element: HTMLElement | undefined;
  readonly scroller: Attachment<HTMLElement>;
}

export const [getPane, setPane] = createContext<Pane>();
