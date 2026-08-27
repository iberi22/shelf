import { writable } from 'svelte/store';
import BlogPage from '../pages/BlogPage.svelte';

export type RoutePath = '/' | '/nodes' | '/blog' | '/settings';

export const currentRoute = writable<RoutePath>('/blog');

export const router = {
  get currentPath(): RoutePath {
    let path: RoutePath = '/blog';
    currentRoute.subscribe(v => { path = v; })();
    return path;
  },
  navigate(path: RoutePath) {
    currentRoute.set(path);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
    }
  }
};

export const routes: Record<string, any> = {
  '/blog': BlogPage,
};
