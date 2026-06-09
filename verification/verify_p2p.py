from playwright.sync_api import sync_playwright
import os
import time

def run_cuj(page):
    # 1. Navigate to the app and skip the landing page
    page.goto("http://localhost:5173")
    page.wait_for_timeout(2000)

    # Click "Empieza Gratis"
    try:
        page.get_by_role("button", name="Empieza Gratis").click()
    except:
        pass

    page.wait_for_timeout(1000)

    # Handle Welcome Modal
    try:
        page.get_by_role("button", name="Continuar").click()
    except:
        pass
    page.wait_for_timeout(1000)

    # 2. Go to Settings
    try:
        page.get_by_text("Configuración").click()
    except:
        # If English
        page.get_by_text("Settings").click()
    page.wait_for_timeout(1000)

    # 3. Verify P2P Sync section is there
    # It might be English or Spanish depending on the browser settings in the sandbox
    try:
        page.get_by_text("Secure P2P Sync (Post-Quantum)").scroll_into_view_if_needed()
    except:
        page.get_by_text("P2P Synchronization").scroll_into_view_if_needed()

    page.wait_for_timeout(1000)

    # 4. Interact with "Share Access"
    try:
        page.get_by_role("button", name="📱 Share Access (Secure QR)").click()
    except:
        page.get_by_role("button", name="📱 Share My Access (QR)").click()
    page.wait_for_timeout(1000)

    # Take screenshot of the QR code
    page.screenshot(path="verification/screenshots/p2p_qr.png")
    page.wait_for_timeout(1000)

    # 5. Open Scanner
    try:
        page.get_by_role("button", name="📷 Scan & Link Device").click()
    except:
        page.get_by_role("button", name="📷 Scan Colleague QR").click()
    page.wait_for_timeout(1000)

    # Take screenshot of the Scanner Modal
    page.screenshot(path="verification/screenshots/p2p_scanner.png")
    page.wait_for_timeout(1000)

    # Close scanner
    try:
        page.get_by_role("button", name="Cancel").click()
    except:
        page.get_by_role("button", name="Cancelar").click()
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
