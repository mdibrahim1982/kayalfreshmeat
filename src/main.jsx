import React, { Suspense, useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { trackPageView } from "./analytics.js";

// Admin dashboard lives at  <site>/#admin  (loaded only when needed, so the shop stays light)
const AdminAnalytics = React.lazy(() => import("./AdminAnalytics.jsx"));
const isAdminRoute = () => /^#\/?admin/i.test(window.location.hash);

// One page view per page load (admin visits are not counted)
if (!isAdminRoute()) trackPageView();

function Root() {
  const [admin, setAdmin] = useState(isAdminRoute());
  useEffect(() => {
    const onHash = () => setAdmin(isAdminRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return admin ? <Suspense fallback={null}><AdminAnalytics /></Suspense> : <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
