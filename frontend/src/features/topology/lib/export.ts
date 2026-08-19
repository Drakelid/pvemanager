import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';

const MAX_SIDE = 4096;

/**
 * Saves the graph as an image.
 *
 * Custom nodes are HTML, so a native SVG serialisation is impossible — the SVG
 * variant wraps the markup in `<foreignObject>`, which browsers render fine but
 * vector editors only partially. PNG is the default for that reason.
 *
 * The capture always covers the whole graph rather than the current viewport,
 * which is what people expect from an export button.
 */
export async function exportGraph(
  nodes: Node[],
  format: 'png' | 'svg',
  filename: string,
): Promise<void> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport || nodes.length === 0) return;

  const bounds = getNodesBounds(nodes);
  const padding = 40;
  // Size the canvas to the graph itself, not an arbitrary minimum - forcing a
  // larger canvas than the content needs a zoom above the 2x cap to fill it,
  // so small graphs end up tiny in a mostly-empty image.
  const width = Math.min(MAX_SIDE, Math.max(1, Math.round(bounds.width + padding * 2)));
  const height = Math.min(MAX_SIDE, Math.max(1, Math.round(bounds.height + padding * 2)));
  // getViewportForBounds's padding is a fraction of width/height unless given
  // as a "px" string - a bare number here (e.g. 40) is read as 4000% padding,
  // which collapses the zoom to the floor and leaves the graph tiny.
  const transform = getViewportForBounds(bounds, width, height, 0.2, 2, `${padding}px`);

  const background =
    getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || '#0a0a0a';

  const options = {
    backgroundColor: background,
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
    },
    // Controls and the minimap are UI chrome, not part of the diagram.
    filter: (element: HTMLElement) =>
      !element?.classList?.contains?.('react-flow__minimap') &&
      !element?.classList?.contains?.('react-flow__controls') &&
      !element?.dataset?.exportIgnore,
    cacheBust: true,
    pixelRatio: format === 'png' ? 2 : 1,
  };

  const dataUrl = format === 'png' ? await toPng(viewport, options) : await toSvg(viewport, options);

  const link = document.createElement('a');
  link.download = `${filename}.${format}`;
  link.href = dataUrl;
  link.click();
}
