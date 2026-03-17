import { createContext, useContext, useState, type ReactNode } from 'react';

interface NavBarVisibilityContextValue {
  hideNavBar: boolean;
  setHideNavBar: (hide: boolean) => void;
}

const NavBarVisibilityContext = createContext<NavBarVisibilityContextValue>({
  hideNavBar: false,
  setHideNavBar: () => {},
});

export function NavBarVisibilityProvider({ children }: { children: ReactNode }) {
  const [hideNavBar, setHideNavBar] = useState(false);
  return (
    <NavBarVisibilityContext.Provider value={{ hideNavBar, setHideNavBar }}>
      {children}
    </NavBarVisibilityContext.Provider>
  );
}

export function useNavBarVisibility() {
  return useContext(NavBarVisibilityContext);
}
