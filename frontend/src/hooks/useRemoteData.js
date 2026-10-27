import { useCallback, useEffect, useState } from "react";

export function useRemoteData(loader, dependencies = []) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await loader();
      setData(result);
      return result;
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  // Callers pass stable loader closures and explicit dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");
    loader()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  // Loader inputs are represented by dependencies by design.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return { data, setData, isLoading, error, refresh };
}
