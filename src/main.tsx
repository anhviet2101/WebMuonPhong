import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";
import { PrototypeStoreProvider } from "../components/shared/prototype-store";
import { Toaster } from "sonner";
import { AuthProvider } from "../components/auth/auth-context";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PrototypeStoreProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
      <Toaster richColors position="top-right" />
    </PrototypeStoreProvider>
  </React.StrictMode>,
);
