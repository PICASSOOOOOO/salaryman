import {
  getGetPhoneInternalDirectoryQueryKey,
  useGetPhoneInternalDirectory,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";

export function usePhoneInternalDirectory() {
  const { user, isAuthenticated } = useAuth();
  return useGetPhoneInternalDirectory({
    query: {
      queryKey: [...getGetPhoneInternalDirectoryQueryKey(), user?.id ?? "anonymous"],
      enabled: isAuthenticated === true && Boolean(user?.id),
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    },
  });
}