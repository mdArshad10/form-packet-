# PRD: Exam Form Photo & PDF Compressor

## 1. Problem Statement
Government exam applicants (SSC, Banking, Railway, State PSC, university admissions, etc.) must upload photos and PDFs within exact file-size ranges (e.g. "photo 20–50KB", "PDF 75–100KB"). Generic tools (iLovePDF, SmallPDF) compress *approximately* — not to a guaranteed range — causing repeated failed uploads and form rejections. Most users are non-technical and on budget Android phones with limited data.

## 2. Target Users
- Exam aspirants (SSC/Banking/Railway/State PSC/university), largely mobile-first, low-to-medium technical literacy, price/data-sensitive.

## 3. Goals (v1)
- Let a user hit an *exact* size range for a photo or PDF in under 2 minutes, with zero learning curve.
- Zero data leaves the user's device (privacy + zero server compute cost).
- No login, no install, no app-store dependency.

### Non-Goals (v1)
- No exam-specific presets (e.g. auto-fill "SSC CGL" spec) — generic manual input only.
- No batch/multi-file processing for the compressor tools.
- No HEIC or scan-to-PDF camera capture.
- No account system, no saved history.

## 4. Product Scope — Three Tools

### Tool A: Photo Compressor
**Inputs user controls:** target size range (min–max KB), target pixel dimensions (W×H), output format (JPEG/PNG).

**User flow:**
1. Land on `/photo-compressor`.
2. Upload a JPG/PNG (drag-drop or file picker).
3. See original preview + original size/dimensions.
4. Enter target size range, target dimensions, output format.
5. Tap "Compress."
6. Client-side: image is resized on a `<canvas>` to target dimensions, then JPEG quality is adjusted in a loop (binary search) until file size lands inside the target range. Runs in a Web Worker so the UI doesn't freeze on low-end phones.
7. Show result preview, final size, "Download" button.
8. **Edge case:** if the range is unreachable at the given dimensions (e.g. 10KB requested but even lowest quality yields 15KB), show the closest result achieved and a clear message explaining why, with a suggestion (e.g. "reduce dimensions or raise the max size").

### Tool B: PDF Compressor
**Inputs:** single PDF upload, target size range.

**User flow:**
1. Land on `/pdf-compressor`.
2. Upload one PDF. Show current size + page count.
3. Enter target size range.
4. Tap "Compress."
5. Client-side: each page is rendered to canvas at reduced resolution/quality and rebuilt into a new PDF; quality/resolution reduced iteratively until within range.
6. **Important disclosure:** this rasterizes the PDF — any selectable/searchable text becomes an image. Since most exam-form PDFs are scans already, this is usually a non-issue, but the UI must say so clearly before the user compresses.
7. Show result + download; same "closest result" fallback as Tool A if unreachable.

### Tool C: Photo-to-PDF Combiner
This tool's *core function* is combining 2+ images (e.g. photo + signature, sometimes + thumb impression) into a single PDF — so it inherently takes multiple images, unlike Tools A/B which are single-file. Flagging this explicitly so it's not confused with "batch mode."

**User flow:**
1. Land on `/photo-to-pdf`.
2. Upload first image, then "+ Add another" for each additional image (photo, signature, etc.).
3. Reorder via drag if more than one.
4. Optionally set a target PDF size range and page size (A4 default).
5. Tap "Combine & Compress."
6. Client-side: images placed on pages via `jsPDF`; if a target size was set, image quality is iteratively adjusted to land in range.
7. Download.

## 5. Technical Approach
- **Stack:** Next.js (React) — matches existing skills, supports static generation for fast load/good SEO.
- **Processing:** 100% client-side. No files ever reach a server.
  - Image resize/quality loop: Canvas API.
  - PDF compression: `pdf-lib` + canvas rasterization.
  - Image-to-PDF: `jsPDF`.
  - Heavy loops run inside a **Web Worker** to avoid freezing the UI on low-end devices — this is a hard requirement given the target audience's hardware.
- **Hosting:** static hosting (e.g. Vercel/Netlify free tier) — cost stays near-zero regardless of traffic since there's no backend compute.
- **Fallback note:** if client-side PDF compression proves technically insufficient for tricky files, add a narrow server-side path *only* for that case later — don't build backend infra up front.

## 6. Non-Functional Requirements
- Must run smoothly on budget Android phones and slow mobile data (small JS bundle, lazy-load non-critical assets).
- Mobile-first responsive layout (majority of traffic will be mobile).
- Fast first paint — directly affects both SEO ranking and bounce rate.

## 7. Monetization
- Google AdSense (most accessible network for a new site building organic search traffic).
- Placement: banner above the tool, one in-content ad between "upload" and "result" sections, one below the download button. Avoid interstitials — this audience is already anxious about a form deadline; aggressive ads will damage trust and repeat visits.
- AdSense approval requires genuine supporting content — plan for a real Privacy Policy (explicitly stating "your files never leave your browser" — this doubles as a strong trust/marketing point given the sensitivity of ID photos), an About page, and a Contact page.

## 8. Success Metrics (early)
- Organic search impressions/clicks for target long-tail keywords (e.g. "compress photo to 20kb for exam").
- Compression completion rate (uploaded → downloaded) — proxy for whether the tool actually works for real-world files.
- Bounce rate / time-to-first-successful-download.

## 9. Open Questions (not yet decided — flagging rather than assuming)
- **UI language:** English only for v1, or Hindi/regional language toggle from day one? Target audience may skew towards regional language.
- Domain name / branding.
- Whether to add exam-specific quick-preset buttons (e.g. "SSC CGL: 20–50KB") as a fast-follow after generic v1 validates.

## 10. Out of Scope for v1
- Exam-specific presets, batch processing, login/accounts, HEIC support, native mobile app.