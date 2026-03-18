import {
  createElement,
  FileText,
  Files,
  Moon,
  Sun,
  Upload,
  Plus,
  Trash2,
  Settings,
  Link,
  BookOpen,
  PanelLeft,
  Check,
  Download,
  FolderInput,
  SquareX,
  ChevronsUp,
  ChevronsDown,
} from 'lucide'

const iconMap = {
  FileText,
  Files,
  Moon,
  Sun,
  Upload,
  Plus,
  Trash2,
  Settings,
  Link,
  BookOpen,
  PanelLeft,
  Check,
  Download,
  FolderInput,
  SquareX,
  ChevronsUp,
  ChevronsDown,
} as const

export type IconName = keyof typeof iconMap

export function icon(name: IconName, size = 16): SVGElement {
  const el = createElement(iconMap[name])
  el.setAttribute('width', String(size))
  el.setAttribute('height', String(size))
  return el
}
