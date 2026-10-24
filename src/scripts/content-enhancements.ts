// Progressive enhancement: source code and ordinary images still work without JS.
let diagramId = 0;
let renderQueue = Promise.resolve();
const seen = new WeakSet<Element>();
let lightbox: HTMLDialogElement | undefined;
let previousFocus: HTMLElement | null = null;

function zoom(image: HTMLImageElement) {
  if (!lightbox) {
    lightbox = document.createElement("dialog");
    lightbox.className = "image-lightbox";
    lightbox.setAttribute("aria-label", "Image preview");
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close ×";
    close.addEventListener("click", () => lightbox!.close());
    lightbox.append(
      close,
      document.createElement("img"),
      document.createElement("p"),
    );
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) lightbox!.close();
    });
    lightbox.addEventListener("close", () => previousFocus?.focus());
    document.body.append(lightbox);
  }
  previousFocus = document.activeElement as HTMLElement;
  const preview = lightbox.querySelector("img")!;
  preview.src = image.currentSrc || image.src;
  preview.alt = image.alt;
  lightbox.querySelector("p")!.textContent = image.alt;
  lightbox.showModal();
}

function enhance(root: ParentNode) {
  root.querySelectorAll<HTMLImageElement>(".prose img").forEach((image) => {
    if (seen.has(image) || image.closest("a")) return;
    seen.add(image);
    image.classList.add("zoomable-image");
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute(
      "aria-label",
      `Enlarge image: ${image.alt || "article image"}`,
    );
    image.addEventListener("click", () => zoom(image));
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        zoom(image);
      }
    });
  });
  root.querySelectorAll<HTMLElement>(".prose pre").forEach((pre) => {
    if (seen.has(pre)) return;
    seen.add(pre);
    const code = pre.querySelector("code");
    if (!code) return;
    if (!pre.querySelector(".copy-btn")) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "copy-btn";
      copy.textContent = "Copy";
      copy.setAttribute("aria-label", "Copy code");
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code.textContent || "");
          copy.textContent = "Copied!";
        } catch {
          copy.textContent = "Copy unavailable";
        }
        setTimeout(() => {
          copy.textContent = "Copy";
        }, 1500);
      });
      pre.append(copy);
    }
    if (!code.classList.contains("language-mermaid")) return;
    const source = code.textContent || "";
    const result = document.createElement("div");
    result.className = "mermaid-diagram";
    result.setAttribute("role", "img");
    result.setAttribute("aria-label", "Mermaid diagram");
    pre.before(result);
    // Configuration directives are intentionally excluded from authored diagrams.
    if (source.length > 10_000 || /^\s*---|%%\s*\{/m.test(source)) {
      result.textContent =
        "Diagram exceeds limits or contains configuration. Source is shown below.";
      return;
    }
    const render = () => {
      renderQueue = renderQueue.then(async () => {
        if (!pre.isConnected) return;
        try {
          const [{ default: mermaid }, { default: purify }] = await Promise.all(
            [import("mermaid"), import("dompurify")],
          );
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            htmlLabels: false,
            maxTextSize: 10_000,
            maxEdges: 200,
            suppressErrorRendering: true,
            theme: "neutral",
          });
          const rendered = await mermaid.render(
            `content-diagram-${++diagramId}`,
            source,
          );
          if (!pre.isConnected) return;
          result.innerHTML = purify.sanitize(rendered.svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
            FORBID_TAGS: ["foreignObject", "script", "a", "image"],
            FORBID_ATTR: ["href", "xlink:href"],
          });
          // Keep labels legible on narrow screens; the wrapper scrolls instead of
          // shrinking a wide architecture diagram into unreadable text.
          const svg = result.querySelector("svg");
          if (svg?.viewBox.baseVal.width) {
            svg.style.width = `${svg.viewBox.baseVal.width}px`;
            svg.style.maxWidth = "none";
            result.tabIndex = 0;
            result.setAttribute(
              "aria-label",
              "Mermaid diagram; scroll horizontally to view wide diagrams",
            );
          }
          const details = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = "Diagram source";
          pre.before(details);
          details.append(summary, pre);
        } catch {
          result.textContent =
            "Unable to render this diagram. Source is shown below.";
        }
      });
    };
    // Fetch diagram engines only when a diagram is near the viewport. Large
    // authored graphs need an explicit click so scrolling never starts heavy work.
    const load = document.createElement("button");
    load.type = "button";
    load.className = "rounded border px-3 py-2 text-sm";
    load.textContent = "Render diagram";
    result.append(load);
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      load.remove();
      render();
    };
    load.addEventListener("click", start, { once: true });
    if (source.length <= 4000 && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            start();
          }
        },
        { rootMargin: "200px" },
      );
      observer.observe(result);
    }
  });
}
enhance(document);
// React previews replace their HTML after hydration and after each saved edit.
let queued = false;
const observer = new MutationObserver((records) => {
  if (
    queued ||
    !records.some((record) =>
      [...record.addedNodes].some(
        (node) =>
          node instanceof Element &&
          (node.matches(".prose") || node.querySelector(".prose, pre, img")),
      ),
    )
  )
    return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    enhance(document);
  });
});
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener("pagehide", () => {
  observer.disconnect();
  lightbox?.close();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    enhance(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }
});
