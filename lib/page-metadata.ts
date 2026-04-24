"use client";

const ensureMeta = (
  key: string,
  attr: "name" | "property",
  content: string
) => {
  if (typeof document === "undefined") return;
  let tag = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

export const buildPageTitle = (pageName: string, appName = "Degenter.io") =>
  `${pageName} | ${appName}`;

export const applyPageMetadata = ({
  pageName,
  description,
  appName = "Degenter.io",
}: {
  pageName: string;
  description?: string;
  appName?: string;
}) => {
  if (typeof document === "undefined" || !pageName) return;

  const title = buildPageTitle(pageName, appName);
  const resolvedDescription =
    description || `${pageName} on ${appName}.`;

  document.title = title;
  ensureMeta("description", "name", resolvedDescription);
  ensureMeta("og:title", "property", title);
  ensureMeta("og:description", "property", resolvedDescription);
  ensureMeta("twitter:title", "name", title);
  ensureMeta("twitter:description", "name", resolvedDescription);
};
