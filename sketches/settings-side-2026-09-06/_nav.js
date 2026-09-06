function settingsNav(panes) {
  const pane = document.querySelector(".pane");
  document.querySelectorAll(".side button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".side button").forEach((b) => b.classList.toggle("on", b === btn));
      pane.innerHTML = panes[btn.dataset.id];
    });
  });
}
