import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const SignInContext = createContext();

export function SignInProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);

  return (
    <SignInContext value={value}>
      {children}
    </SignInContext>
  );
}

export function useSignIn() {
  return useContext(SignInContext);
}
