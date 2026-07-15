declare module 'd3-hierarchy' {
  export interface HierarchyNode<Datum> {
    data: Datum;
    x: number;
    y: number;
    descendants(): Array<HierarchyNode<Datum>>;
  }

  export interface TreeLayout<Datum> {
    (root: HierarchyNode<Datum>): HierarchyNode<Datum>;
    nodeSize(size: [number, number]): TreeLayout<Datum>;
  }

  export function hierarchy<Datum>(
    data: Datum,
    children?: (datum: Datum) => Iterable<Datum> | null | undefined,
  ): HierarchyNode<Datum>;

  export function tree<Datum>(): TreeLayout<Datum>;
}
