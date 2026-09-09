export interface Character {
  id: string;
  name: string;
  theme: string;
  /** Sub-category within a theme (e.g. the source anime), used to let the host filter further. */
  series?: string;
  tags: string[];
}
