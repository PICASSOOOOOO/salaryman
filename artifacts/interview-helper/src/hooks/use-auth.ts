import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";
import { sanitizeReturnPath } from "@/lib/safe-path";

export interface AuthUser {
  id: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function appPath(path: string) {
  return `${basePath}${path}`;
}

export function useAuth() {
  const { user: clerkUser, isLoaded } = useUser();
  const { isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const user = clerkUser
    ? {
        id: clerkUser.externalId ?? clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        profileImageUrl: clerkUser.imageUrl,
      }
    : null;

  return {
    user: user as AuthUser | null,
    isLoading: !isLoaded,
    isAuthenticated: !!isSignedIn,
    login: (returnTo?: string) => {
      const safeReturnTo = sanitizeReturnPath(returnTo) ?? "/";
      window.location.assign(
        `${appPath("/sign-in")}?returnTo=${encodeURIComponent(safeReturnTo)}`,
      );
    },
    logout: () => signOut({ redirectUrl: basePath || "/" }),
  };
}