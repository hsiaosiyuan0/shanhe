/** Background place names yield to interactive notes and story locations. */
export function declutterLabels(container: HTMLElement) {
  const occupied = Array.from(
    container.querySelectorAll<HTMLElement>('.annotation-pin, .event-pin, .journey-stop'),
    (element) => element.getBoundingClientRect(),
  );
  const labels = Array.from(
    container.querySelectorAll<HTMLElement>('.admin-label, .geo-label, .landform-label'),
    (element) => ({ element, bounds: element.getBoundingClientRect() }),
  );
  // Read all bounds before changing visibility; hidden labels keep their geometry.
  for (const { element, bounds } of labels) {
    const obscured = occupied.some(
      (other) =>
        bounds.left < other.right + 3 &&
        bounds.right > other.left - 3 &&
        bounds.top < other.bottom + 3 &&
        bounds.bottom > other.top - 3,
    );
    element.classList.toggle('map-label-obscured', obscured);
  }
}
