export interface MindMapFile {
  name: string
  content: string
  /** Relative subfolder path from the scan root, e.g. 'sprint1' or 'sprint1/backend'. Absent for root-level files. */
  folder?: string
}
