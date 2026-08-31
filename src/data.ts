export type PackCategory = "government" | "job" | "visa" | "school" | "other"
export type SlotKind = "photo" | "signature" | "pdf"
export type SlotStatus = "not-started" | "check" | "ready" | "not-ready"

export type FileRequirement = {
  format: string
  maxSizeKb: number
  dimensions: string
  filename: string
}

export type PackSlot = {
  id: string
  name: string
  kind: SlotKind
  status: SlotStatus
  requirement: FileRequirement
  source?: {
    name: string
    size: number
    type: string
    file?: File
  }
}

export const categories: Array<{
  id: PackCategory
  label: string
  description: string
}> = [
  {
    id: "government",
    label: "Government or exam",
    description: "Recruitment, entrance tests, and public-service forms",
  },
  {
    id: "job",
    label: "Job application",
    description: "Employer portals and recruitment profiles",
  },
  {
    id: "visa",
    label: "Visa or passport",
    description: "Travel and identity application portals",
  },
  {
    id: "school",
    label: "School or college",
    description: "Admissions, scholarships, and student records",
  },
  {
    id: "other",
    label: "Something else",
    description: "Use a general, editable application pack",
  },
]

export const defaultSlots: PackSlot[] = [
  {
    id: "photo",
    name: "Photo",
    kind: "photo",
    status: "not-started",
    requirement: {
      format: "JPG",
      maxSizeKb: 200,
      dimensions: "3.5 × 4.5 cm portrait",
      filename: "photo.jpg",
    },
  },
  {
    id: "signature",
    name: "Signature",
    kind: "signature",
    status: "not-started",
    requirement: {
      format: "JPG",
      maxSizeKb: 100,
      dimensions: "3:1 landscape",
      filename: "signature.jpg",
    },
  },
  {
    id: "certificate",
    name: "Certificate PDF",
    kind: "pdf",
    status: "not-started",
    requirement: {
      format: "PDF",
      maxSizeKb: 1024,
      dimensions: "Up to 10 pages",
      filename: "certificate.pdf",
    },
  },
]

export const packSteps = [
  { label: "Requirements", to: "/prepare/requirements" },
  { label: "Add files", to: "/prepare/files" },
  { label: "Fix", to: "/prepare/files" },
  { label: "Check", to: "/prepare/check" },
  { label: "Download", to: "/prepare/download" },
] as const

export const quickTools = [
  {
    title: "Reduce image size",
    description: "Fit an image under a file-size limit.",
    to: "/quick-tools/image-size",
  },
  {
    title: "Set image dimensions",
    description: "Resize an image to exact pixel dimensions.",
    to: "/quick-tools/image-dimensions",
  },
  {
    title: "Prepare a signature",
    description: "Crop and clean up a signature image.",
    to: "/quick-tools/signature",
  },
  {
    title: "Reduce PDF size",
    description: "Fit a PDF under a portal limit.",
    to: "/quick-tools/pdf-size",
  },
] as const

const acceptedMimeTypes: Record<string, string[]> = {
  JPG: ["image/jpeg"],
  PNG: ["image/png"],
  WebP: ["image/webp"],
  PDF: ["application/pdf"],
}

export function fileTypeMatches(format: string, fileType: string) {
  return acceptedMimeTypes[format]?.includes(fileType) ?? false
}

export function requirementIsComplete(requirement: FileRequirement) {
  return (
    requirement.maxSizeKb > 0 &&
    requirement.dimensions.trim().length > 0 &&
    requirement.filename.trim().length > 0
  )
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
