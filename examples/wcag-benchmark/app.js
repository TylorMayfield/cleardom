const trap = document.querySelector("[data-case='2.1.2']");
const timeoutWarning = document.querySelector("[data-case='2.2.1'] .timeout-warning");
const moving = document.querySelector("[data-case='2.2.2'] .moving");
const contextSelect = document.querySelector("[data-case='3.2.2'] select");

if (trap) {
  trap.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      trap.querySelector("button")?.focus();
    }
  });
}

setTimeout(() => {
  if (timeoutWarning) {
    timeoutWarning.textContent = "Session expired. Form values were discarded.";
  }
}, 3000);

moving?.addEventListener("click", () => {
  moving.classList.toggle("moving");
});

contextSelect?.addEventListener("change", () => {
  window.location.hash = "changed-without-warning";
});
