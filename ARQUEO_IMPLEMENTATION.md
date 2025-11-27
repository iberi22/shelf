# OCR Invoice Scanning & Accounting (Arqueo) - Implementation Guide

## Overview

This document describes the implementation of the OCR Invoice Scanning and Accounting (Arqueo) feature for the Shelf. application. This Pro/Pyme-only feature allows users to scan handwritten invoices, extract data via OCR, confirm values, and automatically create inventory items from invoice line items.

## Architecture

### Technology Stack

- **OCR Engine**: Google Gemini 2.5 Flash Vision API
- **Image Capture**: html5-qrcode library (adapted for photo capture)
- **Backend**: Firebase Cloud Functions
- **Storage**: localStorage (session data) + Firestore (cloud sync)
- **Frontend**: React + TypeScript

### Cost Analysis

**Gemini Vision API Pricing:**
- Input (images): $0.30 per 1M tokens (~$0.0001-0.001 per invoice)
- Output: $2.50 per 1M tokens
- **Total per invoice**: ~$0.0002 (effectively negligible)

**Why Gemini over DeepSeek?**
- Already integrated in the application
- Excellent handwritten text recognition
- Structured JSON output support
- No additional credentials needed
- Free tier for development

## Implementation Details

### 1. Type Definitions (`types.ts`)

```typescript
// Invoice line items from OCR
interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  confidence: number; // 0-1 confidence score
}

// Extracted invoice data
interface ExtractedInvoiceData {
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  items: InvoiceLineItem[];
  subtotal?: number;
  tax?: number;
  total?: number;
}

// OCR processing result
interface InvoiceOCRResult {
  id: string;
  imageUrl: string; // Base64 or Firebase Storage URL
  extractedData: ExtractedInvoiceData;
  rawOCRText?: string;
  status: 'pending' | 'reviewed' | 'applied';
  createdAt: string;
  appliedToPurchaseOrderId?: string;
  userId?: string;
}

// Confirmed invoice in accounting session
interface ScannedInvoice {
  id: string;
  ocrResultId: string;
  confirmedData: ExtractedInvoiceData;
  createdAt: string;
  appliedAt?: string;
}

// Accounting session for batch processing
interface ArqueoSession {
  id: string;
  createdAt: string;
  invoices: ScannedInvoice[];
  createdProducts: string[]; // Product IDs created from invoices
  status: 'open' | 'closed';
}
```

### 2. Cloud Function (`functions/src/index.ts`)

**Endpoint**: `/api/extractInvoice` (POST)

**Request Body:**
```typescript
{
  imageBase64: string;      // Image data URI
  mimeType: string;         // "image/jpeg", "image/png", etc.
  existingProducts: Array<{ id: string; name: string; sku?: string }>;
}
```

**Response:**
```typescript
{
  success: boolean;
  extractedData: ExtractedInvoiceData;
  rawResponse: string;
}
```

**Key Features:**
- Verifies Firebase ID token
- Checks Pro/Pyme subscription tier
- Calls Gemini 2.5 Flash with vision capabilities
- Returns structured JSON via `responseMimeType: 'application/json'`
- Handles markdown code blocks in response parsing
- Passes existing products for AI to match against

### 3. UI Components

#### `InvoiceScannerModal.tsx`

Modal with two modes:
1. **Camera Mode**: Uses Html5Qrcode to access device camera and capture still frames
2. **Upload Mode**: File input for selecting images from device

Features:
- Responsive camera preview
- File size validation (max 5MB)
- File type validation (PNG, JPEG, WEBP)
- Error handling for camera access failures

#### `InvoiceConfirmationModal.tsx`

Allows users to review and edit extracted invoice data:
- **Editable Fields**: Description, quantity, unit price, total, confidence scores
- **Supplier Info**: Supplier name, invoice number, invoice date
- **Summary Section**: Subtotal, tax, total (with highlighted total field)
- **Mandatory Confirmation**: User must confirm total before saving
- **Scrollable**: Max height with overflow for long invoices

#### `Arqueo.tsx`

Main accounting page (Pro/Pyme only):
- **Active Session View**: Shows all scanned invoices in current session
  - Supplier name, invoice number, date
  - Total amount and item count
  - Item preview (first 3 items, with count of remaining)
- **Session Actions**:
  - Add Another Invoice
  - Apply to Inventory (creates products/updates quantities)
  - Close Session
- **Previous Sessions**: Historical list of closed sessions with totals

### 4. Data Flow

```
User scans/uploads invoice image
           ↓
InvoiceScannerModal captures image as base64
           ↓
extractInvoice Cloud Function called with base64
           ↓
Gemini Vision API extracts structured data
           ↓
InvoiceConfirmationModal displays extracted data
           ↓
User edits values and confirms total
           ↓
ScannedInvoice added to current ArqueoSession
           ↓
User applies session to inventory
           ↓
Products created/updated based on invoice items
           ↓
ArqueoSession marked as closed and saved
```

### 5. State Management

**AppContext (Redux Pattern):**
- `ADD_PRODUCT`: Creates new product from invoice item
- `UPDATE_PRODUCT`: Updates existing product quantity

**Local State (Arqueo.tsx):**
- `currentSession`: Active ArqueoSession
- `sessions`: Closed ArqueoSession history
- `ocrResults`: Raw OCR results for audit trail

**Storage:**
- localStorage: Session data (arqueo_sessions, invoice_ocr_results)
- Firestore: Cloud sync for Pro users (future enhancement)

### 6. Navigation

**Updated Files:**
- `constants.ts`: Added `{ nameKey: 'nav.arqueo', icon: '📋' }` to NAV_ITEMS
- `locales/*.json`: Added translations for 'nav.arqueo' in EN, ES, PT
- `MainApp.tsx`: Added case for 'nav.arqueo' routing

**Pro Gating:**
- Feature only visible if `isPro || isPyme`
- Shows "Pro Feature" message if accessed by free users

## Usage Workflow

### For Users

1. **Open Arqueo page** from sidebar navigation
2. **Start New Session** and scan first invoice
3. **Choose capture method**: Take photo with camera or upload image file
4. **Review & edit** extracted data in confirmation modal
5. **Confirm total amount** (mandatory checkbox)
6. **Add more invoices** or apply session to inventory
7. **Create products**: Items from invoice become inventory products
8. **Close session**: Saves accounting history

### For Developers

#### Testing the OCR Function Locally

```bash
# 1. Get Firebase ID token (from authenticated user)
# 2. Prepare invoice image as base64
# 3. Call function

curl -X POST http://localhost:5000/api/extractInvoice \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ID_TOKEN" \
  -d '{
    "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "mimeType": "image/jpeg",
    "existingProducts": []
  }'
```

#### Deploying Cloud Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

#### Environment Variables

Set in Google Cloud Console (Cloud Functions):
- `API_KEY`: Gemini API key (same as existing)
- `STRIPE_SECRET_KEY`: (existing)
- `STRIPE_WEBHOOK_SECRET`: (existing)

## Future Enhancements

### Phase 2: Cloud Persistence
- [ ] Store invoice images in Firebase Storage
- [ ] Sync OCR results to Firestore for audit trail
- [ ] Multi-device access to OCR history

### Phase 3: Advanced Features
- [ ] Automatic product matching with fuzzy search
- [ ] Barcode validation for scanned items
- [ ] Bulk invoice import from supplier portal
- [ ] Invoice template learning (recognize specific supplier formats)
- [ ] Duplicate detection (prevent same invoice from being scanned twice)
- [ ] Integration with Purchase Orders (auto-link scanned invoices to POs)

### Phase 4: Analytics
- [ ] Supplier spend tracking from invoices
- [ ] Historical cost trends
- [ ] Arqueo reports and reconciliation

## Error Handling

### Camera Access Errors
- "No camera found on this device"
- "Failed to access camera. Please check permissions."
- Handle gracefully, suggest file upload fallback

### OCR Extraction Errors
- Network errors: Retry logic
- Invalid JSON parsing: Display raw response for debugging
- Gemini API errors: Show user-friendly message

### Validation Errors
- File too large (>5MB)
- Invalid file type (must be image)
- Missing required fields after OCR

## Testing Checklist

- [ ] Camera capture on mobile device
- [ ] File upload on desktop
- [ ] OCR extraction with handwritten invoices
- [ ] Data confirmation flow
- [ ] Product creation from invoice items
- [ ] Session persistence
- [ ] Pro-only gating
- [ ] Error handling for failed OCR
- [ ] Large invoice processing (50+ items)
- [ ] Multiple sessions management

## Performance Considerations

- **Image Size**: Limit to 5MB per invoice
- **OCR Latency**: ~2-5 seconds per invoice (network dependent)
- **Batch Processing**: Can process multiple invoices per session without issues
- **Storage**: Base64 images in localStorage add ~500KB per invoice (consider Cloud Storage later)

## Security & Privacy

- Gemini API receives base64-encoded images
- No PII stored beyond what user explicitly confirms
- Firebase security rules protect Firestore data
- Images stored locally (device only) unless synced to Cloud Storage
- Pro subscription verified on backend before processing

## Support & Debugging

### Common Issues

**Q: OCR not extracting all items**
- A: Handwriting may be unclear. Ensure good lighting and image quality.

**Q: Confidence scores too low**
- A: User can manually adjust values in confirmation modal.

**Q: Products not created after applying session**
- A: Check product names against existing inventory. Duplicates are updated instead.

**Q: Camera not working**
- A: Check browser permissions. Fall back to file upload.

## Files Modified/Created

### New Files
- `components/InvoiceScannerModal.tsx`
- `components/InvoiceConfirmationModal.tsx`
- `components/Arqueo.tsx`

### Modified Files
- `types.ts` - Added invoice/arqueo types
- `functions/src/index.ts` - Added extractInvoice function
- `firebase.json` - Added /api/extractInvoice rewrite
- `constants.ts` - Added nav item
- `locales/en.json`, `locales/es.json`, `locales/pt.json` - Added translations
- `MainApp.tsx` - Added Arqueo routing
- `context/AppContext.tsx` - Added useApp alias

## Conclusion

The OCR Invoice Scanning feature provides a powerful tool for Pro users to quickly import inventory from handwritten invoices without manual data entry. The implementation is cost-effective using Gemini 2.5 Flash, extensible for future cloud sync, and user-friendly with mandatory confirmations to ensure data accuracy.
