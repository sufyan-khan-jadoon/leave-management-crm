"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiClientError, apiClient } from "@/lib/api-client";

type State<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

/**
 * Fetches a JSON resource and re-fetches whenever `path` changes.
 *
 * Responses from superseded requests are discarded so a slow earlier fetch
 * cannot overwrite the result of a newer one.
 */
export function useApiResource<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: Boolean(path) });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return;
    }

    const id = ++requestId.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const data = await apiClient.get<T>(path);
      if (id === requestId.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id !== requestId.current) return;

      const message =
        error instanceof ApiClientError ? error.message : "Something went wrong. Please try again.";
      setState({ data: null, error: message, loading: false });
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load };
}
