import React from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { App } from "./App";
import "./styles.css";
const url = import.meta.env.VITE_CONVEX_URL;
createRoot(document.getElementById("root")!).render(<React.StrictMode>{url ? <ConvexProvider client={new ConvexReactClient(url)}><App /></ConvexProvider> : <App offline />}</React.StrictMode>);
