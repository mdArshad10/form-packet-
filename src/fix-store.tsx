import { create } from "zustand"

export type FixFormat = "JPG" | "PNG" | "PDF"

export type FixDraft = {
  reason: string
  format: FixFormat
  minKb: string
  maxKb: string
  dimensions: string
  filename: string
  source?: {
    name: string
    size: number
    type: string
    file: File
  }
}

type FixState = {
  draft: FixDraft
  updateDraft: (changes: Partial<FixDraft>) => void
  attachFile: (file: File) => void
  reset: () => void
}

const initialDraft: FixDraft = {
  reason: "",
  format: "JPG",
  minKb: "",
  maxKb: "",
  dimensions: "",
  filename: "",
}

export const useFix = create<FixState>((set) => ({
  draft: initialDraft,
  updateDraft: (changes) =>
    set((state) => ({ draft: { ...state.draft, ...changes } })),
  attachFile: (file) =>
    set((state) => ({
      draft: {
        ...state.draft,
        source: {
          name: file.name,
          size: file.size,
          type: file.type,
          file,
        },
      },
    })),
  reset: () => set({ draft: initialDraft }),
}))
