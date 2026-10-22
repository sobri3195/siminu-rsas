import { createContext, useContext } from "react";
import type { User } from "../types";
export const AppContext = createContext<{
  user: User;
  run: (fn: () => Promise<unknown>, message: string) => Promise<void>;
}>({
  user: { id: "", name: "", role: "Admin Sistem", unitId: "", active: true },
  run: async () => {},
});
export const useApp = () => useContext(AppContext);
