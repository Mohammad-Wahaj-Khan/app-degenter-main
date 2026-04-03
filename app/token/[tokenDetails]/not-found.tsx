"use client";

import NotFoundPage from "../../not-found";

// Reuse the global 404 UI for /token/* not found cases
export default function TokenNotFound() {
  return <NotFoundPage />;
}
