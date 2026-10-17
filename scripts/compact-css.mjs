import CleanCSS from 'clean-css';
export function compactCss(source) {
  const result = new CleanCSS({
    inline: false, rebase: false,
    level: 0
  }).minify(source);
  if (result.errors.length || result.warnings.length) {
    throw new Error(`CSS build rejected: ${[...result.errors, ...result.warnings].join('; ')}`);
  }
  return result.styles;
}
