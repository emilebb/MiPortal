export function createNewsCardMedia(item, documentRef = document) {
  const element = (tag, className, text) => {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const wrapper = element('div', 'card-media');
  if (!item.image) {
    wrapper.append(element('span', 'card-media-mark', 'MP'));
    return wrapper;
  }

  const image = documentRef.createElement('img');
  image.src = item.image;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => {
    image.remove();
    wrapper.append(element('span', 'card-media-mark', 'MP'));
  }, { once: true });
  wrapper.append(image);
  return wrapper;
}
