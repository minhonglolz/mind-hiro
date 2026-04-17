export interface MindMapFile {
  name: string
  content: string
  /** Relative subfolder path from the scan root, e.g. 'sprint1' or 'sprint1/backend'. Absent for root-level files. */
  folder?: string
}

export interface MindHiroConfig {
  /** Line prefixes (applied to heading/list text) that should be hidden from the mind map. e.g. ["!"] */
  hidePrefix?: string[]
}
