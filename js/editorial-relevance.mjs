// English "react" can be a verb in entertainment headlines, not the framework.
export function entertainmentReactCollision(text) {
  const value=String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /\breact\b/.test(value) && /\b(?:season|premiere|actor|actress|celebrity|imdb|twists)\b/.test(value) &&
    !/\b(?:javascript|typescript|jsx|tsx|hooks?|components?|frontend|framework|reactjs|reactdom)\b|react\s+\d/.test(value);
}
