from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto("http://localhost:5173")
    page.wait_for_timeout(2000)

    # 1. Click "Start for Free"
    page.get_by_role("button", name="Start for Free").click()
    page.wait_for_timeout(2000)

    # 2. Handle Welcome Modal if it appears
    try:
        page.get_by_role("button", name="Continue").click()
        page.wait_for_timeout(1000)
    except:
        pass

    # 3. Go to Settings
    # Try finding the settings link in the sidebar
    page.get_by_text("Settings").last.click()
    page.wait_for_timeout(2000)

    # 4. Scroll to P2P section
    page.get_by_text("Secure P2P Sync (Post-Quantum)").scroll_into_view_if_needed()
    page.wait_for_timeout(1000)

    # 5. Share Access
    page.get_by_role("button", name="📱 Share Access (Secure QR)").click()
    page.wait_for_timeout(1000)
    page.screenshot(path="verification/screenshots/p2p_qr.png")

    # 6. Open Scanner
    page.get_by_role("button", name="📷 Scan & Link Device").click()
    page.wait_for_timeout(1000)
    page.screenshot(path="verification/screenshots/p2p_scanner.png")

    # 7. Close Scanner
    page.get_by_role("button", name="Cancel").click()
    page.wait_for_timeout(1000)
    page.screenshot(path="verification/screenshots/final_state.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(record_video_dir="verification/videos")
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
