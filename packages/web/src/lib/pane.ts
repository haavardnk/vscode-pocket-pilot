import { createContext } from 'svelte';

export interface Pane {
  readonly element: HTMLElement | undefined;
}

export const [getPane, setPane] = createContext<Pane>();
