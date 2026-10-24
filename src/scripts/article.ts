export {};
let cleanup = () => {};
document.addEventListener("astro:before-swap", () => cleanup());
document.addEventListener("astro:page-load", () => {
  cleanup();
  const article = document.querySelector<HTMLElement>("[data-post-slug]");
  if (!article) return;
  const controller = new AbortController();
  const { signal } = controller;
  const observers: (IntersectionObserver | MutationObserver)[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  const bar = document.getElementById("reading-progress");
  const updateProgress = () => {
    const height = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.width = `${height > 0 ? scrollY / height * 100 : 0}%`;
  };
  window.addEventListener("scroll", updateProgress, { passive: true, signal });
  window.addEventListener("resize", updateProgress, { signal });
  updateProgress();

  article.querySelectorAll(".prose pre").forEach(pre => {
    if (pre.querySelector(".copy-btn")) return;
    const button = document.createElement("button");
    button.className = "copy-btn";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy code");
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector("code")?.textContent || "");
        button.textContent = "Copied!";
      } catch { button.textContent = "Copy unavailable"; }
      timers.push(setTimeout(() => { button.textContent = "Copy"; }, 1500));
    }, { signal });
    pre.appendChild(button);
  });

  const links = [...document.querySelectorAll<HTMLAnchorElement>(".toc-link")];
  const headingObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      links.forEach(link => {
        const active = link.dataset.slug === entry.target.id;
        link.classList.toggle("text-foreground", active);
        link.classList.toggle("font-medium", active);
        if (active) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current");
      });
    }
  }, { rootMargin: "-80px 0px -60% 0px" });
  links.forEach(link => { const heading = document.getElementById(link.dataset.slug!); if (heading) headingObserver.observe(heading); });
  observers.push(headingObserver);

  const drawer = document.querySelector<HTMLDialogElement>("#toc-drawer");
  const openButton = document.getElementById("mobile-toc-btn");
  openButton?.addEventListener("click", () => {
    drawer?.showModal();
    document.body.style.overflow = "hidden";
    openButton.setAttribute("aria-expanded", "true");
  }, { signal });
  drawer?.addEventListener("close", () => {
    document.body.style.overflow = "";
    openButton?.setAttribute("aria-expanded", "false");
  }, { signal });
  document.getElementById("toc-close-btn")?.addEventListener("click", () => drawer?.close(), { signal });
  drawer?.querySelectorAll("a").forEach(link => link.addEventListener("click", () => drawer.close(), { signal }));
  drawer?.addEventListener("click", event => {
    const rect = drawer.getBoundingClientRect();
    if (event.target === drawer && (event.clientY < rect.top || event.clientY > rect.bottom)) drawer.close();
  }, { signal });

  const container = document.getElementById("giscus-container");
  const getTheme = () => document.documentElement.classList.contains("dark") ? "dark" : "light";
  if (container) {
    container.replaceChildren();
    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    const settings = { repo: "MantraChen/Dev-Blog", "repo-id": "R_kgDORxxsSQ", category: "Announcements",
      "category-id": "DIC_kwDORxxsSc4C5bq6", mapping: "pathname", strict: "1", "reactions-enabled": "1",
      "emit-metadata": "0", "input-position": "top", theme: getTheme(), lang: "zh-CN", loading: "lazy" };
    Object.entries(settings).forEach(([key, value]) => script.setAttribute(`data-${key}`, value));
    script.crossOrigin = "anonymous";
    script.async = true;
    container.appendChild(script);
    const observer = new MutationObserver(() => {
      container.querySelector<HTMLIFrameElement>("iframe.giscus-frame")?.contentWindow?.postMessage(
        { giscus: { setConfig: { theme: getTheme() } } }, "https://giscus.app");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    observers.push(observer);
  }
  cleanup = () => {
    drawer?.close();
    document.body.style.overflow = "";
    controller.abort();
    observers.forEach(observer => observer.disconnect());
    timers.forEach(clearTimeout);
  };
});
