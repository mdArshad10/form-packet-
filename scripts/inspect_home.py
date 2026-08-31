from pathlib import Path
import base64
import os

from playwright.sync_api import sync_playwright


_decode_base64 = base64.b64decode


def safe_b64decode(value):
    try:
        return _decode_base64(value)
    except Exception:
        return b""


base64.b64decode = safe_b64decode


def valid_pdf_fixture():
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << >> >>",
        b"<< /Length 0 >>\nstream\n\nendstream",
    ]
    body = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(body))
        body.extend(f"{index} 0 obj\n".encode())
        body.extend(obj)
        body.extend(b"\nendobj\n")
    xref_offset = len(body)
    body.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    body.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        body.extend(f"{offset:010d} 00000 n \n".encode())
    body.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode())
    return bytes(body)


with sync_playwright() as p:
    inspect_path = os.environ.get("INSPECT_PATH", "/")
    page_slug = inspect_path.strip("/").replace("/", "-") or "home"
    browser = p.chromium.launch(
        headless=True,
        args=["--single-process", "--disable-gpu"],
    )
    dist = Path.cwd() / "dist"
    css_path = max((dist / "assets").glob("*.css"), key=lambda path: path.stat().st_mtime)
    js_path = max(
        (
            path
            for path in (dist / "assets").glob("*.js")
            if "Put your photo inside" in path.read_text()
        ),
        key=lambda path: path.stat().st_mtime,
    )
    bundled_page = f"""
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>{css_path.read_text()}</style>
      </head>
      <body>
        <div id="root"></div>
        <script type="module">{js_path.read_text()}</script>
      </body>
    </html>
    """
    def open_bundled_page(page):
        page.route(
            "http://formpack.local/**",
            lambda route: route.fulfill(
                status=200,
                body=bundled_page,
                content_type="text/html",
            ),
        )
        page.goto(f"http://formpack.local{inspect_path}", wait_until="networkidle")

    desktop = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    desktop_errors = []
    desktop.on("console", lambda message: desktop_errors.append(f"console:{message.text}") if message.type == "error" else None)
    desktop.on("pageerror", lambda error: desktop_errors.append(f"pageerror:{error}"))
    open_bundled_page(desktop)
    desktop.screenshot(path=f"/tmp/formpack-{page_slug}-desktop.png", full_page=True)
    print("DESKTOP TITLE:", desktop.title())
    print("DESKTOP H1:", desktop.locator("h1").inner_text())
    print("DESKTOP LINKS:", desktop.locator("a").all_inner_texts())
    print("DESKTOP BODY HEIGHT:", desktop.evaluate("document.body.scrollHeight"))
    if inspect_path == "/photo-compressor":
        desktop.locator("input[type='file']").set_input_files({
            "name": "candidate.png",
            "mimeType": "image/png",
            "buffer": bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000004000101f8e0c2d50000000049454e44ae426082"),
        })
        desktop.wait_for_timeout(120)
        number_inputs = desktop.locator("input[type='number']")
        number_inputs.nth(0).fill("1")
        number_inputs.nth(1).fill("20")
        number_inputs.nth(2).fill("100")
        number_inputs.nth(3).fill("100")
        print("DESKTOP SELECTED FILE:", desktop.locator("[aria-live='polite']").inner_text())
        print("DESKTOP CTA DISABLED:", desktop.get_by_role("button", name="Compress photo").is_disabled())
        desktop.get_by_role("button", name="Compress photo").click()
        desktop.wait_for_selector("img[alt='Compressed photo preview']")
        print("DESKTOP RESULT IMAGE:", desktop.locator("img[alt='Compressed photo preview']").count())
        print("DESKTOP RESULT DOWNLOAD:", desktop.locator("a[download^='formpack-photo']").count())
    if inspect_path == "/pdf-compressor":
        desktop.locator("input[type='file']").set_input_files({
            "name": "candidate.pdf",
            "mimeType": "application/pdf",
            "buffer": valid_pdf_fixture(),
        })
        desktop.wait_for_timeout(120)
        number_inputs = desktop.locator("input[type='number']")
        number_inputs.nth(0).fill("1")
        number_inputs.nth(1).fill("100")
        print("DESKTOP SELECTED FILE:", desktop.locator("[aria-live='polite']").inner_text())
        print("DESKTOP CTA DISABLED:", desktop.get_by_role("button", name="Compress PDF").is_disabled())
        desktop.get_by_role("button", name="Compress PDF").click()
        desktop.wait_for_selector("iframe[title='Compressed PDF preview']")
        print("DESKTOP RESULT PDF:", desktop.locator("iframe[title='Compressed PDF preview']").count())
        print("DESKTOP RESULT DOWNLOAD:", desktop.locator("a[download='formpack-compressed.pdf']").count())
    if inspect_path == "/quick-tools/image-dimensions":
        desktop.locator("input[type='file']").set_input_files({
            "name": "candidate.png",
            "mimeType": "image/png",
            "buffer": bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000004000101f8e0c2d50000000049454e44ae426082"),
        })
        desktop.wait_for_timeout(120)
        number_inputs = desktop.locator("input[type='number']")
        number_inputs.nth(0).fill("100")
        number_inputs.nth(1).fill("100")
        print("DESKTOP SELECTED FILE:", desktop.locator("[aria-live='polite']").inner_text())
        print("DESKTOP CTA DISABLED:", desktop.get_by_role("button", name="Resize image").is_disabled())
        desktop.get_by_role("button", name="Resize image").click()
        desktop.wait_for_selector("img[alt='Resized image preview']")
        print("DESKTOP RESULT IMAGE:", desktop.locator("img[alt='Resized image preview']").count())
        print("DESKTOP RESULT DOWNLOAD:", desktop.locator("a[download^='formpack-resized']").count())
    if inspect_path == "/quick-tools/signature":
        desktop.locator("input[type='file']").set_input_files({
            "name": "signature.png",
            "mimeType": "image/png",
            "buffer": bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000004000101f8e0c2d50000000049454e44ae426082"),
        })
        desktop.wait_for_timeout(120)
        print("DESKTOP SELECTED FILE:", desktop.locator("[aria-live='polite']").inner_text())
        print("DESKTOP CTA DISABLED:", desktop.get_by_role("button", name="Prepare signature").is_disabled())
        desktop.get_by_role("button", name="Prepare signature").click()
        desktop.wait_for_selector("img[alt='Prepared signature preview']")
        print("DESKTOP RESULT IMAGE:", desktop.locator("img[alt='Prepared signature preview']").count())
        print("DESKTOP RESULT DOWNLOAD:", desktop.locator("a[download='formpack-signature.jpg']").count())
    if inspect_path == "/photo-to-pdf":
        desktop.locator("input[type='file']").first.set_input_files([
            {
                "name": "candidate-a.png",
                "mimeType": "image/png",
                "buffer": bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000004000101f8e0c2d50000000049454e44ae426082"),
            },
            {
                "name": "candidate-b.png",
                "mimeType": "image/png",
                "buffer": bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000004000101f8e0c2d50000000049454e44ae426082"),
            },
        ])
        desktop.wait_for_timeout(120)
        print("DESKTOP IMAGE COUNT:", desktop.locator("[draggable='true']").count())
        print("DESKTOP CTA DISABLED:", desktop.get_by_role("button", name="Combine & compress").is_disabled())
        desktop.get_by_role("button", name="Move candidate-a.png down").click()
        print("DESKTOP FIRST ROW AFTER REORDER:", desktop.locator("[draggable='true']").first.inner_text())
        desktop.get_by_role("button", name="Combine & compress").click()
        desktop.wait_for_selector("iframe[title='Combined PDF preview']")
        print("DESKTOP RESULT PDF:", desktop.locator("iframe[title='Combined PDF preview']").count())
        print("DESKTOP RESULT DOWNLOAD:", desktop.locator("a[download='formpack-images.pdf']").count())
        desktop.get_by_role("button", name="Remove candidate-a.png").click()
        print("DESKTOP IMAGE COUNT AFTER REMOVE:", desktop.locator("[draggable='true']").count())
    if inspect_path == "/prepare/file/photo":
        desktop.goto("http://formpack.local/prepare/files", wait_until="networkidle")
        desktop.locator("input[type='file']").first.set_input_files({
            "name": "candidate.jpg",
            "mimeType": "image/jpeg",
            "buffer": bytes.fromhex("ffd8ffe000104a46494600010100004800480000ffe1004c4578696600004d4d002a00000008000187690004000000010000001a000000000003a00100030000000100010000a00200040000000100000001a0030004000000010000000100000000ffed003850686f746f73686f7020332e30003842494d04040000000000003842494d0425000000000010d41d8cd98f00b204e9800998ecf8427effc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a1a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a63646566676869797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffdb004300020202020202030202030503030305060505050506080606060606080a0808080808080a0a0a0a0a0a0a0a0a0a0a0c0c0c0c0c0c0e0e0e0e0e0f0f0f0f0f0f0f0f0f0f0f0f0fffdb00430102020204040407040407100b090b1010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010ffdd00040001ffda000c03010002110311003f00fd78a28a2bb0e73fffd9"),
        })
        desktop.wait_for_timeout(120)
        desktop.locator("input[type='file']").first.set_input_files({
            "name": "candidate.jpg",
            "mimeType": "image/jpeg",
            "buffer": base64.b64decode("/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDAwMDA4ODg4ODw8PDw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A/Xiiiiuw5z//2Q=="),
        })
        desktop.wait_for_timeout(120)
        jpeg_data = desktop.evaluate("""() => {
            const canvas = document.createElement('canvas')
            canvas.width = 160
            canvas.height = 200
            const context = canvas.getContext('2d')
            context.fillStyle = '#eef2f4'
            context.fillRect(0, 0, 160, 200)
            context.fillStyle = '#d9573f'
            context.fillRect(18, 18, 124, 164)
            context.fillStyle = '#f9d3a7'
            context.beginPath()
            context.arc(80, 75, 26, 0, Math.PI * 2)
            context.fill()
            context.fillStyle = '#10212d'
            context.fillRect(47, 122, 66, 38)
            return canvas.toDataURL('image/jpeg').split(',')[1]
        }""")
        desktop.locator("input[type='file']").first.set_input_files({
            "name": "candidate.jpg",
            "mimeType": "image/jpeg",
            "buffer": base64.b64decode(jpeg_data),
        })
        desktop.wait_for_timeout(120)
        desktop.locator("a.inspect-link").first.click()
        desktop.wait_for_timeout(120)
        print("DESKTOP WORKSPACE H1 AFTER FILE:", desktop.locator("h1").inner_text())
        print("DESKTOP LOCAL PREVIEW COUNT:", desktop.locator("img[alt='Photo candidate preview']").count())
        print("DESKTOP READY CTA DISABLED:", desktop.get_by_role("button", name="Mark file as ready").is_disabled())
        desktop.get_by_role("button", name="Mark file as ready").click()
        print("DESKTOP READY STATE:", desktop.get_by_role("button", name="File marked ready").count())
        desktop.screenshot(path=f"/tmp/formpack-{page_slug}-selected-desktop.png", full_page=True)
    if inspect_path == "/prepare/download":
        desktop.goto("http://formpack.local/prepare/files", wait_until="networkidle")
        jpeg_data = desktop.evaluate("""() => {
            const canvas = document.createElement('canvas')
            canvas.width = 160
            canvas.height = 200
            const context = canvas.getContext('2d')
            context.fillStyle = '#d9573f'
            context.fillRect(0, 0, 160, 200)
            return canvas.toDataURL('image/jpeg').split(',')[1]
        }""")
        jpeg_file = {
            "name": "candidate.jpg",
            "mimeType": "image/jpeg",
            "buffer": base64.b64decode(jpeg_data),
        }
        desktop.locator("input[type='file']").nth(0).set_input_files(jpeg_file)
        desktop.locator("input[type='file']").nth(1).set_input_files({
            "name": "signature.jpg",
            "mimeType": "image/jpeg",
            "buffer": base64.b64decode(jpeg_data),
        })
        desktop.locator("input[type='file']").nth(2).set_input_files({
            "name": "certificate.pdf",
            "mimeType": "application/pdf",
            "buffer": b"%PDF-1.4\nFormPack audit file\n",
        })
        desktop.wait_for_timeout(400)
        print("DESKTOP INSPECT LINKS BEFORE FLOW:", desktop.locator("a.inspect-link").count())
        print("DESKTOP LEDGER:", desktop.locator(".upload-ledger").inner_text())
        for index in range(3):
            desktop.locator("a.inspect-link").nth(index).click()
            print("DESKTOP URL AFTER INSPECT:", desktop.url)
            print("DESKTOP READY BUTTONS:", desktop.get_by_role("button", name="Mark file as ready").count())
            desktop.get_by_role("button", name="Mark file as ready").click()
            desktop.wait_for_timeout(80)
            if index < 2:
                desktop.get_by_role("link", name="Replace file").click()
                desktop.wait_for_timeout(80)
        desktop.get_by_role("link", name="Review the complete pack →").click()
        desktop.wait_for_timeout(120)
        desktop.get_by_role("link", name="Continue to download").click()
        desktop.wait_for_timeout(120)
        print("DESKTOP BUILD ZIP ENABLED:", not desktop.get_by_role("button", name="Build ZIP locally").is_disabled())
        desktop.get_by_role("button", name="Build ZIP locally").click()
        desktop.wait_for_timeout(160)
        print("DESKTOP ZIP DOWNLOAD LINK:", desktop.locator("a[download='formpack-application-pack.zip']").count())
        desktop.screenshot(path=f"/tmp/formpack-{page_slug}-ready-desktop.png", full_page=True)
    if inspect_path == "/fix":
        desktop.get_by_role("link", name="File is too large").click()
        desktop.get_by_label("Minimum (KB)").fill("20")
        desktop.get_by_label("Maximum (KB)").fill("50")
        desktop.get_by_label("Dimensions or page rule").fill("600 × 800 px")
        desktop.get_by_label("Required filename").fill("photo.jpg")
        desktop.get_by_role("link", name="Continue to file").click()
        jpeg_data = desktop.evaluate("""() => {
            const canvas = document.createElement('canvas')
            canvas.width = 160
            canvas.height = 200
            const context = canvas.getContext('2d')
            context.fillStyle = '#d9573f'
            context.fillRect(0, 0, 160, 200)
            return canvas.toDataURL('image/jpeg').split(',')[1]
        }""")
        desktop.locator("input[type='file']").set_input_files({
            "name": "rejected.jpg",
            "mimeType": "image/jpeg",
            "buffer": base64.b64decode(jpeg_data),
        })
        desktop.wait_for_timeout(120)
        desktop.get_by_role("link", name="Review the correction").click()
        desktop.wait_for_timeout(120)
        print("DESKTOP FIX RESULT H1:", desktop.locator("h1").inner_text())
        print("DESKTOP FIX TOOL LINK:", desktop.get_by_role("link", name="Open a focused tool").count())
        desktop.screenshot(path=f"/tmp/formpack-{page_slug}-result-desktop.png", full_page=True)

    browser.close()
    print("DESKTOP BROWSER ERRORS:", desktop_errors)
    browser = p.chromium.launch(
        headless=True,
        args=["--single-process", "--disable-gpu"],
    )
    mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    mobile_errors = []
    mobile.on("console", lambda message: mobile_errors.append(f"console:{message.text}") if message.type == "error" else None)
    mobile.on("pageerror", lambda error: mobile_errors.append(f"pageerror:{error}"))
    open_bundled_page(mobile)
    mobile.screenshot(path=f"/tmp/formpack-{page_slug}-mobile.png", full_page=True)
    print("MOBILE BODY HEIGHT:", mobile.evaluate("document.body.scrollHeight"))
    print("MOBILE H1:", mobile.locator("h1").inner_text())
    print("MOBILE OVERFLOW:", mobile.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    print("MOBILE BROWSER ERRORS:", mobile_errors)

    browser.close()
