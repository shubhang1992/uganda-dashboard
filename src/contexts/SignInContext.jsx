import { createContext, useContext, useState } from 'react';

const SignInContext = createContext();

export function SignInProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <SignInContext value={{ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }}>
      {children}
    </SignInContext>
  );
}

export function useSignIn() {
  return useContext(SignInContext);
}
