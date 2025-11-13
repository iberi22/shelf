# Shelf. Advertising Setup Guide

This document outlines the strategy and technical steps to implement real advertising in the Shelf. application using Google AdSense.

## Monetization Strategy

The application will display ads to two groups of users:
1.  **Anonymous Users:** Users who have not created an account. Their data is stored locally.
2.  **Free Tier Users:** Users who have created an account but have not subscribed to a Pro plan.

**Pro Tier Users** will have an ad-free experience as a key benefit of their subscription.

## Ad Placement

The ad placements are designed to be non-intrusive while still providing visibility.

1.  **Desktop:** A fixed vertical banner column on the left side of the screen (`DesktopAdColumn`). This is always visible on wider screens without interfering with the main content.
2.  **Mobile:** Two horizontal banner bars (`MobileAdBars`), one at the top and one at the bottom of the main app container. This frames the content on smaller screens.

## Technical Implementation Steps

### Step 1: Set Up a Google AdSense Account

1.  Go to the [Google AdSense](https://www.google.com/adsense/start/) website and sign up with your Google account.
2.  Follow the instructions to add your website (the URL where you will host Shelf.). AdSense will need to review and approve your site. This can take a few days.
3.  Once approved, you will get access to your AdSense dashboard.

### Step 2: Create Ad Units in AdSense

You will need to create at least two "Display ad" units:

1.  **Vertical Skyscraper Unit:**
    -   Go to **Ads > Ad units > New ad unit**.
    -   Select **Display ads**.
    -   Give it a name, e.g., "Shelf Desktop Sidebar".
    -   For ad size, choose **Responsive**.
    -   Click **Create**.
    -   AdSense will give you a code snippet. From this, you only need two pieces of information:
        -   Your publisher ID (`data-ad-client`), which looks like `ca-pub-XXXXXXXXXXXXXXXX`.
        -   The ad slot ID (`data-ad-slot`), which is a 10-digit number.
    -   Save the ad slot ID for the `DesktopAdColumn`.

2.  **Horizontal Banner Unit:**
    -   Create another Display ad unit.
    -   Name it something like "Shelf Mobile Banner".
    -   Choose **Responsive** for the ad size.
    -   Click **Create**.
    -   Save the new ad slot ID for the `MobileAdBars`.

### Step 3: Update the Application Code

The application has already been prepared with placeholder components. You just need to insert your actual AdSense IDs.

1.  **Update `index.html`:**
    -   Find the AdSense script tag in the `<head>`.
    -   Replace `ca-pub-XXXXXXXXXXXXXXXX` with your actual **Publisher ID**.
    ```html
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=YOUR_PUBLISHER_ID" crossorigin="anonymous"></script>
    ```

2.  **Update `components/Ads.tsx`:**
    -   Open the `components/Ads.tsx` file.
    -   Replace the placeholder IDs at the top of the file with the values you got from AdSense.
    ```typescript
    // Replace these placeholder values with your actual AdSense IDs.
    const AD_CLIENT_ID = "ca-pub-XXXXXXXXXXXXXXXX"; // Your Publisher ID
    const DESKTOP_AD_SLOT_ID = "YYYYYYYYYY";       // Slot ID for "Shelf Desktop Sidebar"
    const MOBILE_AD_SLOT_ID = "ZZZZZZZZZZ";        // Slot ID for "Shelf Mobile Banner"
    ```

### Step 4: Testing and Deployment

-   **Local Development:** AdSense ads will **not** show up on `localhost`. The `AdSenseUnit.tsx` component is designed to show a placeholder box with the text `[AdSense Dev Placeholder]` when you are in a development environment. This allows you to check the layout without needing live ads.
-   **Production:** Once you deploy your application to the URL you registered with AdSense, the ads should start appearing automatically (it can sometimes take a little while for them to go live).
-   **`ads.txt`:** AdSense may ask you to add an `ads.txt` file to the root of your domain for security. Follow their instructions and place the file in the same directory as your `index.html`.

By following these steps, you will have a professional advertising system integrated into Shelf., providing a revenue stream from your free users.