export async function acceptNodeBranding(page) {
  // Regression: foundation Button descendant SVG defaults shrank node artwork and moved it off center.
  const geometry = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.topology-node .graph-node')];
    return nodes.map(node => {
      const quota = node.querySelector('.agent-quota-icon');
      const platform = node.querySelector('.platform-icon');
      const artwork = platform?.querySelector('svg, img, .platform-mask');
      if (!platform || !artwork) throw new Error(`Missing node artwork: ${node.getAttribute('aria-label')}`);
      const frame = (quota ?? node).getBoundingClientRect(), mark = artwork.getBoundingClientRect();
      return {
        label: node.getAttribute('aria-label'), kind: quota ? 'agent' : 'source',
        ring: !!quota?.classList.contains('has-quota'),
        frameWidth: frame.width, frameHeight: frame.height, width: mark.width, height: mark.height,
        dx: mark.x + mark.width / 2 - frame.x - frame.width / 2,
        dy: mark.y + mark.height / 2 - frame.y - frame.height / 2,
      };
    });
  });
  for (const kind of ['agent', 'source']) {
    if (!geometry.some(node => node.kind === kind)) throw new Error(`Missing ${kind} node branding`);
  }
  for (const node of geometry) {
    // Node frames scale with topology geometry; control icon pixel sizes do not apply here.
    const minRatio = node.kind === 'agent' && node.ring ? .63 : .84;
    const maxRatio = node.kind === 'agent' && node.ring ? .67 : 1.02;
    const ratio = node.width / node.frameWidth;
    if (!node.frameWidth || ratio < minRatio || ratio > maxRatio || Math.abs(node.width - node.height) > 1 || Math.abs(node.dx) > .75 || Math.abs(node.dy) > .75) {
      throw new Error(`Node branding is undersized, clipped or off-center: ${JSON.stringify(node)}`);
    }
  }
  return geometry;
}
