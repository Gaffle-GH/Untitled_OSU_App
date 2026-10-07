import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { Toaster } from "./app/components/ui/sonner";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <Toaster position="bottom-center" richColors closeButton theme="dark" />
  </>,
);
