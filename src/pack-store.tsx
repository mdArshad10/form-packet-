import { create } from "zustand"

import {
  defaultSlots,
  fileTypeMatches,
  type PackCategory,
  type PackSlot,
  type SlotStatus,
} from "@/data"

type PackState = {
  category: PackCategory
  slots: PackSlot[]
  setCategory: (category: PackCategory) => void
  updateRequirement: (
    slotId: string,
    field: keyof PackSlot["requirement"],
    value: string | number,
  ) => void
  attachFile: (slotId: string, file: File) => void
  setStatus: (slotId: string, status: SlotStatus) => void
}

const packSessionKey = "formpack-pack-v0"

type PersistedPack = Pick<PackState, "category"> & {
  requirements: Record<string, PackSlot["requirement"]>
}

function readPersistedPack(): PersistedPack | null {
  try {
    const raw = sessionStorage.getItem(packSessionKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedPack>
    if (
      !parsed.category ||
      !["government", "job", "visa", "school", "other"].includes(
        parsed.category,
      ) ||
      !parsed.requirements
    ) {
      return null
    }
    const requirementsAreValid = defaultSlots.every((slot) => {
      const requirement = parsed.requirements?.[slot.id]
      return (
        requirement &&
        typeof requirement.format === "string" &&
        typeof requirement.maxSizeKb === "number" &&
        typeof requirement.dimensions === "string" &&
        typeof requirement.filename === "string"
      )
    })
    if (!requirementsAreValid) return null
    return parsed as PersistedPack
  } catch {
    return null
  }
}

function persistPack(state: Pick<PackState, "category" | "slots">) {
  const requirements = Object.fromEntries(
    state.slots.map((slot) => [slot.id, slot.requirement]),
  )
  try {
    sessionStorage.setItem(
      packSessionKey,
      JSON.stringify(
        { category: state.category, requirements } satisfies PersistedPack,
      ),
    )
  } catch {
    // The pack remains usable when storage is unavailable or full.
  }
}

const persisted = readPersistedPack()

export const usePack = create<PackState>((set) => ({
  category: persisted?.category ?? "government",
  slots: defaultSlots.map((slot) => ({
    ...slot,
    requirement: persisted?.requirements[slot.id] ?? slot.requirement,
  })),
  setCategory: (category) => set({ category }),
  updateRequirement: (slotId, field, value) =>
    set((state) => ({
      slots: state.slots.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              requirement: { ...slot.requirement, [field]: value },
            }
          : slot,
      ),
    })),
  attachFile: (slotId, file) =>
    set((state) => ({
      slots: state.slots.map((slot) => {
        if (slot.id !== slotId) return slot

        const maxBytes = slot.requirement.maxSizeKb * 1024
        const sizeMatches = file.size > 0 && file.size <= maxBytes
        const formatMatches = fileTypeMatches(
          slot.requirement.format,
          file.type,
        )

        return {
          ...slot,
          source: { name: file.name, size: file.size, type: file.type, file },
          status: formatMatches && sizeMatches ? "check" : "not-ready",
        }
      }),
    })),
  setStatus: (slotId, status) =>
    set((state) => ({
      slots: state.slots.map((slot) =>
        slot.id === slotId ? { ...slot, status } : slot,
      ),
    })),
}))

usePack.subscribe((state) => persistPack(state))
persistPack(usePack.getState())
