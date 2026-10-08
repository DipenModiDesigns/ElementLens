export type Sides = [top: number, right: number, bottom: number, left: number];

export interface BoxModel {
  /** Content box size. */
  width: number;
  height: number;
  padding: Sides;
  border: Sides;
  margin: Sides;
  position: string;
  boxSizing: string;
  display: string;
}

type StyleSource = Pick<CSSStyleDeclaration, 'getPropertyValue'>;

const num = (v: string) => Math.round((parseFloat(v) || 0) * 100) / 100;

/** Box model numbers from computed styles and the border-box size (getBoundingClientRect). */
export function boxModel(styles: StyleSource, borderBox: { width: number; height: number }): BoxModel {
  const sides = (prefix: string, suffix = ''): Sides =>
    ['top', 'right', 'bottom', 'left'].map((s) => num(styles.getPropertyValue(`${prefix}-${s}${suffix}`))) as Sides;
  const padding = sides('padding');
  const border = sides('border', '-width');
  return {
    width: num(String(Math.max(0, borderBox.width - padding[1] - padding[3] - border[1] - border[3]))),
    height: num(String(Math.max(0, borderBox.height - padding[0] - padding[2] - border[0] - border[2]))),
    padding,
    border,
    margin: sides('margin'),
    position: styles.getPropertyValue('position'),
    boxSizing: styles.getPropertyValue('box-sizing'),
    display: styles.getPropertyValue('display'),
  };
}
