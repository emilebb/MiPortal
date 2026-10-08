import assert from 'node:assert/strict';
import test from 'node:test';

import { createNewsCardMedia } from '../js/news-page-media.mjs';
import { createArticleImage, createRelatedImage } from '../js/news-detail-media.mjs';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.classList = {
      add: (name) => {
        if (!this.className.split(/\s+/).includes(name)) this.className = `${this.className} ${name}`.trim();
      }
    };
  }

  append(node) {
    node.parentNode = this;
    this.children.push(node);
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  remove() {
    this.removed = true;
    this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1);
  }

  dispatch(type) {
    this.listeners[type]?.();
  }
}

const fakeDocument = { createElement: (tagName) => new FakeElement(tagName) };

test('news card keeps a valid small image, falls back on error, and handles a missing URL', () => {
  const source = 'https://images.example.test/story.jpg';
  const media = createNewsCardMedia({ image: source }, fakeDocument);
  const image = media.children[0];
  image.naturalWidth = 120;
  image.dispatch('load');

  assert.equal(image.src, source);
  assert.equal(image.removed, undefined);
  assert.equal(media.children[0], image);

  image.dispatch('error');
  assert.equal(image.removed, true);
  assert.equal(media.children.length, 1);
  assert.equal(media.children[0].className, 'card-media-mark');

  const withoutImage = createNewsCardMedia({ image: null }, fakeDocument);
  assert.equal(withoutImage.children.length, 1);
  assert.equal(withoutImage.children[0].className, 'card-media-mark');
});

test('main article image keeps a valid small image and swaps to the fallback only on error', () => {
  const source = 'https://images.example.test/article.jpg';
  const fallback = 'og-image.svg';
  const image = createArticleImage(source, fallback, fakeDocument);
  image.naturalWidth = 119;
  image.dispatch('load');

  assert.equal(image.src, source);
  assert.equal(image.className, 'news-detail-image');

  image.dispatch('error');
  assert.equal(image.src, fallback);
  assert.equal(image.className, 'news-detail-image news-detail-image--fallback');

  const withoutImage = createArticleImage(null, fallback, fakeDocument);
  assert.equal(withoutImage.src, fallback);
  assert.equal(withoutImage.className, 'news-detail-image news-detail-image--fallback');
});

test('related image keeps a valid small image and swaps to the fallback only on error', () => {
  const source = 'https://images.example.test/related.jpg';
  const fallback = 'og-image.svg';
  const image = createRelatedImage(source, fallback, fakeDocument);
  image.naturalWidth = 120;
  image.dispatch('load');

  assert.equal(image.src, source);
  image.dispatch('error');
  assert.equal(image.src, fallback);

  assert.equal(createRelatedImage(null, fallback, fakeDocument).src, fallback);
});
