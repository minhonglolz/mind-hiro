import type { MindMapFile } from '../shared/types'

export interface AppState {
  files: MindMapFile[]
  currentFile: MindMapFile | null
  currentContent: string
  theme: 'dark' | 'light'
  searchQuery: string
  isEditorVisible: boolean
  localFileNames: Set<string>
}

type EventMap = {
  'file:select': MindMapFile
  'content:change': string
  'theme:toggle': void
  'search:change': string
  'editor:toggle': void
  'node:click': string
}

type Handler<T> = T extends void ? () => void : (payload: T) => void

class EventBus {
  private listeners: { [K in keyof EventMap]?: Array<Handler<EventMap[K]>> } = {}

  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = []
    ;(this.listeners[event] as Array<Handler<EventMap[K]>>).push(handler)
  }

  emit<K extends keyof EventMap>(
    ...args: EventMap[K] extends void ? [K] : [K, EventMap[K]]
  ): void {
    const [event, payload] = args as [K, EventMap[K] | undefined]
    const handlers = this.listeners[event] as Array<Handler<EventMap[K]>> | undefined
    if (handlers) {
      for (const h of handlers) {
        if (payload !== undefined) {
          ;(h as (p: EventMap[K]) => void)(payload)
        } else {
          ;(h as () => void)()
        }
      }
    }
  }
}

export const bus = new EventBus()

export const state: AppState = {
  files: [],
  currentFile: null,
  currentContent: '',
  theme: 'light',
  searchQuery: '',
  isEditorVisible: true,
  localFileNames: new Set(),
}
