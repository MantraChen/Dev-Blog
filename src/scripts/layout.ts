export {};
let cleanup = () => {};
document.addEventListener("astro:before-swap", () => cleanup());
function initializePage() {
  cleanup();
  const controller = new AbortController();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add("reveal-active");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0 });
  document.querySelectorAll(".reveal").forEach(element => observer.observe(element));
  const button = document.getElementById("scroll-top");
  const onScroll = () => {
    button?.classList.toggle("opacity-0", window.scrollY <= 300);
    button?.classList.toggle("pointer-events-none", window.scrollY <= 300);
  };
  window.addEventListener("scroll", onScroll, { passive: true, signal: controller.signal });
  button?.addEventListener("click", () => window.scrollTo({
    top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  }), { signal: controller.signal });
  onScroll();
  cleanup = () => { controller.abort(); observer.disconnect(); };
}
initializePage();
window.addEventListener("pageshow", event => { if (event.persisted) initializePage(); });
window.addEventListener("pagehide", () => cleanup());
