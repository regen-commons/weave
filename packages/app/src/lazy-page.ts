// A page whose code arrives in its own file, so a first visit downloads only the page it opens (Q-02).
// Unlike React.lazy, the page says whether its code is here yet and can fetch it ahead of time: the app
// fetches the first page before it draws anything, so the page it was sent as HTML (prerendered at build
// time) is replaced by the same page, never by a loading state, and it keeps the page on screen until
// the next one's code has arrived (App.tsx).
import { createElement, use, type ComponentType, type ReactElement } from "react";

export interface LazyPage<P extends object> {
  (props: P): ReactElement;
  /** Whether the page's code has arrived, so it draws without waiting. */
  readonly ready: () => boolean;
  /** Fetches the page's code once; a fetch that fails is tried again by the next call. */
  readonly preload: () => Promise<void>;
}

export function lazyPage<P extends object>(load: () => Promise<ComponentType<P>>): LazyPage<P> {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const fetchPage = (): Promise<ComponentType<P>> =>
    (pending ??= load().then(
      (component) => (loaded = component),
      (error: unknown) => {
        pending = undefined;
        throw error;
      },
    ));
  // Drawn before its code arrived only if something skipped `preload`: it then waits under the
  // nearest Suspense boundary instead of failing.
  const Page = (props: P): ReactElement => createElement(loaded ?? use(fetchPage()), props);
  return Object.assign(Page, {
    ready: () => loaded !== undefined,
    preload: () => fetchPage().then(() => undefined),
  });
}
